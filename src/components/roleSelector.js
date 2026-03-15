const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getRolesByCategory } = require('../utils/roles');
const { ROLE_CATEGORIES } = require('../config');
const { getMatchingGames } = require('../utils/games');

/**
 * Build a role selection UI for updating roles.
 * Similar to onboarding but uses different custom IDs and pre-selects current roles.
 */
function buildRoleUpdateComponents(guildId, memberRoleIds, options = {}) {
  const rows = [];

  if (options.showTilt !== false) {
    const tiltRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.TILT);
    if (tiltRoles.length) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('role_update_tilt')
        .setPlaceholder('How tilted are you?')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          tiltRoles.map(r => ({
            label: r.name,
            value: r.role_id,
            default: memberRoleIds.includes(r.role_id),
          }))
        );
      rows.push(new ActionRowBuilder().addComponents(menu));
    }
  }

  if (options.showGenres !== false) {
    const genreRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.GENRE);
    if (genreRoles.length) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('role_update_genre')
        .setPlaceholder('Change your Genres')
        .setMinValues(1)
        .setMaxValues(genreRoles.length)
        .addOptions(
          genreRoles.map(r => ({
            label: r.name,
            value: r.role_id,
            default: memberRoleIds.includes(r.role_id),
          }))
        );
      rows.push(new ActionRowBuilder().addComponents(menu));
    }
  }

  if (options.showPlatforms !== false) {
    const platformRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.PLATFORM);
    if (platformRoles.length) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('role_update_platform')
        .setPlaceholder('Change your Platforms')
        .setMinValues(1)
        .setMaxValues(platformRoles.length)
        .addOptions(
          platformRoles.map(r => ({
            label: r.name,
            value: r.role_id,
            default: memberRoleIds.includes(r.role_id),
          }))
        );
      rows.push(new ActionRowBuilder().addComponents(menu));
    }
  }

  // Games menu — compute from effective genre/platform role names
  const genreRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.GENRE);
  const platformRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.PLATFORM);
  const genreNames = genreRoles.filter(r => memberRoleIds.includes(r.role_id)).map(r => r.name);
  const platformNames = platformRoles.filter(r => memberRoleIds.includes(r.role_id)).map(r => r.name);

  if (genreNames.length && platformNames.length) {
    const games = getMatchingGames(guildId, genreNames, platformNames);
    if (games.length) {
      const gameMenu = new StringSelectMenuBuilder()
        .setCustomId('role_update_games')
        .setPlaceholder('Update your Games')
        .setMinValues(1)
        .setMaxValues(games.length)
        .addOptions(
          games.map(g => ({
            label: g.name,
            value: g.name,
            default: (options.memberGames || []).includes(g.name),
          }))
        );
      rows.push(new ActionRowBuilder().addComponents(gameMenu));
    }
  }

  const confirmBtn = new ButtonBuilder()
    .setCustomId('role_update_confirm')
    .setLabel('Update Roles')
    .setStyle(ButtonStyle.Primary);
  rows.push(new ActionRowBuilder().addComponents(confirmBtn));

  return rows;
}

module.exports = { buildRoleUpdateComponents };
