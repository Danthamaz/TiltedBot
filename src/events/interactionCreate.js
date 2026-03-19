const { Collection, MessageFlags } = require('discord.js');
const { handleOnboardingInteraction } = require('../handlers/onboardingHandler');
const { handleRoleUpdateInteraction } = require('../handlers/roleUpdateHandler');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        try {
          const reply = {
            content: 'Something went wrong running that command.',
            flags: MessageFlags.Ephemeral,
          };
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
          } else {
            await interaction.reply(reply);
          }
        } catch (replyError) {
          console.error('Failed to send error reply:', replyError.message);
        }
      }
      return;
    }

    // Handle onboarding select menus and buttons
    if (interaction.customId?.startsWith('onboarding_')) {
      return handleOnboardingInteraction(interaction);
    }

    // Handle role update select menus and buttons
    if (interaction.customId?.startsWith('role_update_')) {
      return handleRoleUpdateInteraction(interaction);
    }
  },
};
