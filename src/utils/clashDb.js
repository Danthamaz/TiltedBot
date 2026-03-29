const { getDb } = require('../database');

/**
 * Check if a reminder has already been sent.
 */
function isReminderSent(guildId, tournamentId, phaseId, reminderType) {
  const db = getDb();
  const row = db.prepare(
    'SELECT id FROM clash_reminders WHERE guild_id = ? AND tournament_id = ? AND phase_id = ? AND reminder_type = ?'
  ).get(guildId, tournamentId, phaseId, reminderType);
  return !!row;
}

/**
 * Record a sent reminder with its Discord message ID.
 */
function recordReminder(guildId, tournamentId, phaseId, reminderType, messageId) {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO clash_reminders (guild_id, tournament_id, phase_id, reminder_type, message_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(guildId, tournamentId, phaseId, reminderType, messageId);
}

/**
 * Get all reminder message IDs for a tournament phase (to update embeds).
 */
function getReminderMessages(guildId, tournamentId, phaseId) {
  const db = getDb();
  return db.prepare(
    'SELECT message_id FROM clash_reminders WHERE guild_id = ? AND tournament_id = ? AND phase_id = ? AND message_id IS NOT NULL'
  ).all(guildId, tournamentId, phaseId).map(r => r.message_id);
}

/**
 * Sign up a player for a Clash tournament phase.
 */
function addSignup(guildId, tournamentId, phaseId, userId, preferredRole, isCaptain) {
  const db = getDb();
  db.prepare(
    `INSERT INTO clash_signups (guild_id, tournament_id, phase_id, user_id, preferred_role, is_captain)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, tournament_id, phase_id, user_id)
     DO UPDATE SET preferred_role = ?, is_captain = ?, signed_up_at = CURRENT_TIMESTAMP`
  ).run(guildId, tournamentId, phaseId, userId, preferredRole, isCaptain ? 1 : 0, preferredRole, isCaptain ? 1 : 0);
}

/**
 * Remove a player's signup.
 */
function removeSignup(guildId, tournamentId, phaseId, userId) {
  const db = getDb();
  db.prepare(
    'DELETE FROM clash_signups WHERE guild_id = ? AND tournament_id = ? AND phase_id = ? AND user_id = ?'
  ).run(guildId, tournamentId, phaseId, userId);
}

/**
 * Get all signups for a tournament phase.
 */
function getSignups(guildId, tournamentId, phaseId) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM clash_signups WHERE guild_id = ? AND tournament_id = ? AND phase_id = ? ORDER BY signed_up_at ASC'
  ).all(guildId, tournamentId, phaseId);
}

/**
 * Get the captain for a tournament phase, or null.
 */
function getCaptain(guildId, tournamentId, phaseId) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM clash_signups WHERE guild_id = ? AND tournament_id = ? AND phase_id = ? AND is_captain = 1'
  ).get(guildId, tournamentId, phaseId) || null;
}

/**
 * Update a signup's preferred role.
 */
function updateSignupRole(guildId, tournamentId, phaseId, userId, role) {
  const db = getDb();
  db.prepare(
    'UPDATE clash_signups SET preferred_role = ? WHERE guild_id = ? AND tournament_id = ? AND phase_id = ? AND user_id = ?'
  ).run(role, guildId, tournamentId, phaseId, userId);
}

module.exports = {
  isReminderSent,
  recordReminder,
  getReminderMessages,
  addSignup,
  removeSignup,
  getSignups,
  getCaptain,
  updateSignupRole,
};
