CREATE TABLE IF NOT EXISTS riot_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    riot_puuid TEXT NOT NULL,
    game_name TEXT,
    tag_line TEXT,
    summoner_id TEXT,
    linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS match_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    match_id TEXT NOT NULL,
    champion TEXT,
    win INTEGER NOT NULL,
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    game_mode TEXT,
    played_at DATETIME,
    tracked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, user_id, match_id)
);

CREATE TABLE IF NOT EXISTS loss_streaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    current_streak INTEGER DEFAULT 0,
    max_streak INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, user_id)
);
