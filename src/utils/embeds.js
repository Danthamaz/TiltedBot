const { EmbedBuilder } = require('discord.js');

function onboardingEmbed(member) {
  return new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle('Welcome to the Tilt Zone')
    .setDescription(
      `Hey ${member}, welcome to the server!\n\n` +
      `Pick your roles below to get started. You need to complete this before you can access the rest of the server.\n\n` +
      `**Step 1:** Choose your level of tilt\n` +
      `**Step 2:** Select your Genres\n` +
      `**Step 3:** Select your Platforms\n\n` +
      `Then hit **Confirm** to lock it in.`
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
}

function welcomeEmbed(member, tiltTier, genres, platforms) {
  const genreList = genres.length ? genres.join(', ') : 'None';
  const platformList = platforms.length ? platforms.join(', ') : 'None';

  return new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle('New Tilter Arrived')
    .setDescription(
      `${member} just joined. They're a **${tiltTier}** who plays **${genreList}** on **${platformList}**. Stay tilted.`
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
}

function leaveEmbed(member, tiltTier, genres, platforms, daysAsMember) {
  const genreList = genres.length ? genres.join(', ') : 'None';
  const platformList = platforms.length ? platforms.join(', ') : 'None';
  const tierStr = tiltTier || 'No tier';

  return new EmbedBuilder()
    .setColor(0x888888)
    .setDescription(
      `**${member.user.tag}** tilted to hard and left the server. ` +
      `They were **${tierStr}**, played **${genreList}** on **${platformList}**. ` +
      `Member for **${daysAsMember}** days.`
    )
    .setTimestamp();
}

function rosterEmbed(tiltCounts, genreCounts, platformCounts, noRolesCount) {
  const formatCounts = (counts) =>
    Object.entries(counts)
      .map(([name, count]) => `${name} (${count})`)
      .join(' | ') || 'None';

  return new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle('Server Roster')
    .addFields(
      { name: 'Tilt Tiers', value: formatCounts(tiltCounts) },
      { name: 'Genres', value: formatCounts(genreCounts) },
      { name: 'Platforms', value: formatCounts(platformCounts) },
      { name: 'No Roles', value: `${noRolesCount} members` }
    )
    .setTimestamp();
}

module.exports = {
  onboardingEmbed,
  welcomeEmbed,
  leaveEmbed,
  rosterEmbed,
};
