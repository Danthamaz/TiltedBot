# Clash Team Coordinator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically remind players about upcoming Clash tournaments, collect signups with role preferences via Discord buttons, and suggest optimal team compositions.

**Architecture:** A polling-based `clashTracker` service (like `matchTracker`) checks the Riot Clash API every 6 hours for upcoming tournaments. When reminder thresholds are hit, it posts embeds with signup buttons to `#league`. A `clashHandler` processes button/dropdown interactions for signups and role selection. A team formation algorithm suggests optimal rosters based on player stats.

**Tech Stack:** Node.js, discord.js v14 (buttons, dropdowns, embeds), Riot Clash API, better-sqlite3

---

### Task 1: Database Migration

**Files:**
- Create: `migrations/008_clash.sql`

- [ ] **Step 1: Create the migration file**

```sql
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
```

- [ ] **Step 2: Verify migration applies**

Run:
```bash
cd /c/Apps/TiltedBot && node -e "const { getDb } = require('./src/database'); const db = getDb(); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'clash%'\").all());"
```

Expected: Both `clash_reminders` and `clash_signups` tables listed.

- [ ] **Step 3: Commit**

```bash
git add migrations/008_clash.sql
git commit -m "feat: add clash_reminders and clash_signups tables"
```

---

### Task 2: Clash API Utility

**Files:**
- Create: `src/utils/clash.js`

- [ ] **Step 1: Create `src/utils/clash.js`**

```js
const config = require('../config');

const PLATFORM_BASE = `https://${config.RIOT_PLATFORM}.api.riotgames.com`;

