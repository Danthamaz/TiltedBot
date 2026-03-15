const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getRolesByCategory } = require('../utils/roles');
const { ROLE_CATEGORIES } = require('../config');

function buildTiltSelect(guildId) {
  const tiltRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.TILT);
  if (!tiltRoles.length) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId('onboarding_tilt')
    .setPlaceholder('How tilted are you?')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      tiltRoles.map(r => ({
        label: r.name,
        value: r.role_id,
      }))
    );

  return new ActionRowBuilder().addComponents(menu);
}

function buildGenreSelect(guildId) {
  const genreRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.GENRE);
  if (!genreRoles.length) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId('onboarding_genre')
    .setPlaceholder('Choose your Genres')
    .setMinValues(1)
    .setMaxValues(genreRoles.length)
    .addOptions(
      genreRoles.map(r => ({
        label: r.name,
        value: r.role_id,
      }))
    );

  return new ActionRowBuilder().addComponents(menu);
}

function buildPlatformSelect(guildId) {
  const platformRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.PLATFORM);
  if (!platformRoles.length) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId('onboarding_platform')
    .setPlaceholder('Choose your Platforms')
    .setMinValues(1)
    .setMaxValues(platformRoles.length)
    .addOptions(
      platformRoles.map(r => ({
        label: r.name,
        value: r.role_id,
      }))
    );

  return new ActionRowBuilder().addComponents(menu);
}

function buildConfirmButton() {
  const button = new ButtonBuilder()
    .setCustomId('onboarding_confirm')
    .setLabel('Confirm Roles')
    .setStyle(ButtonStyle.Success);

  return new ActionRowBuilder().addComponents(button);
}

function buildOnboardingComponents(guildId) {
  const rows = [
    buildTiltSelect(guildId),
    buildGenreSelect(guildId),
    buildPlatformSelect(guildId),
    buildConfirmButton(),
  ].filter(Boolean);

  return rows;
}

module.exports = {
  buildTiltSelect,
  buildGenreSelect,
  buildPlatformSelect,
  buildConfirmButton,
  buildOnboardingComponents,
};
