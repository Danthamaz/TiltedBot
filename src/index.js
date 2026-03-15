const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getDb } = require('./database');
const { getRolesByCategory, addRoleDefinition } = require('./utils/roles');
const { startMatchTracker } = require('./services/matchTracker');

// Initialize the client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.GuildMember],
});

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const commandModule = require(path.join(commandsPath, file));
  const cmds = Array.isArray(commandModule) ? commandModule : [commandModule];
  for (const cmd of cmds) {
    client.commands.set(cmd.data.name, cmd);
  }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  client.on(event.name, (...args) => event.execute(...args));
}

// Seed default roles on first ready
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Initialize database
  getDb();

  // Seed default roles and games for each guild the bot is in
  const { seedDefaultGames } = require('./utils/games');
  const { GAMES } = config;
  for (const guild of client.guilds.cache.values()) {
    await seedDefaultRoles(guild);
    seedDefaultGames(guild.id, GAMES);
  }

  // Pin welcome message in onboarding channel if not already pinned
  for (const guild of client.guilds.cache.values()) {
    await pinOnboardingMessage(guild);
    await pinRulesMessage(guild);
    await pinBotHelpMessage(guild);
  }

  // Start onboarding and bot-help channel cleanup loops
  startOnboardingCleanup(client);
  startBotHelpCleanup(client);

  // Start League match tracker
  startMatchTracker(client);

  console.log('Bot is ready.');
});

/**
 * Seed default role definitions if none exist for a guild.
 * Creates Discord roles if they don't already exist.
 */
async function seedDefaultRoles(guild) {
  const guildId = guild.id;
  const { ROLE_CATEGORIES, DEFAULT_TILT_TIERS, DEFAULT_GENRES, DEFAULT_PLATFORMS } = config;

  const seedCategory = async (names, category) => {
    const existing = getRolesByCategory(guildId, category);
    if (existing.length > 0) return; // Already seeded

    for (const name of names) {
      let role = guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase());
      if (!role) {
        role = await guild.roles.create({
          name,
          reason: 'Tilted Bot auto-seed',
        }).catch(err => {
          console.error(`Failed to create role ${name}:`, err);
          return null;
        });
      }
      if (role) {
        addRoleDefinition(guildId, role.id, name, category);
      }
    }
  };

  await seedCategory(DEFAULT_TILT_TIERS, ROLE_CATEGORIES.TILT);
  await seedCategory(DEFAULT_GENRES, ROLE_CATEGORIES.GENRE);
  await seedCategory(DEFAULT_PLATFORMS, ROLE_CATEGORIES.PLATFORM);
}

/**
 * Check if the bot already has a message in the channel (pinned or recent).
 * Fetches last 50 messages and checks for bot authorship.
 */
async function hasBotMessage(channel, botId) {
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    for (const [, msg] of messages) {
      if (msg.author?.id === botId) return true;
    }
    return false;
  } catch (err) {
    console.error(`[pin-check] Failed to fetch messages in #${channel.name}:`, err.message);
    return true; // Can't check — skip to avoid duplicates
  }
}

/**
 * Send and pin the rules message in #rules if not already present.
 */
async function pinRulesMessage(guild) {
  const channel = guild.channels.cache.find(c => c.name === 'rules');
  if (!channel) return;

  if (await hasBotMessage(channel, guild.client.user.id)) return;

  const msg = await channel.send(
    '# \u2694\uFE0F The Rules of Tilt\n\n' +
    '> **Rule 1** \u2014 There are no rules.\n' +
    '> **Rule 2** \u2014 If it\'s your first night, you have to play.\n' +
    '> **Rule 3** \u2014 What happens in voice stays in voice.\n' +
    '> **Rule 4** \u2014 If you\'re tilted, that\'s your problem.\n' +
    '> **Rule 5** \u2014 No one cares about your rank.\n' +
    '> **Rule 6** \u2014 Refer to Rule 1.\n\n' +
    '\u2E3B\n\n' +
    '*If you made it this far, you already belong here.*'
  ).catch(err => {
    console.error('Failed to send rules message:', err.message);
    return null;
  });

  if (msg) {
    await msg.pin().catch(err =>
      console.error('Failed to pin rules message:', err.message)
    );
  }
}