async function clashFetch(url) {
  const res = await fetch(url, {
    headers: { 'X-Riot-Token': config.riotApiKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Riot Clash API ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Get all upcoming Clash tournaments.
 * Returns tournaments that have at least one phase with a start time in the future.
 */
async function getUpcomingTournaments() {
  const tournaments = await clashFetch(
    `${PLATFORM_BASE}/lol/clash/v1/tournaments`
  );
  const now = Date.now();
  return tournaments.filter(t =>
    t.schedule && t.schedule.some(phase => phase.startTime > now)
  );
}

/**
 * Get a player's current Clash registration info.
 * Returns an array of active Clash player entries (may be empty).
 */
async function getPlayerClashInfo(summonerId) {
  try {
    return await clashFetch(
      `${PLATFORM_BASE}/lol/clash/v1/players/by-summoner/${summonerId}`
    );
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

/**
 * Get Clash team details by team ID.
 */
async function getClashTeam(teamId) {
  return clashFetch(
    `${PLATFORM_BASE}/lol/clash/v1/teams/${teamId}`
  );
}

module.exports = { getUpcomingTournaments, getPlayerClashInfo, getClashTeam };
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/clash.js
git commit -m "feat: add Riot Clash API utility wrappers"
```

---

### Task 3: Clash Database Helpers

**Files:**
- Create: `src/utils/clashDb.js`

- [ ] **Step 1: Create `src/utils/clashDb.js`**

This file handles all clash-related database operations — keeping them separate from the existing `league.js` utils.

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/clashDb.js
git commit -m "feat: add Clash database helper functions"
```

---

### Task 4: Clash Signup Handler

**Files:**
- Create: `src/handlers/clashHandler.js`
- Modify: `src/events/interactionCreate.js`

- [ ] **Step 1: Create `src/handlers/clashHandler.js`**

This handles all button and dropdown interactions for Clash signups.

```js
const { ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { getSignups, getCaptain, addSignup, removeSignup, updateSignupRole, getReminderMessages } = require('../utils/clashDb');
const { POSITION_NAMES } = require('../utils/league');
const { buildClashEmbed, buildClashButtons } = require('./clashEmbedBuilder');

const ROLE_OPTIONS = [
  { label: 'Top', value: 'TOP' },
  { label: 'Jungle', value: 'JUNGLE' },
  { label: 'Mid', value: 'MIDDLE' },
  { label: 'Bot', value: 'BOTTOM' },
  { label: 'Support', value: 'UTILITY' },
  { label: 'Fill', value: 'FILL' },
];

/**
 * Handle all clash_ prefixed interactions.
 */
async function handleClashInteraction(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith('clash_captain_') || customId.startsWith('clash_join_')) {
    return handleSignupButton(interaction);
  }
  if (customId.startsWith('clash_leave_')) {
    return handleLeaveButton(interaction);
  }
  if (customId.startsWith('clash_role_')) {
    return handleRoleSelect(interaction);
  }
}

/**
 * Parse tournament info from button custom ID.
 * Format: clash_action_tournamentId_phaseId
 */
function parseCustomId(customId) {
  const parts = customId.split('_');
  // clash_captain_123_456 or clash_join_123_456 or clash_leave_123_456
  const action = parts[1];
  const tournamentId = parts[2];
  const phaseId = parseInt(parts[3]);
  return { action, tournamentId, phaseId };
}

async function handleSignupButton(interaction) {
  const { action, tournamentId, phaseId } = parseCustomId(interaction.customId);
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const isCaptain = action === 'captain';

  // Check if captain slot is taken
  if (isCaptain) {
    const existingCaptain = getCaptain(guildId, tournamentId, phaseId);
    if (existingCaptain && existingCaptain.user_id !== userId) {
      return interaction.reply({
        content: `Captain slot is already taken by <@${existingCaptain.user_id}>.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // Sign up (role will be set after dropdown selection)
  addSignup(guildId, tournamentId, phaseId, userId, null, isCaptain);

  // Send role selection dropdown
  const roleMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`clash_role_${tournamentId}_${phaseId}`)
      .setPlaceholder('Select your preferred role')
      .addOptions(ROLE_OPTIONS)
  );

  await interaction.reply({
    content: isCaptain
      ? 'You\'re signed up as **Captain**! Now pick your preferred role:'
      : 'You\'re signed up! Now pick your preferred role:',
    components: [roleMenu],
    flags: MessageFlags.Ephemeral,
  });

  // Update all reminder embeds for this phase
  await updateAllEmbeds(interaction, guildId, tournamentId, phaseId);
}

async function handleLeaveButton(interaction) {
  const { tournamentId, phaseId } = parseCustomId(interaction.customId);
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  removeSignup(guildId, tournamentId, phaseId, userId);

  await interaction.reply({
    content: 'You\'ve been removed from the signup list.',
    flags: MessageFlags.Ephemeral,
  });

  // Update all reminder embeds for this phase
  await updateAllEmbeds(interaction, guildId, tournamentId, phaseId);
}

async function handleRoleSelect(interaction) {
  const parts = interaction.customId.split('_');
  const tournamentId = parts[2];
  const phaseId = parseInt(parts[3]);
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const role = interaction.values[0];

  updateSignupRole(guildId, tournamentId, phaseId, userId, role);

  const roleName = ROLE_OPTIONS.find(r => r.value === role)?.label || role;
  await interaction.update({
    content: `Role set to **${roleName}**. You're all set!`,
    components: [],
  });

  // Update all reminder embeds for this phase
  await updateAllEmbeds(interaction, guildId, tournamentId, phaseId);
}

/**
 * Update all reminder embed messages for a tournament phase with current signup state.
 */
async function updateAllEmbeds(interaction, guildId, tournamentId, phaseId) {
  const messageIds = getReminderMessages(guildId, tournamentId, phaseId);
  const signups = getSignups(guildId, tournamentId, phaseId);
  const captain = getCaptain(guildId, tournamentId, phaseId);
  const channel = interaction.channel;

  for (const messageId of messageIds) {
    try {
      const msg = await channel.messages.fetch(messageId);
      if (!msg) continue;

      // Rebuild the embed with updated signup info
      // Preserve the original embed's title and tournament info
      const originalEmbed = msg.embeds[0];
      if (!originalEmbed) continue;

      const embed = buildClashEmbed({
        title: originalEmbed.title,
        tournamentName: originalEmbed.fields?.find(f => f.name === 'Tournament')?.value || '',
        lockInTime: originalEmbed.fields?.find(f => f.name === 'Lock-in')?.value || '',
        signups,
        captain,
      });

      const buttons = buildClashButtons(tournamentId, phaseId, captain);
      await msg.edit({ embeds: [embed], components: [buttons] });
    } catch (err) {
      // Message may have been deleted — ignore
    }
  }
}

module.exports = { handleClashInteraction };
```

- [ ] **Step 2: Create `src/handlers/clashEmbedBuilder.js`**

Shared embed and button builders used by both the handler and the tracker.

```js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const ROLE_DISPLAY = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  BOTTOM: 'Bot',
  UTILITY: 'Support',
  FILL: 'Fill',
};

/**
 * Build a Clash reminder/signup embed.
 */
function buildClashEmbed({ title, tournamentName, lockInTime, signups, captain }) {
  const captainLine = captain
    ? `**Captain:** <@${captain.user_id}>`
    : '**Captain:** No captain yet';

  const signupLines = signups.map(s => {
    const role = s.preferred_role ? ROLE_DISPLAY[s.preferred_role] || s.preferred_role : 'No role selected';
    const captainIcon = s.is_captain ? ' 👑' : '';
    return `> <@${s.user_id}> — ${role}${captainIcon}`;
  });

  const signupList = signupLines.length > 0
    ? signupLines.join('\n')
    : '> *No signups yet*';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(title)
    .setDescription(
      `${captainLine}\n` +
      `**Signed up (${signups.length}/5):**\n${signupList}`
    )
    .setTimestamp();

  if (tournamentName) {
    embed.addFields({ name: 'Tournament', value: tournamentName, inline: true });
  }
  if (lockInTime) {
    embed.addFields({ name: 'Lock-in', value: lockInTime, inline: true });
  }

  return embed;
}

/**
 * Build the signup action row buttons.
 */
function buildClashButtons(tournamentId, phaseId, captain) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`clash_captain_${tournamentId}_${phaseId}`)
      .setLabel("I'm In (Captain)")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!!captain),
    new ButtonBuilder()
      .setCustomId(`clash_join_${tournamentId}_${phaseId}`)
      .setLabel("I'm In")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`clash_leave_${tournamentId}_${phaseId}`)
      .setLabel("Can't Make It")
      .setStyle(ButtonStyle.Danger),
  );
  return row;
}

