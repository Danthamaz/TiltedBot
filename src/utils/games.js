const { getDb } = require('../database');

/**
 * Get all games for a guild from the DB.
 */
function getGuildGames(guildId) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM games WHERE guild_id = ?').all(guildId);
  return rows.map(r => ({
    name: r.name,
    genres: JSON.parse(r.genres),
    platforms: r.platforms ? JSON.parse(r.platforms) : null,
    hasIntegration: !!r.has_integration,
  }));
}

/**
 * Get matching games based on selected genre names and platform names.
 */
function getMatchingGames(guildId, genreNames, platformNames) {
  const games = getGuildGames(guildId);
  return games.filter(game => {
    const genreMatch = game.genres.some(g =>
      genreNames.some(gn => gn.toLowerCase() === g.toLowerCase())
    );
    const platformMatch = game.platforms === null ||
      game.platforms.some(p =>
        platformNames.some(pn => pn.toLowerCase() === p.toLowerCase())
      );
    return genreMatch && platformMatch;
  });
}

/**
 * Add a game to the guild's catalog.
 */
function addGame(guildId, name, genres, platforms, hasIntegration = false) {
  const db = getDb();
  db.prepare(
    'INSERT OR IGNORE INTO games (guild_id, name, genres, platforms, has_integration) VALUES (?, ?, ?, ?, ?)'
  ).run(guildId, name, JSON.stringify(genres), platforms ? JSON.stringify(platforms) : null, hasIntegration ? 1 : 0);
}

/**
 * Remove a game from the guild's catalog.
 */
function removeGame(guildId, name) {
  const db = getDb();
  const result = db.prepare('DELETE FROM games WHERE guild_id = ? AND name = ?').run(guildId, name);
  return result.changes > 0;
}

/**
 * Seed default games for a guild if none exist.
 */
function seedDefaultGames(guildId, defaultGames) {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM games WHERE guild_id = ?').get(guildId);
  if (count.c > 0) return;

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO games (guild_id, name, genres, platforms, has_integration) VALUES (?, ?, ?, ?, ?)'
  );
  for (const game of defaultGames) {
    stmt.run(
      guildId,
      game.name,
      JSON.stringify(game.genres),
      game.platforms ? JSON.stringify(game.platforms) : null,
      game.hasIntegration ? 1 : 0
    );
  }
}

/**
 * Get a member's saved games from the DB.
 */
function getMemberGames(guildId, userId) {
  const db = getDb();
  return db.prepare('SELECT game FROM member_games WHERE guild_id = ? AND user_id = ?')
    .all(guildId, userId)
    .map(r => r.game);
}

/**
 * Replace a member's saved games in the DB.
 */
function setMemberGames(guildId, userId, gameNames) {
  const db = getDb();
  db.prepare('DELETE FROM member_games WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  if (gameNames.length) {
    const stmt = db.prepare('INSERT OR IGNORE INTO member_games (guild_id, user_id, game) VALUES (?, ?, ?)');
    for (const game of gameNames) {
      stmt.run(guildId, userId, game);
    }
  }
}

module.exports = { getMatchingGames, getGuildGames, addGame, removeGame, seedDefaultGames, getMemberGames, setMemberGames };
