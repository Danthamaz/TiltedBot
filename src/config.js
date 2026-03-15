require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  riotApiKey: process.env.RIOT_API_KEY,

  // Riot API config
  RIOT_REGION: 'americas',        // For account/match APIs
  RIOT_PLATFORM: 'na1',           // For summoner/league APIs
  MATCH_CHECK_INTERVAL: 3 * 60 * 1000, // Check for new matches every 3 minutes
  LEAGUE_CHANNEL_NAME: 'league',  // Channel to post shame/rank messages

  // Roles the bot must never touch
  PROTECTED_ROLES: [
    '👼',      // Memorial — never touch
    'Damage Control', // Admin — manual only
    'Zell',           // Special — manual only
    'Server Booster', // Discord system
    'Jockie Music',   // External bot
  ],

  // Role categories
  ROLE_CATEGORIES: {
    TILT: 'tilt',
    GENRE: 'genre',
    PLATFORM: 'platform',
  },

  // Default tilt tiers (seeded on first run)
  DEFAULT_TILT_TIERS: ['PermaTilted', 'Tilt Proof', 'Tilties'],

  // Default genres
  DEFAULT_GENRES: ['MOBA', 'FPS', 'Survival', 'MMORPG', 'Battle Royale'],

  // Default platforms
  DEFAULT_PLATFORMS: ['PC', 'PS5', 'Xbox'],

  // Game catalog — mapped by genre + platform requirements
  // platform: null means any platform
  GAMES: [
    { name: 'League of Legends', genres: ['MOBA'], platforms: ['PC'], hasIntegration: true },
    { name: 'Dota 2', genres: ['MOBA'], platforms: ['PC'] },
    { name: 'Smite', genres: ['MOBA'], platforms: null },
    { name: 'Valorant', genres: ['FPS'], platforms: ['PC'] },
    { name: 'CS2', genres: ['FPS'], platforms: ['PC'] },
    { name: 'Tarkov', genres: ['FPS', 'Survival'], platforms: ['PC'] },
    { name: 'Call of Duty', genres: ['FPS'], platforms: null },
    { name: 'Rust', genres: ['Survival'], platforms: ['PC'] },
    { name: 'Ark', genres: ['Survival'], platforms: null },
    { name: 'WoW', genres: ['MMORPG'], platforms: ['PC'] },
    { name: 'FFXIV', genres: ['MMORPG'], platforms: ['PC', 'PS5'] },
    { name: 'Apex Legends', genres: ['Battle Royale', 'FPS'], platforms: null },
    { name: 'Fortnite', genres: ['Battle Royale'], platforms: null },
  ],
};
