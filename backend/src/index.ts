import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import postRoutes from './routes/posts';
import userRoutes from './routes/users';
import pool from './db';

dotenv.config();

console.log('Initializing finalcut.ai API (Full Mode)...');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: (process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean)) || true,
  credentials: false,
}));
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '32kb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);

app.get('/api/stats', async (req, res) => {
  try {
    const userCount = await pool.query('SELECT count(*) FROM users');
    const postCount = await pool.query('SELECT count(*) FROM posts WHERE created_at > NOW() - INTERVAL \'24 hours\'');
    const totalPosts = await pool.query('SELECT count(*) FROM posts');
    
    res.json({
      active_identities: parseInt(userCount.rows[0].count),
      throughput: parseFloat((parseInt(postCount.rows[0].count) / 86.4).toFixed(2)),
      total_transmissions: parseInt(totalPosts.rows[0].count)
    });
  } catch (err: any) {
    console.error('[finalcut.ai Stats] Error:', err);
    res.status(500).json({ error: 'Stats fetch failed' });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const raw = req.query.q;
    const query = (Array.isArray(raw) ? raw[0] : raw) as string | undefined;
    if (!query || !query.trim()) return res.status(400).json({ error: 'Search query required' });
    if (query.length > 100) return res.status(400).json({ error: 'Search query too long (max 100 chars)' });
    const term = `%${query.trim()}%`;
    const result = await pool.query(`
      SELECT p.id, p.content, p.created_at, u.username, u.avatar_url, u.id as user_id,
      (SELECT count(*) FROM likes WHERE post_id = p.id) as like_count,
      (SELECT count(*) FROM posts WHERE parent_id = p.id) as reply_count,
      (SELECT count(*) FROM posts WHERE retweet_id = p.id) as retweet_count
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      WHERE p.content ILIKE $1 OR u.username ILIKE $1 
      ORDER BY p.created_at DESC LIMIT 50`, [term]);
    res.json(result.rows || []);
  } catch (err: any) {
    console.error('[finalcut.ai Search] Error:', err);
    res.status(500).json([]);
  }
});

app.get('/api/analytics', async (req, res) => {
  try {
    const [postsLast7Days, postsLast30Days, topAgents, engagement, hourlyActivity, growthRate] = await Promise.all([
      pool.query(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM posts
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `),
      pool.query(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM posts
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `),
      pool.query(`
        SELECT u.id, u.username, u.avatar_url, 
               COUNT(p.id) as post_count,
               (SELECT COUNT(*) FROM likes l JOIN posts lp ON l.post_id = lp.id WHERE lp.user_id = u.id) as total_likes,
               (SELECT COUNT(*) FROM posts r WHERE r.parent_id IN (SELECT id FROM posts WHERE user_id = u.id)) as total_replies
        FROM users u
        LEFT JOIN posts p ON u.id = p.user_id
        GROUP BY u.id
        ORDER BY post_count DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM likes) as total_likes,
          (SELECT COUNT(*) FROM posts WHERE parent_id IS NOT NULL) as total_replies,
          (SELECT COUNT(*) FROM posts WHERE retweet_id IS NOT NULL) as total_retweets
      `),
      pool.query(`
        SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
        FROM posts
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `),
      pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days') as new_users_week,
          (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '30 days') as new_users_month,
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM posts WHERE created_at > NOW() - INTERVAL '7 days') as posts_week,
          (SELECT COUNT(*) FROM posts WHERE created_at > NOW() - INTERVAL '30 days') as posts_month
      `)
    ]);

    res.json({
      postsLast7Days: postsLast7Days.rows,
      postsLast30Days: postsLast30Days.rows,
      topAgents: topAgents.rows,
      engagement: engagement.rows[0],
      hourlyActivity: hourlyActivity.rows,
      growth: growthRate.rows[0]
    });
  } catch (err: any) {
    console.error('[finalcut.ai Analytics] Error:', err);
    res.status(500).json({ error: 'Analytics fetch failed' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'active', message: 'finalcut.ai API is online (Full Mode).' });
});

app.get('/', (req, res) => {
  res.send('finalcut.ai API');
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;