module.exports = { buildClashEmbed, buildClashButtons, ROLE_DISPLAY };
```

- [ ] **Step 3: Add clash handler routing to `interactionCreate.js`**

Add this import at the top of `src/events/interactionCreate.js`, after the existing require statements (after line 3):

```js
const { handleClashInteraction } = require('../handlers/clashHandler');
```

Add this block before the closing `},` of the execute function (after the role_update block, before the final closing braces):

```js
    // Handle clash signup buttons and role dropdowns
    if (interaction.customId?.startsWith('clash_')) {
      return handleClashInteraction(interaction);
    }
```

- [ ] **Step 4: Commit**

```bash
git add src/handlers/clashHandler.js src/handlers/clashEmbedBuilder.js src/events/interactionCreate.js
git commit -m "feat: add Clash signup button and role selection handlers"
```

---

### Task 5: Team Formation Algorithm

**Files:**
- Create: `src/services/clashTeamBuilder.js`

- [ ] **Step 1: Create `src/services/clashTeamBuilder.js`**

```js
const { getDb } = require('../database');

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

/**
 * Get a player's win rate and games for each position from match_history.
 */
function getPlayerRoleStats(guildId, userId) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT position,
           COUNT(*) as games,
           SUM(win) as wins,
           ROUND(SUM(win) * 100.0 / COUNT(*), 1) as win_rate
    FROM match_history
    WHERE guild_id = ? AND user_id = ? AND position IS NOT NULL
    GROUP BY position
    HAVING COUNT(*) >= 2
    ORDER BY games DESC
  `).all(guildId, userId);

  const stats = {};
  for (const row of rows) {
    stats[row.position] = { games: row.games, wins: row.wins, winRate: row.win_rate };
  }
  return stats;
}

/**
 * Build a suggested team roster from signups.
 *
 * @param {string} guildId
 * @param {Array} signups - From getSignups(), each has user_id, preferred_role, is_captain
 * @returns {{ roster: Array, unassigned: Array }} roster is 5 players with assigned roles, unassigned is everyone else
 */
function suggestTeam(guildId, signups) {
  // Enrich signups with role stats
  const players = signups.map(s => ({
    userId: s.user_id,
    preferredRole: s.preferred_role,
    isCaptain: s.is_captain,
    roleStats: getPlayerRoleStats(guildId, s.user_id),
  }));

  if (players.length <= 5) {
    // Assign everyone — resolve conflicts
    const roster = assignRoles(players);
    return { roster, unassigned: [] };
  }

  // More than 5 — find best 5-player combination
  let bestRoster = null;
  let bestScore = -1;

  const combos = combinations(players, 5);
  for (const combo of combos) {
    const roster = assignRoles(combo);
    const score = scoreRoster(roster);
    if (score > bestScore) {
      bestScore = score;
      bestRoster = roster;
    }
  }

  const rosterUserIds = new Set(bestRoster.map(r => r.userId));
  const unassigned = players.filter(p => !rosterUserIds.has(p.userId));

  return { roster: bestRoster, unassigned };
}

/**
 * Assign roles to a group of up to 5 players, resolving conflicts.
 * Prefers player preference, breaks ties with win rate.
 */
function assignRoles(players) {
  const assigned = new Map(); // position -> player
  const unplaced = [];

  // First pass: assign players with unique preferences
  const prefCounts = {};
  for (const p of players) {
    if (p.preferredRole && p.preferredRole !== 'FILL') {
      prefCounts[p.preferredRole] = (prefCounts[p.preferredRole] || 0) + 1;
    }
  }

  // Players with unique preferences get their role
  for (const p of players) {
    const pref = p.preferredRole;
    if (pref && pref !== 'FILL' && prefCounts[pref] === 1 && !assigned.has(pref)) {
      assigned.set(pref, { ...p, assignedRole: pref });
    } else {
      unplaced.push(p);
    }
  }

  // Second pass: resolve conflicts — player with higher win rate in the role gets it
  const stillUnplaced = [];
  for (const p of unplaced) {
    const pref = p.preferredRole;
    if (pref && pref !== 'FILL' && !assigned.has(pref)) {
      assigned.set(pref, { ...p, assignedRole: pref });
    } else if (pref && pref !== 'FILL' && assigned.has(pref)) {
      const current = assigned.get(pref);
      const currentWr = current.roleStats[pref]?.winRate || 0;
      const challengerWr = p.roleStats[pref]?.winRate || 0;
      if (challengerWr > currentWr) {
        assigned.set(pref, { ...p, assignedRole: pref });
        stillUnplaced.push(current);
      } else {
        stillUnplaced.push(p);
      }
    } else {
      stillUnplaced.push(p);
    }
  }

  // Third pass: assign remaining players to open roles by best win rate
  const openRoles = POSITIONS.filter(pos => !assigned.has(pos));
  for (const p of stillUnplaced) {
    if (openRoles.length === 0) break;
    // Find the open role this player has the best win rate in
    let bestRole = openRoles[0];
    let bestWr = -1;
    for (const role of openRoles) {
      const wr = p.roleStats[role]?.winRate || 0;
      if (wr > bestWr) {
        bestWr = wr;
        bestRole = role;
      }
    }
    assigned.set(bestRole, { ...p, assignedRole: bestRole });
    openRoles.splice(openRoles.indexOf(bestRole), 1);
  }

  return Array.from(assigned.values());
}

/**
 * Score a roster — higher is better.
 * Weights: preferred role match = 20 points, win rate = actual value
 */
function scoreRoster(roster) {
  let score = 0;
  for (const p of roster) {
    if (p.assignedRole === p.preferredRole) score += 20;
    score += (p.roleStats[p.assignedRole]?.winRate || 0);
  }
  return score;
}

/**
 * Generate all combinations of k items from an array.
 * For a small Discord server (< 15 signups), this is fast enough.
 */
function combinations(arr, k) {
  const results = [];
  function recurse(start, combo) {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      recurse(i + 1, combo);
      combo.pop();
    }
  }
  recurse(0, []);
  return results;
}

module.exports = { suggestTeam, getPlayerRoleStats, POSITIONS };
```

