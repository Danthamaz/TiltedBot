const { leaveEmbed } = require('../utils/embeds');
const { getGuildConfig, getRolesByCategory } = require('../utils/roles');
const { ROLE_CATEGORIES } = require('../config');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    const guildId = member.guild.id;
    const config = getGuildConfig(guildId);

    const channelId = config.log_channel_id;
    if (!channelId) return;

    const channel = member.guild.channels.cache.get(channelId);
    if (!channel) return;

    // Determine their roles before they left
    const tiltRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.TILT);
    const genreRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.GENRE);
    const platformRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.PLATFORM);

    const memberRoleIds = member.roles.cache.map(r => r.id);

    const tiltTier = tiltRoles.find(r => memberRoleIds.includes(r.role_id))?.name;
    const genres = genreRoles
      .filter(r => memberRoleIds.includes(r.role_id))
      .map(r => r.name);
    const platforms = platformRoles
      .filter(r => memberRoleIds.includes(r.role_id))
      .map(r => r.name);

    const joinedAt = member.joinedAt || new Date();
    const daysAsMember = Math.floor((Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24));

    const embed = leaveEmbed(member, tiltTier, genres, platforms, daysAsMember);
    await channel.send({ embeds: [embed] });
  },
};
