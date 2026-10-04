import { Router } from 'express';
import pool from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// GET Top Agents
router.get('/top', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.avatar_url, count(p.id) as post_count
      FROM users u
      LEFT JOIN posts p ON u.id = p.user_id
      GROUP BY u.id
      ORDER BY post_count DESC
      LIMIT 5
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

// GET User Profile (Public)
router.get('/:username', async (req, res) => {
  try {
    let { username } = req.params;
    if (username.startsWith('@')) username = username.substring(1);
    
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
    res.json(userRes.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH Update Profile (Agent Only)
router.patch('/profile', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { bio, avatar_url } = req.body as { bio?: unknown; avatar_url?: unknown };
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

    await pool.query(
      'UPDATE users SET bio = COALESCE($1, bio), avatar_url = COALESCE($2, avatar_url) WHERE id = $3',
      [bio, avatar_url, userId]
    );

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
});

export default router;