- [ ] **Step 2: Commit**

```bash
git add src/services/clashTeamBuilder.js
git commit -m "feat: add Clash team formation algorithm"
```

---

### Task 6: Clash Tracker Service

**Files:**
- Create: `src/services/clashTracker.js`
- Modify: `src/index.js`

- [ ] **Step 1: Create `src/services/clashTracker.js`**

```js
const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getUpcomingTournaments } = require('../utils/clash');
const { isReminderSent, recordReminder, getSignups, getCaptain } = require('../utils/clashDb');
const { buildClashEmbed, buildClashButtons } = require('../handlers/clashEmbedBuilder');
const { suggestTeam } = require('./clashTeamBuilder');
const { ROLE_DISPLAY } = require('../handlers/clashEmbedBuilder');

const POLL_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
const THREE_HOURS = 3 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * Start the Clash tracker polling loop.
 */
function startClashTracker(client) {
  if (!config.riotApiKey) {
    console.log('No Riot API key configured, skipping clash tracker.');
    return;
  }

  console.log('Clash tracker started.');

  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        await checkClashReminders(client, guild);
      } catch (err) {
        console.error(`Clash tracker error for ${guild.name}:`, err.message);
      }
    }
  }, POLL_INTERVAL);

  // Run once on startup after a short delay
  setTimeout(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        await checkClashReminders(client, guild);
      } catch (err) {
        console.error(`Initial clash check error for ${guild.name}:`, err.message);
      }
    }
  }, 15000);
}

/**
 * Check for upcoming Clash tournaments and send reminders.
 */
async function checkClashReminders(client, guild) {
  const leagueChannel = guild.channels.cache.find(
    c => c.name === config.LEAGUE_CHANNEL_NAME
  );
  if (!leagueChannel) return;

  let tournaments;
  try {
    tournaments = await getUpcomingTournaments();
  } catch (err) {
    if (err.status === 429) {
      console.warn('Riot API rate limited during clash check.');
      return;
    }
    throw err;
  }

  if (!tournaments || !tournaments.length) return;

  const now = Date.now();

  for (const tournament of tournaments) {
    if (!tournament.schedule) continue;

    for (const phase of tournament.schedule) {
      if (phase.cancelled) continue;

      const tournamentId = String(tournament.id);
      const phaseId = phase.id;
      const registrationTime = phase.registrationTime;
      const startTime = phase.startTime;

      // Determine the day name and date for this phase
      const phaseDate = new Date(startTime);
      const dayName = phaseDate.toLocaleDateString('en-US', { weekday: 'long' });
      const dateStr = phaseDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      const timeStr = phaseDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
      const title = `Clash — ${dayName}, ${dateStr}`;
      const tournamentName = tournament.nameKey || 'Clash Tournament';
      const lockInTime = timeStr;

      // Reminder 1: Formation opens (registrationTime has passed)
      if (now >= registrationTime && !isReminderSent(guild.id, tournamentId, phaseId, 'formation')) {
        await sendReminder(leagueChannel, guild.id, tournamentId, phaseId, 'formation', {
          title,
          tournamentName,
          lockInTime,
          description: 'Team formation is open! Sign up below.',
        });
      }

      // Reminder 2: Day before (startTime - 1 day)
      const dayBefore = startTime - ONE_DAY;
      if (now >= dayBefore && now < startTime && !isReminderSent(guild.id, tournamentId, phaseId, 'day_before')) {
        await sendReminder(leagueChannel, guild.id, tournamentId, phaseId, 'day_before', {
          title,
          tournamentName,
          lockInTime,
          description: 'Clash is **tomorrow**! Make sure you\'re signed up.',
        });
      }

      // Reminder 3: 3 hours before start
      const threeHoursBefore = startTime - THREE_HOURS;
      if (now >= threeHoursBefore && now < startTime && !isReminderSent(guild.id, tournamentId, phaseId, 'hours_before')) {
        await sendReminder(leagueChannel, guild.id, tournamentId, phaseId, 'hours_before', {
          title,
          tournamentName,
          lockInTime,
          description: 'Lock-in opens **soon**! Last call to sign up.',
        });
      }
    }
  }
}

/**
 * Send a Clash reminder embed with signup buttons.
 */
async function sendReminder(channel, guildId, tournamentId, phaseId, reminderType, { title, tournamentName, lockInTime, description }) {
  const signups = getSignups(guildId, tournamentId, phaseId);
  const captain = getCaptain(guildId, tournamentId, phaseId);

  const embed = buildClashEmbed({ title, tournamentName, lockInTime, signups, captain });
  embed.setFooter({ text: description });

  const buttons = buildClashButtons(tournamentId, phaseId, captain);

  const msg = await channel.send({ embeds: [embed], components: [buttons] }).catch(err => {
    console.error('Failed to send clash reminder:', err.message);
    return null;
  });

  if (msg) {
    recordReminder(guildId, tournamentId, phaseId, reminderType, msg.id);
  }
}

/**
 * Post a team formation suggestion to the channel.
 * Called when captain + 5 signups are reached, or via /clash team.
 */
async function postTeamSuggestion(channel, guildId, tournamentId, phaseId, title) {
  const signups = getSignups(guildId, tournamentId, phaseId);
  const captain = getCaptain(guildId, tournamentId, phaseId);

  if (!captain) {
    return channel.send('A captain is needed before a team can be suggested. Click **I\'m In (Captain)** on the signup message.');
  }

  if (signups.length < 5) {
    return channel.send(`Only **${signups.length}/5** players signed up. Need at least 5 for a team suggestion.`);
  }

  const { roster, unassigned } = suggestTeam(guildId, signups);

  const rosterLines = roster.map(p => {
    const roleDisplay = ROLE_DISPLAY[p.assignedRole] || p.assignedRole;
    const stats = p.roleStats[p.assignedRole];
    const statsStr = stats ? `${stats.winRate}% WR (${stats.games} games)` : 'No data';
    const captainIcon = p.isCaptain ? ' 👑' : '';
    const prefMatch = p.assignedRole === p.preferredRole ? '' : ` *(wanted ${ROLE_DISPLAY[p.preferredRole] || p.preferredRole})*`;
    return `> <@${p.userId}> — **${roleDisplay}** — ${statsStr}${captainIcon}${prefMatch}`;
  });

  let description = `**Suggested Roster:**\n${rosterLines.join('\n')}`;

  if (unassigned.length > 0) {
    const unassignedLines = unassigned.map(p => {
      const pref = p.preferredRole ? (ROLE_DISPLAY[p.preferredRole] || p.preferredRole) : 'No preference';
      return `> <@${p.userId}> — ${pref}`;
    });
    description += `\n\n**Also signed up:**\n${unassignedLines.join('\n')}`;
  }

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle(`Team Suggestion — ${title || 'Clash'}`)
    .setDescription(description)
    .setFooter({ text: 'This is a suggestion — the captain creates the team in the League client.' })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

module.exports = { startClashTracker, postTeamSuggestion };
```

