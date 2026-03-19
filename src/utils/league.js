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
    `INSERT OR IGNORE INTO match_history (guild_id, user_id, match_id, champion, win, kills, deaths, assists, game_mode, played_at, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(guildId, userId, matchId, stats.champion, stats.win ? 1 : 0, stats.kills, stats.deaths, stats.assists, stats.gameMode, new Date(stats.gameEndTimestamp).toISOString(), stats.position || null);
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

/**
 * Position code to display name mapping.
 */
const POSITION_NAMES = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  BOTTOM: 'Bot',
  UTILITY: 'Support',
};

/**
 * Get the "main" champion tag — highest win rate champion with 3+ games in last 50.
 */
function getMainTag(guildId, userId) {
  const db = getDb();
  return db.prepare(`
    SELECT champion,
           COUNT(*) as games,
           SUM(win) as wins,
           ROUND(SUM(win) * 100.0 / COUNT(*), 1) as win_rate
    FROM (
      SELECT * FROM match_history
      WHERE guild_id = ? AND user_id = ?
      ORDER BY played_at DESC LIMIT 50
    )
    GROUP BY champion
    HAVING COUNT(*) >= 7
    ORDER BY win_rate DESC, games DESC
    LIMIT 1
  `).get(guildId, userId) || null;
}

/**
 * Get "never play" position tags — positions with <33% win rate and 3+ games in last 50.
 */
function getNeverPlayTags(guildId, userId) {
  const db = getDb();
  return db.prepare(`
    SELECT position,
           COUNT(*) as games,
           SUM(win) as wins,
           ROUND(SUM(win) * 100.0 / COUNT(*), 1) as win_rate
    FROM (
      SELECT * FROM match_history
      WHERE guild_id = ? AND user_id = ? AND position IS NOT NULL
      ORDER BY played_at DESC LIMIT 50
    )
    GROUP BY position
    HAVING COUNT(*) >= 7 AND ROUND(SUM(win) * 100.0 / COUNT(*), 1) < 33.4
    ORDER BY win_rate ASC
  `).all(guildId, userId);
}

/**
 * Generate a stable squad key from a sorted list of user IDs.
 */
function makeSquadKey(userIds) {
  return [...userIds].sort().join(':');
}

/**
 * Update squad loss streak. Returns { streak, maxStreak, wasOnStreak }.
 */
function updateSquadStreak(guildId, userIds, won) {
  const db = getDb();
  const squadKey = makeSquadKey(userIds);

  let row = db.prepare(
    'SELECT * FROM squad_streaks WHERE guild_id = ? AND squad_key = ?'
  ).get(guildId, squadKey);

  if (!row) {
    db.prepare(
      'INSERT INTO squad_streaks (guild_id, squad_key, current_streak, max_streak) VALUES (?, ?, 0, 0)'
    ).run(guildId, squadKey);
    row = { current_streak: 0, max_streak: 0 };
  }

  if (won) {
    db.prepare(
      'UPDATE squad_streaks SET current_streak = 0, last_updated = CURRENT_TIMESTAMP WHERE guild_id = ? AND squad_key = ?'
    ).run(guildId, squadKey);
    return { streak: 0, wasOnStreak: row.current_streak };
  } else {
    const newStreak = row.current_streak + 1;
    const newMax = Math.max(row.max_streak, newStreak);
    db.prepare(
      'UPDATE squad_streaks SET current_streak = ?, max_streak = ?, last_updated = CURRENT_TIMESTAMP WHERE guild_id = ? AND squad_key = ?'
    ).run(newStreak, newMax, guildId, squadKey);
    return { streak: newStreak, maxStreak: newMax };
  }
}

/**
 * Normalize user-friendly role names to DB position values.
 */
const ROLE_ALIASES = {
  top: 'TOP',
  jungle: 'JUNGLE', jg: 'JUNGLE', jung: 'JUNGLE',
  mid: 'MIDDLE', middle: 'MIDDLE',
  bot: 'BOTTOM', bottom: 'BOTTOM', adc: 'BOTTOM',
  support: 'UTILITY', sup: 'UTILITY', supp: 'UTILITY', utility: 'UTILITY',
};

function normalizePosition(input) {
  return ROLE_ALIASES[input.toLowerCase()] || null;
}

/**
 * Get every linked player's stats on a specific role for the guild.
 */
function getRoleStatsForGuild(guildId, position) {
  const db = getDb();
  return db.prepare(`
    SELECT ra.user_id, ra.game_name, ra.tag_line,
           COUNT(*) as games,
           SUM(mh.win) as wins,
           SUM(mh.kills) as total_kills,
           SUM(mh.deaths) as total_deaths,
           SUM(mh.assists) as total_assists,
           ROUND(SUM(mh.win) * 100.0 / COUNT(*), 1) as win_rate
    FROM match_history mh
    JOIN riot_accounts ra ON ra.guild_id = mh.guild_id AND ra.user_id = mh.user_id
    WHERE mh.guild_id = ? AND mh.position = ?
    GROUP BY mh.user_id
    ORDER BY games DESC, win_rate DESC
  `).all(guildId, position);
}

/**
 * Get a user's top champions for a specific role (min 4 games, from last 100 games).
 */
function getTopChampionsForRole(guildId, userId, position, limit = 3) {
  const db = getDb();
  return db.prepare(`
    SELECT champion, COUNT(*) as games,
           SUM(win) as wins,
           ROUND(SUM(win) * 100.0 / COUNT(*), 1) as win_rate
    FROM (
      SELECT * FROM match_history
      WHERE guild_id = ? AND user_id = ?
      ORDER BY played_at DESC LIMIT 100
    )
    WHERE position = ?
    GROUP BY champion
    HAVING COUNT(*) >= 4
    ORDER BY win_rate DESC, games DESC
    LIMIT ?
  `).all(guildId, userId, position, limit);
}

/**
 * Get every linked player's stats on a specific champion for the guild.
 */
function getChampionStatsForGuild(guildId, championName) {
  const db = getDb();
  const normalized = championName.replace(/\s+/g, '');
  return db.prepare(`
    SELECT ra.user_id, ra.game_name, ra.tag_line,
           COUNT(*) as games,
           SUM(mh.win) as wins,
           SUM(mh.kills) as total_kills,
           SUM(mh.deaths) as total_deaths,
           SUM(mh.assists) as total_assists,
           ROUND(SUM(mh.win) * 100.0 / COUNT(*), 1) as win_rate
    FROM match_history mh
    JOIN riot_accounts ra ON ra.guild_id = mh.guild_id AND ra.user_id = mh.user_id
    WHERE mh.guild_id = ? AND (LOWER(mh.champion) = LOWER(?) OR LOWER(mh.champion) = LOWER(?))
    GROUP BY mh.user_id
    ORDER BY games DESC, win_rate DESC
  `).all(guildId, championName, normalized);
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
  getMainTag,
  getNeverPlayTags,
  POSITION_NAMES,
  updateSquadStreak,
  getChampionStatsForGuild,
  normalizePosition,
  getRoleStatsForGuild,
  getTopChampionsForRole,
};
