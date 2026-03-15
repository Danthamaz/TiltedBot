CREATE TABLE IF NOT EXISTS config (
    guild_id TEXT PRIMARY KEY,
    welcome_channel_id TEXT,
    log_channel_id TEXT,
    onboarding_channel_id TEXT
);

CREATE TABLE IF NOT EXISTS role_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('tilt', 'genre', 'platform')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    onboarded_at DATETIME,
    UNIQUE(guild_id, user_id)
);
