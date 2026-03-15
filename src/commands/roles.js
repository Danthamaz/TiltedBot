const { SlashCommandBuilder } = require('discord.js');
const { buildRoleUpdateComponents } = require('../components/roleSelector');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('roles')
      .setDescription('Update your server roles (tilt tier, genres, platforms)'),
    async execute(interaction) {
      const { getMemberGames } = require('../utils/games');
      const memberRoleIds = interaction.member.roles.cache.map(r => r.id);
      const memberGames = getMemberGames(interaction.guildId, interaction.user.id);
      const components = buildRoleUpdateComponents(
        interaction.guildId,
        memberRoleIds,
        { memberGames }
      );
      await interaction.reply({
        content: 'Update your roles below:',
        ephemeral: true,
        components,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Manually trigger onboarding if you missed it'),
    async execute(interaction) {
      const { isMemberOnboarded } = require('../utils/roles');
      if (isMemberOnboarded(interaction.guildId, interaction.user.id)) {
        await interaction.reply({
          content: 'You\'ve already completed onboarding! Use `/roles` to update your roles.',
          ephemeral: true,
        });
        return;
      }

      const { buildOnboardingComponents } = require('../components/onboarding');
      const { initPendingSelections } = require('../handlers/onboardingHandler');

      // Initialize pending selections so the onboarding handler can track this user
      initPendingSelections(interaction.guildId, interaction.user.id);

      const components = buildOnboardingComponents(interaction.guildId);
      await interaction.reply({
        content: 'Pick your roles below to get started.\n\n**Step 1:** How tilted are you?\n**Step 2:** Select your Genres\n**Step 3:** Select your Platforms\n**Step 4:** Pick your Games\n\nThen hit **Confirm** to lock it in.',
        components,
        ephemeral: true,
      });
    },
  },
];
