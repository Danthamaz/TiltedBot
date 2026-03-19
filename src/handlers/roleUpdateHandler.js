const { getRolesByCategory, isProtectedRole } = require('../utils/roles');
const { ROLE_CATEGORIES } = require('../config');
const { setMemberGames } = require('../utils/games');
const { buildRoleUpdateComponents } = require('../components/roleSelector');

// Track in-progress role update selections per user
const pendingUpdates = new Map();

function getKey(interaction) {
  return `${interaction.guildId}-${interaction.user.id}`;
}

/**
 * Rebuild components with effective role IDs so defaults and games menu stay in sync.
 */
function rebuildComponents(guildId, selections) {
  const effectiveRoleIds = [...selections.memberRoleIds];

  // Apply tilt changes
  if (selections.tilt) {
    const tiltRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.TILT);
    for (const r of tiltRoles) {
      const idx = effectiveRoleIds.indexOf(r.role_id);
      if (idx !== -1) effectiveRoleIds.splice(idx, 1);
    }
    effectiveRoleIds.push(selections.tilt);
  }

  // Apply genre changes
  if (selections.genres) {
    const genreRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.GENRE);
    for (const r of genreRoles) {
      const idx = effectiveRoleIds.indexOf(r.role_id);
      if (idx !== -1) effectiveRoleIds.splice(idx, 1);
    }
    effectiveRoleIds.push(...selections.genres);
  }

  // Apply platform changes
  if (selections.platforms) {
    const platformRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.PLATFORM);
    for (const r of platformRoles) {
      const idx = effectiveRoleIds.indexOf(r.role_id);
      if (idx !== -1) effectiveRoleIds.splice(idx, 1);
    }
    effectiveRoleIds.push(...selections.platforms);
  }

  return buildRoleUpdateComponents(guildId, effectiveRoleIds, {
    memberGames: selections.gameNames || [],
  });
}

async function handleRoleUpdateInteraction(interaction) {
  const key = getKey(interaction);

  if (!pendingUpdates.has(key)) {
    pendingUpdates.set(key, {
      tilt: null, genres: null, platforms: null, gameNames: null,
      memberRoleIds: interaction.member.roles.cache.map(r => r.id),
    });
  }
  const selections = pendingUpdates.get(key);

  if (interaction.isStringSelectMenu()) {
    // Defer immediately so Discord doesn't time out
    await interaction.deferUpdate();

    if (interaction.customId === 'role_update_tilt') {
      selections.tilt = interaction.values[0];
    } else if (interaction.customId === 'role_update_genre') {
      selections.genres = [...interaction.values];
      selections.gameNames = null; // Reset games since genres changed
      const components = rebuildComponents(interaction.guildId, selections);
      await interaction.editReply({ components });
    } else if (interaction.customId === 'role_update_platform') {
      selections.platforms = [...interaction.values];
      selections.gameNames = null; // Reset games since platforms changed
      const components = rebuildComponents(interaction.guildId, selections);
      await interaction.editReply({ components });
    } else if (interaction.customId === 'role_update_games') {
      selections.gameNames = [...interaction.values];
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === 'role_update_confirm') {
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;
    const guild = interaction.guild;
    const guildId = guild.id;

    // Update tilt tier — remove old, add new
    if (selections.tilt) {
      const tiltRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.TILT);
      for (const r of tiltRoles) {
        const role = guild.roles.cache.get(r.role_id);
        if (role && !isProtectedRole(role.name) && member.roles.cache.has(r.role_id)) {
          await member.roles.remove(role).catch(console.error);
        }
      }
      const newTilt = guild.roles.cache.get(selections.tilt);
      if (newTilt && !isProtectedRole(newTilt.name)) {
        await member.roles.add(newTilt).catch(console.error);
      }
    }

    // Update genres — remove old, add new
    if (selections.genres) {
      const genreRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.GENRE);
      for (const r of genreRoles) {
        const role = guild.roles.cache.get(r.role_id);
        if (role && !isProtectedRole(role.name) && member.roles.cache.has(r.role_id)) {
          await member.roles.remove(role).catch(console.error);
        }
      }
      for (const roleId of selections.genres) {
        const role = guild.roles.cache.get(roleId);
        if (role && !isProtectedRole(role.name)) {
          await member.roles.add(role).catch(console.error);
        }
      }
    }

    // Update platforms — remove old, add new
    if (selections.platforms) {
      const platformRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.PLATFORM);
      for (const r of platformRoles) {
        const role = guild.roles.cache.get(r.role_id);
        if (role && !isProtectedRole(role.name) && member.roles.cache.has(r.role_id)) {
          await member.roles.remove(role).catch(console.error);
        }
      }
      for (const roleId of selections.platforms) {
        const role = guild.roles.cache.get(roleId);
        if (role && !isProtectedRole(role.name)) {
          await member.roles.add(role).catch(console.error);
        }
      }
    }

    // Update games in DB
    if (selections.gameNames !== null) {
      setMemberGames(guildId, member.id, selections.gameNames);
    }

    await interaction.editReply({ content: 'Your roles have been updated!' });
    pendingUpdates.delete(key);
  }
}

module.exports = { handleRoleUpdateInteraction };
