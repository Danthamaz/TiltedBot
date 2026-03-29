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
