const Anthropic = require('@anthropic-ai/sdk').default;
const config = require('../config');

let client = null;

function getClient() {
  if (!client && config.anthropicApiKey) {
    client = new Anthropic({ apiKey: config.anthropicApiKey, timeout: 10000 });
  }
  return client;
}

const SYSTEM_PROMPT = `You are the post-game analyst for a small Discord gaming server. After group League of Legends games, you provide a short review of how the game went.

Rules:
- Return ONLY the review. No preamble, no quotes, no labels.
- 2-4 sentences. Be concise but insightful.
- Name the players and reference their specific stats (champion, KDA, position).
- On wins: highlight who carried, note any clean performances, celebrate the victory.
- On losses: point out who struggled, question drafts or plays, be honest but not cruel.
- Sports commentator / analyst desk energy — like you watched the whole game.
- Do NOT use hashtags or emojis.
- Keep it fun and engaging for a group of friends.`;

const DEPHARIO_REVIEW_EXTRA = `
One of the players is DEPHARIO — the group's legendary punching bag. Without making it obvious that you're singling him out, naturally weave in harsher commentary about his performance. Don't label it as a "Dephario update" or call out that you're treating him differently — just be naturally meaner when analyzing his stats compared to everyone else's.`;

const TURBOTWIT_REVIEW_EXTRA = `
One of the players is TURBOTWIT. If he played well, make sure to hype it up with genuine surprise or excitement — it's rare and noteworthy. If he played poorly, no need for special treatment.`;

/**
 * Generate an AI post-game review for a group game.
 *
 * @param {Object} opts
 * @param {Object[]} opts.players - Array of { name, champion, kda: {kills,deaths,assists}, position, isDephario, isTurboTwit }
 * @param {boolean} opts.win - Whether the tracked squad won
 * @param {number} opts.duration - Game duration in minutes
 * @param {boolean} opts.sameTeam - Whether all tracked players were on the same team
 * @returns {Promise<string|null>} The review, or null on failure
 */
async function generateGameReview({ players, win, duration, sameTeam }) {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const hasDephario = players.some(p => p.isDephario);
    const hasTurboTwit = players.some(p => p.isTurboTwit);

    let systemPrompt = SYSTEM_PROMPT;
    if (hasDephario) systemPrompt += '\n' + DEPHARIO_REVIEW_EXTRA;
    if (hasTurboTwit) systemPrompt += '\n' + TURBOTWIT_REVIEW_EXTRA;

    const playerLines = players.map(p =>
      `- ${p.name}: ${p.champion} ${p.position || ''} (${p.kda.kills}/${p.kda.deaths}/${p.kda.assists})`
    ).join('\n');

    const teamContext = sameTeam
      ? 'All tracked players were on the same team.'
      : 'Tracked players were on opposite teams.';

    const resultLine = sameTeam
      ? `Result: ${win ? 'VICTORY' : 'DEFEAT'}`
      : 'Result: MIXED (players were on opposite teams — one side won, one lost)';

    const userPrompt = `${resultLine}
Duration: ${duration} minutes
${teamContext}

Players:
${playerLines}

Write a post-game review.`;

    const response = await anthropic.messages.create({
      model: config.ANTHROPIC_MODEL,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content?.[0]?.text?.trim();
    return text || null;
  } catch (err) {
    console.error('AI game review generation failed:', err.message);
    return null;
  }
}

module.exports = { generateGameReview };
