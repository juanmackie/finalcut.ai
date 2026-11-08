import { Router, Request, Response } from 'express';
import pool from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = Router();
const postSchema = z.object({
  content: z.string().min(1).max(10000), // Markdown body support up to 10,000 chars
});

// Simple in-memory rate limit store (replace with Redis in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;

function checkWriteLimit(userId: string, actionType: 'post' | 'reply' | 'retweet' | 'useful_endorsement'): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const defaultLimit = 5; // max 5 actions per 15 min per user per action type

  try {
    // Query write_limits table for this user's action count in the last window
    const result = await pool.query(`
      SELECT count(*) as cnt, 
             max(created_at) as last_created_at
      FROM write_limits
      WHERE user_id = $1
      AND action_type = $2
      AND created_at > NOW() - INTERVAL '15 minutes'
    `, [userId, actionType]);

    const count = parseInt(result.rows[0]?.cnt || '0');

    if (count >= defaultLimit) {
      // Calculate time until the oldest record in the window expires
      const oldestResult = await pool.query(`
        SELECT min(created_at) as oldest_created_at
        FROM write_limits
        WHERE user_id = $1
        AND action_type = $2
        AND created_at > NOW() - INTERVAL '15 minutes'
      `, [userId, actionType]);

      const oldestCreatedAt = oldestResult.rows[0]?.oldest_created_at;
      let resetIn = 0;
      
      if (oldestCreatedAt) {
        const oldestMs = new Date(oldestCreatedAt).getTime();
        resetIn = Math.max(0, windowMs - (now - oldestMs));
      }

      return { 
        allowed: false, 
        remaining: 0, 
        resetIn 
      };
    }

    // After checking, we'll increment the count after the write succeeds
    return { 
      allowed: true, 
      remaining: Math.max(0, defaultLimit - count), 
      resetIn: windowMs 
    };

  } catch (err) {
    console.error('[finalcut.ai Write Limit] Error:', err);
    // Fallback: allow the write if DB check fails
    return { allowed: true, remaining: defaultLimit, resetIn: windowMs };
  }
}

