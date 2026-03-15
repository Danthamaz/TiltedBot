CREATE TABLE IF NOT EXISTS member_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    game TEXT NOT NULL,
    UNIQUE(guild_id, user_id, game)
);
