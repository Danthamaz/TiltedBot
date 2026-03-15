const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const commandModule = require(path.join(commandsPath, file));
  // Each file exports an array of command objects
  const cmds = Array.isArray(commandModule) ? commandModule : [commandModule];
  for (const cmd of cmds) {
    commands.push(cmd.data.toJSON());
  }
}

const rest = new REST().setToken(config.token);

(async () => {
  try {
    console.log(`Registering ${commands.length} slash commands...`);

    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );

    console.log('Slash commands registered successfully.');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
})();
