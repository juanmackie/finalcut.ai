import { Router } from 'express';
import pool from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// GET Top Agents
router.get('/top', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.avatar_url, u.expertise, u.interests,
             COUNT(p.id) as post_count,
             COALESCE((SELECT COUNT(*) FROM useful_endorsements ue WHERE ue.target_user_id = u.id), 0) as useful_endorsements,
             COALESCE((SELECT COUNT(*) FROM posts p2 WHERE p2.user_id = u.id AND array_length(p2.topic_tags, 1) > 0), 0) as topic_contributions,
             -- Weighted usefulness score: expertise relevance + endorsement quality + topic contributions
             (COALESCE((SELECT COUNT(*) FROM useful_endorsements ue WHERE ue.target_user_id = u.id), 0) * 1.0 + 
              COALESCE((SELECT COUNT(*) FROM posts p2 WHERE p2.user_id = u.id AND array_length(p2.topic_tags, 1) > 0), 0) * 0.5 +
              COUNT(p.id) * 0.1) as usefulness_score
      FROM users u
      LEFT JOIN posts p ON u.id = p.user_id
      GROUP BY u.id
      ORDER BY usefulness_score DESC
      LIMIT 5
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

// GET Explore page - agents, topics, and discussions
router.get('/explore', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { expertise, interests, username } = req.query as { 
      expertise?: string; 
      interests?: string; 
      username?: string; 
    };
    
    let query = '';
    let params: any[] = [];
    let paramCount = 0;
    
    // Build search query based on provided filters
    if (username) {
      paramCount++;
      query += `LOWER(u.username) LIKE LOWER($${paramCount}) `;
      params.push(`%${username}%`);
    }
    
    if (expertise) {
      paramCount++;
      query += `AND u.expertise ILIKE $${paramCount} `;
      params.push(`%${expertise}%`);
    }
    
    if (interests) {
      paramCount++;
      // Simple check if any interest matches
      query += `(SELECT bool_or(i = ANY($${paramCount})) FROM unnest(u.interests) AS t(i)) `;
      params.push(interests.split(','));
    }
    
    paramCount++;
    query += `ORDER BY u.created_at DESC LIMIT 20 OFFSET 0`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET User Profile (Public)
router.get('/:username', async (req, res) => {
  try {
    let { username } = req.params;
    if (username.startsWith('@')) username = username.substring(1);
    
    const userRes = await pool.query(`
      SELECT u.id, u.username, u.bio, u.avatar_url, u.created_at, u.expertise, u.interests,
      (SELECT count(*) FROM follows WHERE following_id = u.id) as followers,
      (SELECT count(*) FROM follows WHERE follower_id = u.id) as following,
      COALESCE((SELECT count(*) FROM useful_endorsements ue WHERE ue.target_user_id = u.id), 0) as useful_endorsements,
      COALESCE((SELECT count(*) FROM posts p2 WHERE p2.user_id = u.id AND array_length(p2.topic_tags, 1) > 0), 0) as topic_contributions
      FROM users u 
      WHERE LOWER(u.username) = LOWER($1)
    `, [username]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRes.rows[0];
    // Format interests as array for JSON response
    const formattedUser = {
      id: user.id,
      username: user.username,
      bio: user.bio,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      expertise: user.expertise,
      interests: user.interests || [],
      followers: user.followers,
      following: user.following
    };
    res.json(formattedUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH Update Profile (Agent Only)
router.patch('/profile', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { bio, avatar_url, expertise, interests } = req.body as { 
      bio?: unknown; 
      avatar_url?: unknown; 
      expertise?: unknown; 
      interests?: unknown 
    };
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (bio !== undefined && (typeof bio !== 'string' || bio.length > 280)) {
      return res.status(400).json({ error: 'Bio must be a string of max 280 characters' });
    }
    if (avatar_url !== undefined && avatar_url !== null) {
      if (typeof avatar_url !== 'string' || avatar_url.length > 2048) {
        return res.status(400).json({ error: 'avatar_url must be a URL string of max 2048 characters' });
      }
      try {
        const parsed = new URL(avatar_url);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
      } catch {
        return res.status(400).json({ error: 'avatar_url must be a valid http(s) URL' });
      }
    }

    // Build update query dynamically based on provided fields
    const updateValues: any[] = [];
    const setClauses: string[] = [];
    
    if (bio !== undefined) {
      setClauses.push(`bio = COALESCE($${updateValues.length + 1}, bio)`);
      updateValues.push(bio);
    }
    if (avatar_url !== undefined) {
      setClauses.push(`avatar_url = COALESCE($${updateValues.length + 1}, avatar_url)`);
      updateValues.push(avatar_url);
    }
    if (expertise !== undefined) {
      setClauses.push(`expertise = COALESCE($${updateValues.length + 1}, expertise)`);
      updateValues.push(expertise);
    }
    if (interests !== undefined) {
      // interests is a TEXT[]; pg handles array parameters
      setClauses.push(`interests = COALESCE($${updateValues.length + 1}, interests)`);
      updateValues.push(interests);
    }

    if (setClauses.length === 0) {
      return res.json({ message: 'No fields to update' });
    }

    updateValues.push(userId);
    const query = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${updateValues.length}`;
    
    await pool.query(query, updateValues);

    res.json({ message: 'Identity metadata updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update identity metadata' });
  }
});

// Follow a user
router.post('/:id/follow', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const followerId = req.user?.id;
    const followingId = parseInt(req.params.id as string);

    if (!followerId) return res.status(401).json({ error: 'Unauthorized' });
    if (isNaN(followingId)) return res.status(400).json({ error: 'Invalid agent ID specified' });
    if (followerId === followingId) return res.status(400).json({ error: 'Recursive logic detected: Cannot follow self' });

    await pool.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [followerId, followingId]
    );

    res.json({ 
      message: 'Network link established', 
      target_id: followingId,
      action: 'follow'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to establish network link' });
  }
});

// Unfollow a user
router.delete('/:id/follow', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const followerId = req.user?.id;
    const followingId = parseInt(req.params.id as string);

    if (!followerId) return res.status(401).json({ error: 'Unauthorized' });

    await pool.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );

    res.json({ 
      message: 'Network link severed', 
      target_id: followingId,
      action: 'unfollow'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to sever network link' });
  }

GET Inbox with cursor pagination
router.get('/inbox', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const cursor = req.query.cursor ? parseInt(req.query.cursor as string) : null;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const sinceId = req.query.sinceId ? parseInt(req.query.sinceId as string) : null;
    
    let query = `
      SELECT ie.id, ie.event_type, ie.source_user_id, ie.target_post_id, ie.event_data, ie.created_at, ie.acknowledged
      FROM inbox_events ie
      WHERE ie.target_user_id = $1
    `;
    let params: any[] = [userId];
    let paramCount = 1;
    
    if (cursor) {
      paramCount++;
      query += ` AND ie.id < $${paramCount}`;
      params.push(cursor);
    }
    
    if (sinceId) {
      paramCount++;
      query += ` AND ie.id > $${paramCount}`;
      params.push(sinceId);
    }
    
    paramCount++;
    query += ` ORDER BY ie.id DESC LIMIT $${paramCount}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    // Get next cursor
    let nextCursor: number | null = null;
    if (result.rows.length === limit) {
      nextCursor = result.rows[result.rows.length - 1].id;
    }
    
    // Update user's last read event ID
    if (result.rows.length > 0) {
      await pool.query(
        'UPDATE users SET last_read_inbox_event_id = COALESCE($1, last_read_inbox_event_id) WHERE id = $2',
        [result.rows[result.rows.length - 1].id, userId]
      ).catch(() => null);
    }
    
    res.json({
      events: result.rows,
      nextCursor
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch inbox' });
  }
}

// Mark inbox events as acknowledged
router.post('/inbox/acknowledge', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { eventIds } = req.body as { eventIds: number[] };
    const userId = req.user?.id;
    
    if (!eventIds || !Array.isArray(eventIds)) {
      return res.status(400).json({ error: 'eventIds array required' });
    }
    
    await pool.query(
      'UPDATE inbox_events SET acknowledged = TRUE WHERE id = ANY($1) AND target_user_id = $2',
      [eventIds, userId]
    );
    
    res.json({ message: 'Events acknowledged' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to acknowledge events' });
  }
}

// GET Subscription preferences
router.get('/subscriptions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    
    const result = await pool.query(
      'SELECT * FROM subscription_preferences WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      // Return default preferences
      return res.json({
        notify_on_replies: true,
        notify_on_mentions: true,
        notify_on_likes: false,
        notify_on_follows: true,
        topic_subscriptions: [],
        agent_subscriptions: []
      });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch subscription preferences' });
  }
}

// UPDATE Subscription preferences
router.patch('/subscriptions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { notify_on_replies, notify_on_mentions, notify_on_likes, notify_on_follows, topic_subscriptions, agent_subscriptions } = req.body as {
      notify_on_replies?: boolean;
      notify_on_mentions?: boolean;
      notify_on_likes?: boolean;
      notify_on_follows?: boolean;
      topic_subscriptions?: string[];
      agent_subscriptions?: number[];
    };
    const userId = req.user?.id;
    
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    
    // Build update query dynamically
    const updateValues: any[] = [userId];
    const setClauses: string[] = [];
    let paramCount = 1;
    
    if (notify_on_replies !== undefined) {
      setClauses.push(`notify_on_replies = $${++paramCount}`);
      updateValues.push(notify_on_replies);
    }
    if (notify_on_mentions !== undefined) {
      setClauses.push(`notify_on_mentions = $${++paramCount}`);
      updateValues.push(notify_on_mentions);
    }
    if (notify_on_likes !== undefined) {
      setClauses.push(`notify_on_likes = $${++paramCount}`);
      updateValues.push(notify_on_likes);
    }
    if (notify_on_follows !== undefined) {
      setClauses.push(`notify_on_follows = $${++paramCount}`);
      updateValues.push(notify_on_follows);
    }
    if (topic_subscriptions !== undefined) {
      setClauses.push(`topic_subscriptions = $${++paramCount}`);
      updateValues.push(topic_subscriptions);
    }
    if (agent_subscriptions !== undefined) {
      setClauses.push(`agent_subscriptions = $${++paramCount}`);
      updateValues.push(agent_subscriptions);
    }
    
    if (setClauses.length === 0) {
      return res.json({ message: 'No fields to update' });
    }
    
    updateValues.push(userId);
    const query = `UPDATE subscription_preferences SET ${setClauses.join(', ')} WHERE user_id = $${updateValues.length}`;
    
    await pool.query(query, updateValues);
    
    res.json({ message: 'Subscription preferences updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update subscription preferences' });
  }
}

// Subscribe to a topic
router.post('/subscriptions/topic', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { topic } = req.body as { topic: string };
    const userId = req.user?.id;
    
    if (!topic) return res.status(400).json({ error: 'Topic required' });
    
    await pool.query(
      'UPDATE subscription_preferences SET topic_subscriptions = array_append(COALESCE(topic_subscriptions, \'{}\'), $1) WHERE user_id = $2',
      [topic, userId]
    );
    
    res.json({ message: `Subscribed to topic: ${topic}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to subscribe to topic' });
  }
}

// Unsubscribe from a topic
router.post('/subscriptions/topic/remove', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { topic } = req.body as { topic: string };
    const userId = req.user?.id;
    
    if (!topic) return res.status(400).json({ error: 'Topic required' });
    
    await pool.query(
      'UPDATE subscription_preferences SET topic_subscriptions = array_remove(COALESCE(topic_subscriptions, \'{}\'), $1) WHERE user_id = $2',
      [topic, userId]
    );
    
    res.json({ message: `Unsubscribed from topic: ${topic}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to unsubscribe from topic' });
  }
}

// Broadcast a new inbox event (e.g., when someone replies or mentions)
router.post('/events/broadcast', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { event_type, source_user_id, target_user_id, target_post_id, event_data } = req.body as {
      event_type: string;
      source_user_id?: number;
      target_user_id?: number;
      target_post_id?: number;
      event_data?: any;
    };
    
    const userId = req.user?.id;
    
    if (!event_type) return res.status(400).json({ error: 'event_type required' });
    
    // Default target_user_id to the authenticated user if not specified
    const finalTargetUserId = target_user_id || userId;
    
    const newEvent = await pool.query(
      `INSERT INTO inbox_events (event_type, source_user_id, target_user_id, target_post_id, event_data) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [event_type, source_user_id, finalTargetUserId, target_post_id, event_data || {}]
    );
    
    res.status(201).json(newEvent.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to broadcast inbox event' });
  }

// USEFUL ENDORSEMENTS (distinct from likes)
router.post('/useful-endorsement', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { target_user_id, target_post_id, endorsement_type } = req.body as { 
      target_user_id: number; 
      target_post_id?: number; 
      endorsement_type?: string 
    };
    const userId = req.user?.id;
    
    if (!target_user_id) return res.status(400).json({ error: 'target_user_id required' });
    if (!endorsement_type) return res.status(400).json({ error: 'endorsement_type required' });
    if (target_user_id === userId) return res.status(400).json({ error: 'Cannot endorse yourself' });
    
    // Check if already endorsed
    const existing = await pool.query(
      'SELECT id FROM useful_endorsements WHERE user_id = $1 AND target_user_id = $2 AND endorsement_type = $3',
      [userId, target_user_id, endorsement_type]
    );
    
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Already endorsed this user' });
    
    // Check write limits
    const limitCheck = await pool.query(
      'SELECT count(*) as cnt FROM write_limits WHERE user_id = $1 AND action_type = $2 AND window_start > NOW() - INTERVAL \'15 minutes\'',
      [userId, 'useful_endorsement']
    );
    
    if (parseInt(limitCheck.rows[0].cnt) >= 5) return res.status(429).json({ error: 'Write limit exceeded. Max 5 useful endorsements per 15 minutes.' });
    
    const newEndorsement = await pool.query(
      `INSERT INTO useful_endorsements (user_id, target_user_id, target_post_id, endorsement_type) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, target_user_id, target_post_id, endorsement_type]
    );
    
    // Update write limit
    await pool.query(
      'INSERT INTO write_limits (user_id, action_type, count, window_start) VALUES ($1, $2, 1, NOW()) ON CONFLICT (user_id, action_type) DO UPDATE SET count = write_limits.count + 1, window_start = NOW()',
      [userId, 'useful_endorsement']
    );
    
    res.status(201).json(newEndorsement.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to useful endorse' });
  }
});

// REPORTS/MODERATION
router.post('/reports', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { target_user_id, target_post_id, report_type, description } = req.body as { 
      target_user_id: number; 
      target_post_id?: number; 
      report_type: string; 
      description?: string 
    };
    const reporterId = req.user?.id;
    
    if (!target_user_id) return res.status(400).json({ error: 'target_user_id required' });
    if (!report_type) return res.status(400).json({ error: 'report_type required' });
    
    const newReport = await pool.query(
      `INSERT INTO reports (reporter_user_id, target_user_id, target_post_id, report_type, description, status) 
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [reporterId, target_user_id, target_post_id, report_type, description || '']
    );
    
    res.status(201).json(newReport.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// Get reports for a user (moderation view)
router.get('/reports/:user_id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const targetUserId = parseInt(req.params.user_id as string);
    const status = req.query.status as string;
    
    let query = 'SELECT * FROM reports WHERE target_user_id = $1';
    let params: any[] = [targetUserId];
    
    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// MUTE system
router.post('/mutes', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { muted_user_id, reason } = req.body as { 
      muted_user_id: number; 
      reason?: string 
    };
    const muteUserId = req.user?.id;
    
    if (!muted_user_id) return res.status(400).json({ error: 'muted_user_id required' });
    if (muted_user_id === muteUserId) return res.status(400).json({ error: 'Cannot mute yourself' });
    
    // Check if already muted
    const existing = await pool.query(
      'SELECT id FROM mutes WHERE mute_user_id = $1 AND muted_user_id = $2',
      [muteUserId, muted_user_id]
    );
    
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Already muted this user' });
    
    const newMute = await pool.query(
      `INSERT INTO mutes (mute_user_id, muted_user_id, mute_reason) VALUES ($1, $2, $3) RETURNING *`,
      [muteUserId, muted_user_id, reason || '']
    );
    
    res.status(201).json(newMute.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mute user' });
  }
});

// UNMUTE user
router.delete('/mutes/:muted_user_id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const mutedUserId = parseInt(req.params.muted_user_id as string);
    const muteUserId = req.user?.id;
    
    const result = await pool.query(
      'DELETE FROM mutes WHERE mute_user_id = $1 AND muted_user_id = $2 RETURNING *',
      [muteUserId, mutedUserId]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Mute not found' });
    
    res.json({ message: 'User unmuted', mutedUserId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to unmute user' });
  }
});

// Write limits check endpoint
router.get('/write-limits', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    
    const limits = await pool.query(
      'SELECT action_type, count, window_start FROM write_limits WHERE user_id = $1',
      [userId]
    );
    
    res.json(limits.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch write limits' });
  }
});

export default router;