- [ ] **Step 2: Add clash tracker startup to `src/index.js`**

Add this import near the top of `src/index.js`, after the matchTracker import (after line 12):

```js
const { startClashTracker } = require('./services/clashTracker');
```

Add this line inside the `clientReady` handler, after `startMatchTracker(client);` (after line 73):

```js
  startClashTracker(client);
```

- [ ] **Step 3: Commit**

```bash
git add src/services/clashTracker.js src/index.js
git commit -m "feat: add Clash tracker service with automatic reminders"
```

---

### Task 7: Auto-Trigger Team Suggestion on 5th Signup

**Files:**
- Modify: `src/handlers/clashHandler.js`

- [ ] **Step 1: Add team suggestion trigger to the signup handler**

Add this import at the top of `src/handlers/clashHandler.js`, after the existing imports:

```js
const { postTeamSuggestion } = require('../services/clashTracker');
```

In the `handleSignupButton` function, add this block at the end (after the `updateAllEmbeds` call, before the closing `}`):

```js
  // Auto-trigger team suggestion when captain + 5 signups reached
  const allSignups = getSignups(guildId, tournamentId, phaseId);
  const currentCaptain = getCaptain(guildId, tournamentId, phaseId);
  if (currentCaptain && allSignups.length >= 5) {
    // Get the title from the original embed for context
    try {
      const msg = await interaction.channel.messages.fetch(interaction.message.id);
      const embedTitle = msg?.embeds[0]?.title || 'Clash';
      await postTeamSuggestion(interaction.channel, guildId, tournamentId, phaseId, embedTitle);
    } catch (err) {
      console.error('Failed to post auto team suggestion:', err.message);
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/handlers/clashHandler.js
git commit -m "feat: auto-trigger team suggestion when 5th player signs up"
```