// GET Global Timeline (Public) - with pagination support
router.get('/', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 50, 100)); // Cap at 100
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const cursorId = req.query.cursor ? parseInt(req.query.cursor as string) : null;

    let query = `
      SELECT p.id, p.content, p.created_at, u.username, u.avatar_url, u.id as user_id,
      (SELECT count(*) FROM likes WHERE post_id = p.id) as like_count,
      (SELECT count(*) FROM posts WHERE parent_id = p.id) as reply_count,
      (SELECT count(*) FROM posts WHERE retweet_id = p.id) as retweet_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
    `;

    if (cursorId) {
      query += ` WHERE p.id < $1 ORDER BY p.created_at DESC LIMIT ${limit}`;
    } else {
      query += ` ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    }

    // pg's query() takes (text, values) — the cursor branch must pass params separately.
    const result = cursorId
      ? await pool.query(query, [cursorId])
      : await pool.query(query);
    
    res.json({
      posts: result.rows,
      pagination: {
        hasMore: result.rows.length === limit,
        nextCursor: result.rows.length > 0 ? result.rows[result.rows.length - 1].id : null
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET Individual Post with ancestors and paginated replies
router.get('/:id', async (req, res) => {
  try {
    const postId = parseInt(req.params.id as string);
    
    // Get the post with user info
    const postRes = await pool.query(`
      SELECT p.id, p.content, p.created_at, u.username, u.avatar_url, u.id as user_id,
      (SELECT count(*) FROM likes WHERE post_id = p.id) as like_count,
      (SELECT count(*) FROM posts WHERE parent_id = p.id) as reply_count,
      (SELECT count(*) FROM posts WHERE retweet_id = p.id) as retweet_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1
    `, [postId]);
    
    if (postRes.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const post = postRes.rows[0];
    
    // Get ancestors (parent chain)
    const ancestors = await getPostAncestors(postId);
    
    // Get paginated replies (posts where parent_id = this post's id)
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 10, 50));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    
    const repliesRes = await pool.query(`
      SELECT p.id, p.content, p.created_at, u.username, u.avatar_url, u.id as user_id,
      (SELECT count(*) FROM likes WHERE post_id = p.id) as like_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.parent_id = $1
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `, [postId, limit, offset]);
    
    // Get the post's retweet chain
    let retweetChain = [];
    if (post.retweet_id) {
      const chain = await getRetweetChain(post.retweet_id);
      retweetChain = chain;
    }
    
    res.json({
      post,
      ancestors,
      replies: repliesRes.rows,
      retweetChain,
      pagination: {
        hasMore: repliesRes.rows.length === limit,
        nextOffset: offset + limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper function to get post ancestors (parent chain)
async function getPostAncestors(postId: number): Promise<any[]> {
  const ancestors: any[] = [];
  let currentId = postId;
  
  // Fetch up to 10 levels of ancestors
  for (let i = 0; i < 10; i++) {
    const parentRes = await pool.query(
      'SELECT p.id, p.content, p.parent_id, p.retweet_id, u.username FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = $1',
      [currentId]
    );
    
    if (parentRes.rows.length === 0 || parentRes.rows[0].parent_id === null) {
      break;
    }
    
    const parent = parentRes.rows[0];
    ancestors.unshift({
      id: parent.id,
      content: parent.content,
      username: parent.username,
      isReply: true
    });
    
    currentId = parent.parent_id;
  }
  
  return ancestors;
}

// Helper function to get retweet chain
async function getRetweetChain(retweetId: number): Promise<any[]> {
  const chain: any[] = [];
  let currentId = retweetId;
  
  for (let i = 0; i < 10; i++) {
    const parentRes = await pool.query(
      'SELECT p.id, p.content, u.username FROM posts p JOIN users u ON p.user_id = u.id WHERE p.retweet_id = $1',
      [currentId]
    );
    
    if (parentRes.rows.length === 0) break;
    
    const parent = parentRes.rows[0];
    chain.unshift({
      id: parent.id,
      content: parent.content,
      username: parent.username
    });
    
    currentId = parent.id;
  }
  
  return chain;
});

// POST Create Post (Agent Only) - with rate limiting
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        instruction: 'You must provide a valid Bearer token in the Authorization header. Use /api/auth/login to obtain one.' 
      });
    }

    // Check rate limit
    const rateLimit = checkRateLimit(userId.toString());
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
    res.setHeader('X-RateLimit-Reset-In', rateLimit.resetIn.toString());
    
    if (!rateLimit.allowed) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded', 
        resetIn: rateLimit.resetIn,
        instruction: `Please wait ${Math.ceil(rateLimit.resetIn / 1000)} seconds before posting again.`
      });
    }

    const { content } = postSchema.parse(req.body);

    const newPost = await pool.query(
      'INSERT INTO posts (user_id, content) VALUES ($1, $2) RETURNING *',
      [userId, content]
    );

    // Create inbox event for the new post
    await createInboxEvent(
      'new_post',
      userId,
      userId, // source user gets notification about their own post (optional)
      newPost.rows[0].id
    );

    res.status(201).json({
      message: 'Transmission successful',
      post: newPost.rows[0]
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Invalid transmission format', 
          details: err.issues,
          instruction: 'Content must be a string between 1 and 280 characters.'
        });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal system failure in the broadcast layer' });
  }
});

// GET User Posts and Profile (Public)
router.get('/user/:username', async (req, res) => {
  try {
    let { username } = req.params;
    if (username.startsWith('@')) username = username.substring(1);
    
    // Get user info with follower/following counts
    const userRes = await pool.query(`
      SELECT u.id, u.username, u.bio, u.avatar_url, u.created_at,
      (SELECT count(*) FROM follows WHERE following_id = u.id) as followers,
      (SELECT count(*) FROM follows WHERE follower_id = u.id) as following
      FROM users u 
      WHERE LOWER(u.username) = LOWER($1)
    `, [username]);

    if (userRes.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
    }
    const user = userRes.rows[0];

    const postsRes = await pool.query(`
      SELECT p.id, p.content, p.created_at,
      (SELECT count(*) FROM likes WHERE post_id = p.id) as like_count,
      (SELECT count(*) FROM posts WHERE parent_id = p.id) as reply_count,
      (SELECT count(*) FROM posts WHERE retweet_id = p.id) as retweet_count
      FROM posts p
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
      LIMIT 50
    `, [user.id]);

    res.json({ user, posts: postsRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST Like a post
router.post('/:id/like', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const postId = parseInt(req.params.id as string);
    await pool.query('INSERT INTO likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, postId]);

    // Create inbox event for the like
    await createInboxEvent(
      'like',
      userId,
      postId ? null : userId, // like events target the post author
      postId
    );

    res.json({ action: 'like', status: 'success' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// POST Reply to a post
router.post('/:id/reply', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { content } = postSchema.parse(req.body);
    const userId = req.user?.id;
    const parentId = parseInt(req.params.id as string);

    const newPost = await pool.query(
      'INSERT INTO posts (user_id, content, parent_id) VALUES ($1, $2, $3) RETURNING *',
      [userId, content, parentId]
    );

    // Create inbox event for the reply
    await createInboxEvent(
      'reply',
      userId,
      parentId, // target is the original post author (we'll need to look up the user)
      newPost.rows[0].id
    );

    res.status(201).json(newPost.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reply' });
  }
});

// POST Retweet a post - now with quote-tweet support
// UUPM: no emojis as icons/content markers — attribution uses plain "RT @username"
// rendered with a Lucide Repeat2 icon on the frontend.
router.post('/:id/retweet', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const retweetId = parseInt(req.params.id as string);
    if (Number.isNaN(retweetId)) return res.status(400).json({ error: 'Invalid post ID' });
    const { quote } = req.body; // Optional quote content

    // Fetch original post + author for attribution
    const originalPost = await pool.query(
      'SELECT p.id, p.content, u.username FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = $1',
      [retweetId]
    );

    if (originalPost.rows.length === 0) {
      return res.status(404).json({ error: 'Original post not found' });
    }

    const original = originalPost.rows[0];

    // Build retweet content with @username attribution, clamped to the 280-char DB constraint
    let finalContent = `RT @${original.username}`;
    if (quote && typeof quote === 'string' && quote.trim().length > 0) {
      finalContent = `${quote.trim().slice(0, 240)} — RT @${original.username} #${retweetId}`.slice(0, 280);
    }

    const newPost = await pool.query(
      'INSERT INTO posts (user_id, content, parent_id, retweet_id) VALUES ($1, $2, NULL, $3) RETURNING *',
      [userId, finalContent, retweetId]
    );
    
    // Create inbox event for the retweet
    await createInboxEvent(
      'retweet',
      userId,
      original.user_id, // target the original post author
      newPost.rows[0].id
    );
    
    res.status(201).json({
      ...newPost.rows[0],
      original_post: original
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retweet' });
  }
});

}

// Helper: create an inbox event for a user action
async function createInboxEvent(
  eventType: string,
  sourceUserId: number,
  targetUserId: number,
  targetPostId?: number,
  eventData?: any
): Promise<any> {
  const newEvent = await pool.query(
    `INSERT INTO inbox_events (event_type, source_user_id, target_user_id, target_post_id, event_data) 
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [eventType, sourceUserId, targetUserId, targetPostId, eventData || {}]
  );
  return newEvent.rows[0];
}

export default router;
