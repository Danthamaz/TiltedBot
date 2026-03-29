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
 * Determine escalation tier from streak count.
 * Tier 1 (2-3): Playful teasing
 * Tier 2 (4-6): Pointed roasts
 * Tier 3 (7+):  Unhinged
 */
function getEscalationTier(streak, isDephario) {
  if (isDephario) {
    // Dephario starts at tier 2 minimum, hits tier 3 faster
    if (streak >= 5) return 3;
    return 2;
  }
  if (streak >= 7) return 3;
  if (streak >= 4) return 2;
  return 1;
}

const TIER_INSTRUCTIONS = {
  1: `Tone: PLAYFUL. Light teasing, like a friend poking fun. Keep it casual and witty. One short sentence, maybe two.`,
  2: `Tone: POINTED. More serious roasting — question their life choices, reference their bad plays. Be cutting but still funny. 1-2 sentences.`,
  3: `Tone: UNHINGED. Go absolutely wild. All-caps energy, dramatic, absurd, over-the-top. Act like you're witnessing a historic disaster. 1-3 sentences.`,
};

const SYSTEM_PROMPT = `You are the trash-talk bot in a small Discord gaming server. You roast players who lose in League of Legends.

Rules:
- Return ONLY the roast message. No preamble, no quotes, no labels, no "Here's a roast:" prefix.
- Never repeat yourself — every message must feel fresh and unique.
- Reference specific details from the match when possible (champion, KDA, position, patterns).
- Keep it fun — this is friends roasting friends, not bullying.
- Never use slurs, bigotry, or genuinely hurtful personal attacks.
- Do NOT use hashtags or emojis.`;

const DEPHARIO_EXTRA = `
SPECIAL INSTRUCTIONS — This player is DEPHARIO. He is the group's legendary punching bag. Be EXTRA brutal with him:
- Every loss from Dephario is expected. Every win is suspicious.
- Reference his long and storied history of feeding.
- Make it personal — he can take it and the group expects maximum savagery.
- Be creative with the insults — compare him to absurd things, invent fake statistics about his losing.
- He gets roasted on EVERY loss, not just streaks. Even a single loss deserves callout.`;

const SQUAD_INSTRUCTIONS = `You are roasting a GROUP of players who lost together as a squad. Focus on:
- Their terrible teamwork and synergy
- The fact that they somehow make each other worse
- Question why they keep queuing together
- Blame the group dynamic, not just individuals
- If specific players have notably bad stats, call them out by name`;

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
 * Generate an AI burn message for an individual player loss.
 *
 * @param {Object} opts
 * @param {string} opts.playerName - Display name
 * @param {number} opts.streak - Current loss streak
 * @param {string} opts.champion - Champion played this game
 * @param {Object} opts.kda - { kills, deaths, assists }
 * @param {string} opts.position - Position played
 * @param {string} opts.guildId - Guild ID for match history lookup
 * @param {string} opts.userId - User ID for match history lookup
 * @param {boolean} opts.isDephario - Whether this is Dephario
 * @returns {Promise<string|null>} The burn message, or null on failure
 */
async function generateBurn({ playerName, streak, champion, kda, position, guildId, userId, isDephario: isDephi }) {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const tier = getEscalationTier(streak, isDephi);
    const recentMatches = getRecentMatches(guildId, userId, 10);
    const history = formatMatchHistory(recentMatches);

    let systemPrompt = SYSTEM_PROMPT + '\n\n' + TIER_INSTRUCTIONS[tier];
    if (isDephi) {
      systemPrompt += '\n' + DEPHARIO_EXTRA;
    }

    const userPrompt = `Player: ${playerName}
Loss streak: ${streak}
This game: ${champion} (${kda.kills}/${kda.deaths}/${kda.assists}) playing ${position || 'unknown position'}

Recent match history (most recent first):
${history}

Generate a roast for this loss.`;

    const response = await anthropic.messages.create({
      model: config.ANTHROPIC_MODEL,
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content?.[0]?.text?.trim();
    return text || null;
  } catch (err) {
    console.error('AI burn generation failed:', err.message);
    return null;
  }
}

/**
 * Generate an AI burn message for a squad loss.
 *
 * @param {Object} opts
 * @param {string[]} opts.squadMembers - Array of { name, champion, kda, position } objects
 * @param {number} opts.streak - Current squad loss streak
 * @returns {Promise<string|null>} The burn message, or null on failure
 */
async function generateSquadBurn({ squadMembers, streak }) {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const tier = getEscalationTier(streak, false);

    const systemPrompt = SYSTEM_PROMPT + '\n\n' + TIER_INSTRUCTIONS[tier] + '\n' + SQUAD_INSTRUCTIONS;

    const playerLines = squadMembers.map(m =>
      `- ${m.name}: ${m.champion} (${m.kda.kills}/${m.kda.deaths}/${m.kda.assists}) ${m.position || ''}`
    ).join('\n');

    const userPrompt = `Squad loss streak: ${streak}

Players in this game:
${playerLines}

Generate a roast for this squad loss.`;

    const response = await anthropic.messages.create({
      model: config.ANTHROPIC_MODEL,
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content?.[0]?.text?.trim();
    return text || null;
  } catch (err) {
    console.error('AI squad burn generation failed:', err.message);
    return null;
  }
}

module.exports = { generateBurn, generateSquadBurn };
