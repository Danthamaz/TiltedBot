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
