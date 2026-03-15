const { MessageFlags, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getRolesByCategory, setMemberOnboarded, getGuildConfig } = require('../utils/roles');
const { welcomeEmbed } = require('../utils/embeds');
const { buildOnboardingComponents } = require('../components/onboarding');
const { isProtectedRole } = require('../utils/roles');
const { getDb } = require('../database');
const { getMatchingGames } = require('../utils/games');

// Track in-progress onboarding selections per user
const pendingSelections = new Map();

function getKey(interaction) {
  return `${interaction.guildId}-${interaction.user.id}`;
}

/**
 * Build the games select menu from matching games.
 */
function buildGamesSelect(games) {
  if (!games.length) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId('onboarding_games')
    .setPlaceholder('What do you play?')
    .setMinValues(1)
    .setMaxValues(games.length)
    .addOptions(
      games.map(g => ({
        label: g.name,
        value: g.name,
      }))
    );

  return new ActionRowBuilder().addComponents(menu);
}

/**
 * Rebuild the full onboarding message components, including games if genre+platform are set.
 */
function rebuildComponents(guildId, selections) {
  const base = buildOnboardingComponents(guildId);

  // If both genres and platforms are selected, insert a games menu before confirm
  if (selections.genreNames?.length && selections.platformNames?.length) {
    const games = getMatchingGames(guildId, selections.genreNames, selections.platformNames);
    const gamesRow = buildGamesSelect(games);
    if (gamesRow) {
      // Insert games menu before the confirm button (last row)
      base.splice(base.length - 1, 0, gamesRow);
    }
  }

  return base;
}

async function handleOnboardingInteraction(interaction) {
  const key = getKey(interaction);

  // Handle "Get Started" button — send ephemeral role selection
  if (interaction.isButton() && interaction.customId.startsWith('onboarding_start_')) {
    const targetUserId = interaction.customId.split('_')[2];

    if (interaction.user.id !== targetUserId) {
      await interaction.reply({
        content: 'This button isn\'t for you. Wait for your own onboarding message.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    pendingSelections.set(key, {
      tilt: null, genres: [], platforms: [], games: [],
      tiltName: null, genreNames: [], platformNames: [], gameNames: [],
      welcomeMessage: interaction.message,
    });

    const components = buildOnboardingComponents(interaction.guildId);
    await interaction.reply({
      content: 'Pick your roles below to get started.\n\n**Step 1:** How tilted are you?\n**Step 2:** Select your Genres\n**Step 3:** Select your Platforms\n**Step 4:** Pick your Games\n\nThen hit **Confirm** to lock it in.',
      components,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!pendingSelections.has(key)) {
    pendingSelections.set(key, {
      tilt: null, genres: [], platforms: [], games: [],
      tiltName: null, genreNames: [], platformNames: [], gameNames: [],
    });
  }
  const selections = pendingSelections.get(key);

  // Handle select menu interactions
  if (interaction.isStringSelectMenu()) {
    const selectedLabels = interaction.component.options
      .filter(opt => interaction.values.includes(opt.value))
      .map(opt => opt.label);

    if (interaction.customId === 'onboarding_tilt') {
      selections.tilt = interaction.values[0];
      selections.tiltName = selectedLabels[0] || null;
      await interaction.deferUpdate();
    } else if (interaction.customId === 'onboarding_genre') {
      selections.genres = [...interaction.values];
      selections.genreNames = selectedLabels;
      // Reset games since genre changed
      selections.games = [];
      selections.gameNames = [];
      // Rebuild with games menu
      const components = rebuildComponents(interaction.guildId, selections);
      await interaction.update({ components });
    } else if (interaction.customId === 'onboarding_platform') {
      selections.platforms = [...interaction.values];
      selections.platformNames = selectedLabels;
      // Reset games since platform changed
      selections.games = [];
      selections.gameNames = [];
      // Rebuild with games menu
      const components = rebuildComponents(interaction.guildId, selections);
      await interaction.update({ components });
    } else if (interaction.customId === 'onboarding_games') {
      selections.gameNames = [...interaction.values];
      await interaction.deferUpdate();
    }
    return;
  }

  // Handle confirm button
  if (interaction.isButton() && interaction.customId === 'onboarding_confirm') {
    if (!selections.tilt || !selections.genres.length || !selections.platforms.length) {
      await interaction.reply({
        content: 'You need to make a selection in tilt tier, genres, and platforms before confirming.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const member = interaction.member;
    const guild = interaction.guild;

    // Collect all role IDs to assign
    const roleIds = [selections.tilt, ...selections.genres, ...selections.platforms];

    const generalRole = guild.roles.cache.find(r => r.name === 'General');
    if (generalRole) {
      roleIds.push(generalRole.id);
    }

    // Assign roles
    for (const roleId of roleIds) {
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;
      if (isProtectedRole(role.name)) continue;
      await member.roles.add(role).catch(err =>
        console.error(`Failed to assign role ${role.name}:`, err)
      );
    }

    // Save games to DB
    if (selections.gameNames.length) {
      const db = getDb();
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO member_games (guild_id, user_id, game) VALUES (?, ?, ?)'
      );
      for (const game of selections.gameNames) {
        stmt.run(guild.id, member.id, game);
      }
    }

    // Mark as onboarded
    setMemberOnboarded(guild.id, member.id);

    const tiltName = selections.tiltName || 'Unknown';
    const genreNames = selections.genreNames || [];
    const platformNames = selections.platformNames || [];

    // Send welcome message
    const guildConfig = getGuildConfig(guild.id);
    const welcomeChannelId = guildConfig.welcome_channel_id;
    const welcomeChannel = welcomeChannelId
      ? guild.channels.cache.get(welcomeChannelId)
      : guild.channels.cache.find(c => c.name === 'general');

    if (welcomeChannel) {
      const embed = welcomeEmbed(member, tiltName, genreNames, platformNames);
      const welcomeMsg = await welcomeChannel.send({ embeds: [embed] });
      await welcomeMsg.react('👋').catch(() => {});
    }

    // Delete the original "Get Started" message
    if (selections.welcomeMessage) {
      await selections.welcomeMessage.delete().catch(err =>
        console.error('Failed to delete onboarding message:', err.message)
      );
    }

    // Check if they selected League of Legends
    const pickedLeague = selections.gameNames.some(
      g => g.toLowerCase() === 'league of legends'
    );

    if (pickedLeague) {
      await interaction.editReply({
        content: 'You\'re all set! Welcome to the server.\n\n' +
          '**You selected League of Legends!** Link your Riot account to unlock match tracking, the leaderboard, and the wall of shame:\n' +
          '```\n/league link YourName#TAG\n```',
      });
    } else {
      await interaction.editReply({
        content: 'You\'re all set! Welcome to the server.',
      });
    }

    pendingSelections.delete(key);
  }
}

/**
 * Initialize pending selections for a user (used by /setup command).
 */
function initPendingSelections(guildId, userId) {
  const key = `${guildId}-${userId}`;
  pendingSelections.set(key, {
    tilt: null, genres: [], platforms: [], games: [],
    tiltName: null, genreNames: [], platformNames: [], gameNames: [],
  });
}

module.exports = { handleOnboardingInteraction, initPendingSelections };
