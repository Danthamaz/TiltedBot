CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    genres TEXT NOT NULL,
    platforms TEXT,
    has_integration INTEGER DEFAULT 0,
    UNIQUE(guild_id, name)
);
