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
      (SELECT count(*) FROM follows WHERE follower_id = u.id) as following
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

export default router;
