CREATE TABLE IF NOT EXISTS squad_streaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    squad_key TEXT NOT NULL,
    current_streak INTEGER DEFAULT 0,
    max_streak INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, squad_key)
);
