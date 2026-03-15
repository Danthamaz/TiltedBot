const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../utils/roles');
const { getDb } = require('../database');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    const guildId = member.guild.id;
    const config = getGuildConfig(guildId);

    // Track the member (not yet onboarded)
    const db = getDb();
    db.prepare(
      `INSERT OR IGNORE INTO members (guild_id, user_id) VALUES (?, ?)`
    ).run(guildId, member.id);

    // Find the onboarding channel
    const channelId = config.onboarding_channel_id;
    if (!channelId) {
      console.warn(`No onboarding channel configured for guild ${guildId}`);
      return;
    }

    const channel = member.guild.channels.cache.get(channelId);
    if (!channel) {
      console.warn(`Onboarding channel ${channelId} not found in guild ${guildId}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle('Welcome to the Tilt Zone')
      .setDescription(
        `Hey ${member}, welcome to the server!\n\n` +
        `Hit the button below to pick your roles and get access.`
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`onboarding_start_${member.id}`)
        .setLabel('Get Started')
        .setStyle(ButtonStyle.Success)
    );

    await channel.send({
      content: `${member}`,
      embeds: [embed],
      components: [row],
    }).catch(err => {
      console.error(`Failed to send onboarding message for ${member.user.tag}:`, err.message);
    });
  },
};
