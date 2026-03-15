const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('help')
      .setDescription('Show all available commands'),
    async execute(interaction) {
      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('Tilt Bot Commands')
        .addFields(
          {
            name: 'General',
            value: [
              '`/setup` — Complete onboarding to get your roles',
              '`/roles` — Update your tilt tier, genres, platforms, and games',
              '`/quote add` — Add a quote to the wall',
              '`/quote random` — Get a random quote',
              '`/quote wall` — Show the quote wall',
              '`/quote remove` — Remove a quote by ID',
              '`/league help` — League of Legends commands',
              '`/admin help` — Admin commands (Damage Control)',
            ].join('\n'),
          }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    },
  },
];
