CREATE TABLE IF NOT EXISTS clash_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    tournament_id TEXT NOT NULL,
    phase_id INTEGER NOT NULL,
    reminder_type TEXT NOT NULL,
    message_id TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, tournament_id, phase_id, reminder_type)
);

CREATE TABLE IF NOT EXISTS clash_signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    tournament_id TEXT NOT NULL,
    phase_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    preferred_role TEXT,
    is_captain INTEGER DEFAULT 0,
    signed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, tournament_id, phase_id, user_id)
);
