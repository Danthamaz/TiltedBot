const { getDb } = require('../database');
const config = require('../config');

/**
 * Check if a role name is protected and should never be modified by the bot.
 */
function isProtectedRole(roleName) {
  return config.PROTECTED_ROLES.some(
    p => p.toLowerCase() === roleName.toLowerCase()
  );
}

/**
 * Get all role definitions for a guild in a given category.
 */
function getRolesByCategory(guildId, category) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM role_definitions WHERE guild_id = ? AND category = ?')
    .all(guildId, category);
}

/**
 * Add a role definition to the database.
 */
function addRoleDefinition(guildId, roleId, name, category) {
  const db = getDb();
  return db
    .prepare(
      'INSERT OR IGNORE INTO role_definitions (guild_id, role_id, name, category) VALUES (?, ?, ?, ?)'
    )
    .run(guildId, roleId, name, category);
}

/**
 * Remove a role definition from the database.
 */
function removeRoleDefinition(guildId, name, category) {
  const db = getDb();
  return db
    .prepare(
      'DELETE FROM role_definitions WHERE guild_id = ? AND name = ? AND category = ?'
    )
    .run(guildId, name, category);
}

/**
 * Mark a member as onboarded.
 */
function setMemberOnboarded(guildId, userId) {
  const db = getDb();
  return db
    .prepare(
      `INSERT INTO members (guild_id, user_id, onboarded_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(guild_id, user_id)
       DO UPDATE SET onboarded_at = CURRENT_TIMESTAMP`
    )
    .run(guildId, userId);
}

/**
 * Check if a member has completed onboarding.
 */
function isMemberOnboarded(guildId, userId) {
  const db = getDb();
  const row = db
    .prepare('SELECT onboarded_at FROM members WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId);
  return row?.onboarded_at != null;
}

/**
 * Get members who haven't onboarded.
 */
function getUnonboardedMembers(guildId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT user_id FROM members WHERE guild_id = ? AND onboarded_at IS NULL`
    )
    .all(guildId);
}

/**
 * Get or create guild config row.
 */
function getGuildConfig(guildId) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM config WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT INTO config (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM config WHERE guild_id = ?').get(guildId);
  }
  return row;
}

/**
 * Update guild config.
 */
function updateGuildConfig(guildId, field, value) {
  const db = getDb();
  const allowed = ['welcome_channel_id', 'log_channel_id', 'onboarding_channel_id'];
  if (!allowed.includes(field)) throw new Error(`Invalid config field: ${field}`);
  db.prepare(`UPDATE config SET ${field} = ? WHERE guild_id = ?`).run(value, guildId);
}

module.exports = {
  isProtectedRole,
  getRolesByCategory,
  addRoleDefinition,
  removeRoleDefinition,
  setMemberOnboarded,
  isMemberOnboarded,
  getUnonboardedMembers,
  getGuildConfig,
  updateGuildConfig,
};
