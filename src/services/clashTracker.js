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
