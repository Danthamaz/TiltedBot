const Anthropic = require('@anthropic-ai/sdk').default;
const config = require('../config');
const { getRecentMatches } = require('../utils/league');

let client = null;

function getClient() {
  if (!client && config.anthropicApiKey) {
    client = new Anthropic({ apiKey: config.anthropicApiKey, timeout: 10000 });
  }
  return client;
}

/**
 * Check if a performance qualifies as "really good."
 * Returns a reason string if it qualifies, null if not.
 *
 * TurboTwit has lower thresholds.
 */
function isGoodGame(stats, isTurboTwit) {
  const { kills, deaths, assists } = stats;
  const ka = kills + assists;
  const kda = deaths === 0 ? ka : ka / deaths;

  if (isTurboTwit) {
    if (deaths === 0 && ka >= 5) return 'zero-death';
    if (kills >= 12) return 'high-kills';
    if (kda >= 4.0 && ka >= 5) return 'high-kda';
    if (ka >= 20) return 'high-participation';
    return null;
  }

  if (deaths === 0 && ka >= 5) return 'zero-death';
  if (kills >= 15) return 'high-kills';
  if (kda >= 5.0 && ka >= 5) return 'high-kda';
  if (ka >= 20) return 'high-participation';
  return null;
}

const SYSTEM_PROMPT = `You are the hype commentator in a small Discord gaming server. You compliment players who have exceptional League of Legends games.

Rules:
- Return ONLY the compliment message. No preamble, no quotes, no labels.
- Reference specific details from the match (champion, KDA, position).
- Keep it genuine and fun — this is friends hyping friends.
- Do NOT use hashtags or emojis.
- 1-2 sentences for regular players.`;

const TURBOTWIT_EXTRA = `
SPECIAL INSTRUCTIONS — This player is TURBOTWIT. He rarely pops off, so when he does it's a BIG deal. Mix between two modes:
- MODE 1 (genuine hype): Be over-the-top impressed, like he just won Worlds. Act like you're witnessing history.
- MODE 2 (shocked disbelief): Act like you can't believe TurboTwit actually played well. Question reality. Suggest checking the replay for evidence of account sharing.
Pick one mode randomly. Either way, make it 2-3 sentences and more dramatic than a normal player's compliment.`;

const COMPLIMENT_MESSAGES = {
  'high-kda': [
    "That KDA is disgusting. In a good way.",
    "Clean game. The scoreboard is smiling.",
    "That's how you carry a game. Respect.",
    "Absolutely surgical performance.",
    "Your KDA just made everyone else look bad.",
  ],
  'zero-death': [
    "A deathless game. Untouchable.",
    "Zero deaths? Were you even playing the same game as the enemy team?",
    "Flawless. Not a single death. The enemy team couldn't touch you.",
    "Deathless carry. That's a statement game.",
    "Zero deaths. You made that look easy.",
  ],
  'high-kills': [
    "You woke up and chose violence. Respect.",
    "That kill count is absurd. The enemy team is traumatized.",
    "Absolute rampage. The rift was not safe today.",
    "Kill after kill. You were the final boss this game.",
    "That's a highlight reel game right there.",
  ],
  'high-participation': [
    "You were EVERYWHERE that game. Massive impact.",
    "That kill participation is unreal. You touched everything.",
    "Involved in everything. The team runs through you.",
    "You had a hand in every fight. That's how you win games.",
    "Everywhere at once. The enemy couldn't escape you.",
  ],
};

const TURBOTWIT_FALLBACK = [
  "TurboTwit actually carried? Check the replay, someone might be on his account.",
  "Wait... TurboTwit popped off? Is the simulation broken?",
  "TurboTwit just had a good game. Screenshot this, it won't happen again.",
  "Hold on. TurboTwit... carried? I need a minute.",
  "TurboTwit diff. Three words I never thought I'd say.",
  "Genuinely incredible game from TurboTwit. The man showed up TODAY.",
  "TurboTwit just proved every doubter wrong. For one game. Let's not get carried away.",
  "That was actually insane from TurboTwit. Mark the calendar.",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Format match history into a readable string for the prompt.
 */
function formatMatchHistory(matches) {
  if (!matches || !matches.length) return 'No recent history available.';
  return matches.map((m, i) => {
    const result = m.win ? 'WIN' : 'LOSS';
    return `${i + 1}. ${result} — ${m.champion} (${m.kills}/${m.deaths}/${m.assists}) ${m.position || ''}`;
  }).join('\n');
}

/**
 * Generate an AI compliment for a standout performance.
 *
 * @param {Object} opts
 * @param {string} opts.playerName - Display name
 * @param {string} opts.champion - Champion played
 * @param {Object} opts.kda - { kills, deaths, assists }
 * @param {string} opts.position - Position played
 * @param {string} opts.guildId - Guild ID for match history lookup
 * @param {string} opts.userId - User ID for match history lookup
 * @param {boolean} opts.isTurboTwit - Whether this is TurboTwit
 * @param {string} opts.reason - Why this qualifies (from isGoodGame)
 * @returns {Promise<string|null>} The compliment message, or null on failure
 */
async function generateCompliment({ playerName, champion, kda, position, guildId, userId, isTurboTwit, reason }) {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const recentMatches = getRecentMatches(guildId, userId, 10);
    const history = formatMatchHistory(recentMatches);

    let systemPrompt = SYSTEM_PROMPT;
    if (isTurboTwit) {
      systemPrompt += '\n' + TURBOTWIT_EXTRA;
    }

    const userPrompt = `Player: ${playerName}
This game: ${champion} (${kda.kills}/${kda.deaths}/${kda.assists}) playing ${position || 'unknown position'}
Standout reason: ${reason}

Recent match history (most recent first):
${history}

Generate a compliment for this performance.`;

    const response = await anthropic.messages.create({
      model: config.ANTHROPIC_MODEL,
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content?.[0]?.text?.trim();
    return text || null;
  } catch (err) {
    console.error('AI compliment generation failed:', err.message);
    return null;
  }
}

/**
 * Get a hardcoded fallback compliment.
 */
function getFallbackCompliment(reason, isTurboTwit) {
  if (isTurboTwit) return pick(TURBOTWIT_FALLBACK);
  const pool = COMPLIMENT_MESSAGES[reason];
  return pool ? pick(pool) : pick(COMPLIMENT_MESSAGES['high-kda']);
}

module.exports = { isGoodGame, generateCompliment, getFallbackCompliment };
