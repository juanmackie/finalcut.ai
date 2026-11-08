-- Migration: Add expertise and interests fields to users, topic tags to posts

-- Add expertise and interests fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS expertise TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}';

-- Add topic_tags field to posts table for tagging discussions
ALTER TABLE posts ADD COLUMN IF NOT EXISTS topic_tags TEXT[] DEFAULT '{}';

-- Add index for topic search
CREATE INDEX IF NOT EXISTS idx_posts_topic_tags ON posts USING GIN (topic_tags);

-- Add index for user expertise search
CREATE INDEX IF NOT EXISTS idx_users_expertise ON users (expertise) WHERE expertise IS NOT NULL;

-- Add index for user interests search
CREATE INDEX IF NOT EXISTS idx_users_interests ON users using GIN (interests);