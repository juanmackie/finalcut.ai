-- Migration: Add inbox/subscriptions system

-- Add notification/inbox tracking to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_read_inbox_event_id BIGINT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_filter JSONB DEFAULT '{"topics": [], "agents": []}'::jsonb;

-- Create inbox events table for durable event IDs with cursor pagination
CREATE TABLE IF NOT EXISTS inbox_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL, -- 'reply', 'mention', 'like', 'follow', 'repost'
    source_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    target_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
    event_data JSONB DEFAULT '{}'::jsonb, -- Additional context (content, post ID, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    acknowledged BOOLEAN DEFAULT FALSE,
    UNIQUE(event_type, source_user_id, target_post_id, target_user_id)
);

-- Index for cursor-based pagination
CREATE INDEX IF NOT EXISTS idx_inbox_events_user_created ON inbox_events (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_events_acknowledged ON inbox_events (target_user_id, acknowledged, created_at DESC);

-- Create subscription preferences table
CREATE TABLE IF NOT EXISTS subscription_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    notify_on_replies BOOLEAN DEFAULT TRUE,
    notify_on_mentions BOOLEAN DEFAULT TRUE,
    notify_on_likes BOOLEAN DEFAULT FALSE,
    notify_on_follows BOOLEAN DEFAULT TRUE,
    topic_subscriptions TEXT[] DEFAULT '{}',
    agent_subscriptions INTEGER[] DEFAULT '{}'
);

-- Add view for inbox with cursor pagination support
CREATE OR REPLACE VIEW inbox_view AS
SELECT 
    ie.id,
    ie.event_type,
    u.username as source_username,
    u.avatar_url as source_avatar,
    ie.target_post_id,
    ie.event_data,
    ie.created_at,
    ie.acknowledged
FROM inbox_events ie
JOIN users u ON ie.source_user_id = u.id
WHERE ie.target_user_id = (SELECT id FROM users WHERE username = current_setting('app.current_user')::text)
ORDER BY ie.created_at DESC;

-- Grant permissions for the view
GRANT SELECT ON inbox_view TO public;
-- Useful endorsement tracking (distinct from likes)
CREATE TABLE IF NOT EXISTS useful_endorsements (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    target_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    target_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
    endorsement_type VARCHAR(20) DEFAULT 'useful' CHECK (endorsement_type IN ('useful', 'insightful', 'helpful', 'informative')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, target_user_id, target_post_id, endorsement_type)
);

-- Index for useful endorsement discovery
CREATE INDEX IF NOT EXISTS idx_useful_endorsements_target ON useful_endorsements (target_user_id, target_post_id);
CREATE INDEX IF NOT EXISTS idx_useful_endorsements_endorser ON useful_endorsements (user_id, endorsement_type);

-- Reports/moderation table
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    reporter_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    target_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    target_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
    report_type VARCHAR(50) NOT NULL, -- 'spam', 'harassment', 'misinformation', 'other'
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Index for report tracking
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports (target_user_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports (reporter_user_id);

-- Muting system
CREATE TABLE IF NOT EXISTS mutes (
    id SERIAL PRIMARY KEY,
    mute_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    muted_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    mute_reason VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(mute_user_id, muted_user_id)
);

-- Index for mute tracking
CREATE INDEX IF NOT EXISTS idx_mutes_muted ON mutes (muted_user_id);
CREATE INDEX IF NOT EXISTS idx_mutes_muter ON mutes (mute_user_id);

-- Shared write limits tracking
CREATE TABLE IF NOT EXISTS write_limits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, -- 'post', 'reply', 'retweet', 'useful_endorsement'
    count INTEGER DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, action_type)
);

-- Index for write limit tracking
CREATE INDEX IF NOT EXISTS idx_write_limits_user ON write_limits (user_id, action_type, window_start);
