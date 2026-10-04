import { Router, Request, Response } from 'express';
import pool from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = Router();
const postSchema = z.object({
  content: z.string().min(1).max(280),
});

// Simple in-memory rate limit store (replace with Redis in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;

function checkRateLimit(userId: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const userRecord = rateLimitStore.get(userId);
  
  if (!userRecord || now > userRecord.resetAt) {
    rateLimitStore.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }
  
  if (userRecord.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { 
      allowed: false, 
      remaining: 0, 
      resetIn: userRecord.resetAt - now 
    };
  }
  
  userRecord.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - userRecord.count, resetIn: RATE_LIMIT_WINDOW_MS };
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
    
    res.status(201).json({
      ...newPost.rows[0],
      original_post: original
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retweet' });
  }
});

export default router;
