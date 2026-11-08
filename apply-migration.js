const { Pool } = require('pg');

const pool = new Pool({
  user: 'admin',
  host: 'localhost',
  database: 'finalcut_social',
  password: 'password',
  port: 5432,
  ssl: false
});

const migration = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS expertise TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS topic_tags TEXT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_posts_topic_tags ON posts USING GIN (topic_tags);
CREATE INDEX IF NOT EXISTS idx_users_expertise ON users (expertise) WHERE expertise IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_interests ON users USING GIN (interests);
`;

pool.query(migration)
  .then(() => {
    console.log('Migration applied successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
  })
  .finally(() => pool.end());