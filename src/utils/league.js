const { getDb } = require('../database');

/**
 * Link a Riot account to a Discord user.
 */
function linkAccount(guildId, userId, puuid, gameName, tagLine, summonerId) {
  const db = getDb();
  return db.prepare(
    `INSERT INTO riot_accounts (guild_id, user_id, riot_puuid, game_name, tag_line, summoner_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, user_id)
     DO UPDATE SET riot_puuid = ?, game_name = ?, tag_line = ?, summoner_id = ?, linked_at = CURRENT_TIMESTAMP`
  ).run(guildId, userId, puuid, gameName, tagLine, summonerId, puuid, gameName, tagLine, summonerId);
}

/**
 * Get a linked Riot account for a Discord user.
 */
function getLinkedAccount(guildId, userId) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM riot_accounts WHERE guild_id = ? AND user_id = ?'
  ).get(guildId, userId);
}

/**
 * Get all linked accounts for a guild.
 */
function getAllLinkedAccounts(guildId) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM riot_accounts WHERE guild_id = ?'
  ).all(guildId);
}

/**
 * Check if a match has already been tracked.
 */
function isMatchTracked(guildId, userId, matchId) {
  const db = getDb();
  const row = db.prepare(
    'SELECT id FROM match_history WHERE guild_id = ? AND user_id = ? AND match_id = ?'
  ).get(guildId, userId, matchId);
  return !!row;
}

/**
 * Record a match result.
 */
function recordMatch(guildId, userId, matchId, stats) {
  const db = getDb();
  return db.prepare(
    `INSERT OR IGNORE INTO match_history (guild_id, user_id, match_id, champion, win, kills, deaths, assists, game_mode, played_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(guildId, userId, matchId, stats.champion, stats.win ? 1 : 0, stats.kills, stats.deaths, stats.assists, stats.gameMode, new Date(stats.gameEndTimestamp).toISOString());
}

/**
 * Get/update loss streak for a user.
 */
function updateLossStreak(guildId, userId, won) {
  const db = getDb();

  let row = db.prepare(
    'SELECT * FROM loss_streaks WHERE guild_id = ? AND user_id = ?'
  ).get(guildId, userId);

  if (!row) {
    db.prepare(
      'INSERT INTO loss_streaks (guild_id, user_id, current_streak, max_streak) VALUES (?, ?, 0, 0)'
    ).run(guildId, userId);
    row = { current_streak: 0, max_streak: 0 };
  }

  if (won) {
    db.prepare(
      'UPDATE loss_streaks SET current_streak = 0, last_updated = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?'
    ).run(guildId, userId);
    return { streak: 0, wasOnStreak: row.current_streak };
  } else {
    const newStreak = row.current_streak + 1;
    const newMax = Math.max(row.max_streak, newStreak);
    db.prepare(
      'UPDATE loss_streaks SET current_streak = ?, max_streak = ?, last_updated = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?'
    ).run(newStreak, newMax, guildId, userId);
    return { streak: newStreak, maxStreak: newMax };
  }
}

/**
 * Get current loss streak for a user.
 */
function getLossStreak(guildId, userId) {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM loss_streaks WHERE guild_id = ? AND user_id = ?'
  ).get(guildId, userId);
  return row || { current_streak: 0, max_streak: 0 };
}

/**
 * Get recent matches for a user.
 */
function getRecentMatches(guildId, userId, limit = 10) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM match_history WHERE guild_id = ? AND user_id = ? ORDER BY played_at DESC LIMIT ?'
  ).all(guildId, userId, limit);
}

module.exports = {
  linkAccount,
  getLinkedAccount,
  getAllLinkedAccounts,
  isMatchTracked,
  recordMatch,
  updateLossStreak,
  getLossStreak,
  getRecentMatches,
};