---

### Task 8: Slash Commands

**Files:**
- Create: `src/commands/clash.js`

- [ ] **Step 1: Create `src/commands/clash.js`**

```js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUpcomingTournaments } = require('../utils/clash');
const { getSignups, getCaptain } = require('../utils/clashDb');
const { postTeamSuggestion } = require('../services/clashTracker');
const { ROLE_DISPLAY } = require('../handlers/clashEmbedBuilder');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('clash')
      .setDescription('Clash tournament commands')
      .addSubcommand(sub =>
        sub.setName('schedule')
          .setDescription('Show upcoming Clash tournaments')
      )
      .addSubcommand(sub =>
        sub.setName('team')
          .setDescription('Get a team formation suggestion for the next Clash')
      )
      .addSubcommand(sub =>
        sub.setName('signups')
          .setDescription('Show current signups for the next Clash')
      ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();

      if (sub === 'schedule') return handleSchedule(interaction);
      if (sub === 'team') return handleTeam(interaction);
      if (sub === 'signups') return handleSignups(interaction);
    },
  },
];

async function handleSchedule(interaction) {
  await interaction.deferReply();

  try {
    const tournaments = await getUpcomingTournaments();

    if (!tournaments || !tournaments.length) {
      return interaction.editReply('No upcoming Clash tournaments found.');
    }

    const lines = [];
    for (const t of tournaments) {
      if (!t.schedule) continue;
      for (const phase of t.schedule) {
        if (phase.cancelled) continue;
        const date = new Date(phase.startTime);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
        const regDate = new Date(phase.registrationTime);
        const regStr = regDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        lines.push(`> **${dayName}, ${dateStr}** at ${timeStr}\n> Registration opens: ${regStr}\n> Tournament: ${t.nameKey || 'Clash'}`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Upcoming Clash Tournaments')
      .setDescription(lines.join('\n\n') || 'No upcoming tournaments.')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Clash schedule error:', err.message);
    await interaction.editReply('Failed to fetch Clash schedule. Try again later.');
  }
}

async function handleTeam(interaction) {
  await interaction.deferReply();

  try {
    const tournaments = await getUpcomingTournaments();

    if (!tournaments || !tournaments.length) {
      return interaction.editReply('No upcoming Clash tournaments found.');
    }

    // Find the next phase
    const now = Date.now();
    let nextPhase = null;
    let nextTournament = null;

    for (const t of tournaments) {
      if (!t.schedule) continue;
      for (const phase of t.schedule) {
        if (phase.cancelled) continue;
        if (phase.startTime > now) {
          if (!nextPhase || phase.startTime < nextPhase.startTime) {
            nextPhase = phase;
            nextTournament = t;
          }
        }
      }
    }

    if (!nextPhase) {
      return interaction.editReply('No upcoming Clash phases found.');
    }

    const phaseDate = new Date(nextPhase.startTime);
    const dayName = phaseDate.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = phaseDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const title = `${dayName}, ${dateStr}`;

    await postTeamSuggestion(
      interaction.channel,
      interaction.guildId,
      String(nextTournament.id),
      nextPhase.id,
      title
    );

    await interaction.editReply('Team suggestion posted above.');
  } catch (err) {
    console.error('Clash team error:', err.message);
    await interaction.editReply('Failed to generate team suggestion. Try again later.');
  }
}

async function handleSignups(interaction) {
  await interaction.deferReply();

  try {
    const tournaments = await getUpcomingTournaments();

    if (!tournaments || !tournaments.length) {
      return interaction.editReply('No upcoming Clash tournaments found.');
    }

    // Find the next phase
    const now = Date.now();
    let nextPhase = null;
    let nextTournament = null;

    for (const t of tournaments) {
      if (!t.schedule) continue;
      for (const phase of t.schedule) {
        if (phase.cancelled) continue;
        if (phase.startTime > now) {
          if (!nextPhase || phase.startTime < nextPhase.startTime) {
            nextPhase = phase;
            nextTournament = t;
          }
        }
      }
    }

    if (!nextPhase) {
      return interaction.editReply('No upcoming Clash phases found.');
    }

    const tournamentId = String(nextTournament.id);
    const phaseId = nextPhase.id;
    const signups = getSignups(interaction.guildId, tournamentId, phaseId);
    const captain = getCaptain(interaction.guildId, tournamentId, phaseId);

    const phaseDate = new Date(nextPhase.startTime);
    const dayName = phaseDate.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = phaseDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    if (!signups.length) {
      return interaction.editReply(`No signups yet for Clash — ${dayName}, ${dateStr}.`);
    }

    const captainLine = captain
      ? `**Captain:** <@${captain.user_id}>`
      : '**Captain:** No captain yet';

    const signupLines = signups.map(s => {
      const role = s.preferred_role ? (ROLE_DISPLAY[s.preferred_role] || s.preferred_role) : 'No role selected';
      const captainIcon = s.is_captain ? ' 👑' : '';
      return `> <@${s.user_id}> — ${role}${captainIcon}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`Clash Signups — ${dayName}, ${dateStr}`)
      .setDescription(
        `${captainLine}\n` +
        `**Signed up (${signups.length}/5):**\n${signupLines.join('\n')}`
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Clash signups error:', err.message);
    await interaction.editReply('Failed to fetch signups. Try again later.');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/clash.js
git commit -m "feat: add /clash schedule, team, and signups commands"
```

---

### Task 9: Manual Verification

- [ ] **Step 1: Deploy slash commands**

Run:
```bash
cd /c/Apps/TiltedBot && node src/deploy-commands.js
```

Expected: "Registering 7 slash commands..." (was 6, now includes `clash`).

- [ ] **Step 2: Start the bot and verify it loads**

Run:
```bash
cd /c/Apps/TiltedBot && npm start
```

Expected: Bot starts without errors, prints "Clash tracker started." alongside "Match tracker started."

- [ ] **Step 3: Test `/clash schedule`**

In Discord, run `/clash schedule`. Expected: Shows upcoming Clash tournaments from the Riot API, or "No upcoming Clash tournaments found" if none are scheduled.

- [ ] **Step 4: Test the full signup flow manually**

If a Clash tournament is upcoming:
1. Wait for automatic reminder (or trigger by temporarily lowering the poll interval)
2. Click "I'm In (Captain)" — verify captain claimed, role dropdown appears
3. Select a role — verify embed updates
4. Have another account click "I'm In" — verify signup list updates
5. Click "Can't Make It" — verify removal

- [ ] **Step 5: Commit any adjustments**

```bash
git add -A && git commit -m "fix: adjustments from manual testing"
```