/**
 * Send and pin the welcome message in onboarding channel if not already present.
 */
async function pinOnboardingMessage(guild) {
  const { getGuildConfig } = require('./utils/roles');
  const guildConfig = getGuildConfig(guild.id);
  if (!guildConfig.onboarding_channel_id) return;

  const channel = guild.channels.cache.get(guildConfig.onboarding_channel_id);
  if (!channel) return;

  if (await hasBotMessage(channel, guild.client.user.id)) return;

  const msg = await channel.send(
    '# \u{1F44B} Welcome to The Tilted\n' +
    "If you can only see this channel, it's because you haven't picked your roles yet.\n\n" +
    'Type `/setup` to get started.\n\n' +
    "You'll choose your level of tilt, genres, platforms, and games.\n" +
    'Once you confirm, the rest of the server opens up.'
  ).catch(err => {
    console.error('Failed to send onboarding pin message:', err.message);
    return null;
  });

  if (msg) {
    await msg.pin().catch(err =>
      console.error('Failed to pin onboarding message:', err.message)
    );
  }
}

/**
 * Send and pin the bot-help message in #bot-help if not already present.
 */
async function pinBotHelpMessage(guild) {
  const channel = guild.channels.cache.find(c => c.name === 'bot-help');
  if (!channel) return;

  if (await hasBotMessage(channel, guild.client.user.id)) return;

  const msg = await channel.send(
    '# \u{1F916} Tilt Bot Help\n\n' +
    '## First Time Here?\n' +
    'Head to the onboarding channel and type `/setup` to pick your roles.\n' +
    "You'll choose your tilt tier, genres, and platforms — then the server opens up.\n\n" +
    '## Want to Change Your Roles?\n' +
    'Type `/roles` in any channel. An ephemeral menu will pop up where you can update your tilt tier, genres, and platforms.\n\n' +
    '## League of Legends\n' +
    'Link your Riot account with `/league link YourName#TAG` to unlock match tracking, ranks, and the wall of shame.\n\n' +
    '## Commands\n' +
    '> `/help` \u2014 Full list of all commands\n' +
    '> `/league help` \u2014 League of Legends commands\n' +
    '> `/admin help` \u2014 Admin commands (Damage Control)'
  ).catch(err => {
    console.error('Failed to send bot-help message:', err.message);
    return null;
  });

  if (msg) {
    await msg.pin().catch(err =>
      console.error('Failed to pin bot-help message:', err.message)
    );
  }
}

/**
 * Periodically delete non-pinned messages in #bot-help.
 */
function startBotHelpCleanup(client) {
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        const channel = guild.channels.cache.find(c => c.name === 'bot-help');
        if (!channel) continue;

        const messages = await channel.messages.fetch({ limit: 100 });
        for (const msg of messages.values()) {
          if (msg.pinned) continue;
          if (msg.author.id === guild.client.user.id && msg.type === 21) continue; // Skip pin system messages
          await msg.delete().catch(() => {});
        }
      } catch (err) {
        console.error(`Bot-help cleanup error for ${guild.name}:`, err.message);
      }
    }
  }, 30 * 1000); // Run every 30 seconds
}

/**
 * Periodically delete non-pinned messages older than 15 minutes in the onboarding channel.
 */
function startOnboardingCleanup(client) {
  const { getGuildConfig } = require('./utils/roles');
  const FIFTEEN_MINUTES = 15 * 60 * 1000;

  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        const config = getGuildConfig(guild.id);
        if (!config.onboarding_channel_id) continue;

        const channel = guild.channels.cache.get(config.onboarding_channel_id);
        if (!channel) continue;

        const messages = await channel.messages.fetch({ limit: 100 });
        const now = Date.now();

        for (const msg of messages.values()) {
          if (msg.pinned) continue;
          if (now - msg.createdTimestamp > FIFTEEN_MINUTES) {
            await msg.delete().catch(() => {});
          }
        }
      } catch (err) {
        console.error(`Onboarding cleanup error for ${guild.name}:`, err.message);
      }
    }
  }, 60 * 1000); // Run every minute
}

// Catch unhandled promise rejections so the bot doesn't crash
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error.message);
});

// Login
client.login(config.token);
