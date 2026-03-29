const { ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { getSignups, getCaptain, addSignup, removeSignup, updateSignupRole, getReminderMessages } = require('../utils/clashDb');
const { buildClashEmbed, buildClashButtons } = require('./clashEmbedBuilder');
const { postTeamSuggestion } = require('../services/clashTracker');

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
