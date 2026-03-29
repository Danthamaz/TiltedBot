# AI-Powered Burn Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded burn message selection with AI-generated, context-aware roasts using Claude API, falling back to existing messages on failure.

**Architecture:** A new `burnGenerator.js` service builds prompts with match context and escalation tiers, calls Claude Haiku, and returns a burn message string (or null on failure). `matchTracker.js` calls this at each burn point, falling back to the existing `pick()` functions when the AI returns null.

**Tech Stack:** Node.js, `@anthropic-ai/sdk`, Claude Haiku (`claude-haiku-4-5-20251001`)

---

### Task 1: Install Anthropic SDK and Add Config

**Files:**
- Modify: `package.json`
- Modify: `src/config.js:1-57`

- [ ] **Step 1: Install the Anthropic SDK**

Run:
```bash
cd /c/Apps/TiltedBot && npm install @anthropic-ai/sdk
```

Expected: `@anthropic-ai/sdk` added to `dependencies` in `package.json`.

- [ ] **Step 2: Add Anthropic config to `src/config.js`**

Add after line 4 (`riotApiKey: process.env.RIOT_API_KEY,`):

```js
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: 'claude-haiku-4-5-20251001',
```

- [ ] **Step 3: Add `ANTHROPIC_API_KEY` placeholder to `.env`**

Add to the end of `.env`:

```
ANTHROPIC_API_KEY=
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/config.js .env
git commit -m "feat: add Anthropic SDK dependency and config for AI burns"
```

---

### Task 2: Create `burnGenerator.js` Service

**Files:**
- Create: `src/services/burnGenerator.js`

- [ ] **Step 1: Create `src/services/burnGenerator.js` with the full implementation**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/services/burnGenerator.js
git commit -m "feat: add AI burn message generator service"
```

---

### Task 3: Integrate `burnGenerator` into `matchTracker.js`

**Files:**
- Modify: `src/services/matchTracker.js:1-4` (add import)
- Modify: `src/services/matchTracker.js:285-304` (Dephario burn)
- Modify: `src/services/matchTracker.js:306-321` (regular player burn)
- Modify: `src/services/matchTracker.js:448-454` (squad burn in `announceGameEnd`)

- [ ] **Step 1: Add import at the top of `matchTracker.js`**

Add after line 4 (`const { getAllLinkedAccounts, ...} = require('../utils/league');`):

```js
const { generateBurn, generateSquadBurn } = require('./burnGenerator');
```

- [ ] **Step 2: Replace Dephario burn section (lines 285-303)**

Replace the block starting with `if (!stats.win && isDephi) {` (line 285) through its closing `}` (line 303) with:

```js
          if (!stats.win && isDephi) {
            // Try AI-generated burn, fall back to hardcoded
            const aiMsg = await generateBurn({
              playerName: account.game_name,
              streak: streakResult.streak,
              champion: stats.champion,
              kda: { kills: stats.kills, deaths: stats.deaths, assists: stats.assists },
              position: stats.position,
              guildId: guild.id,
              userId: account.user_id,
              isDephario: true,
            });
            const msg = aiMsg || getDepharioMessage(streakResult.streak);

            const embed = new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle('💀 Dephario Update')
              .setDescription(
                `**${account.game_name}** just lost on **${stats.champion}** (${stats.kills}/${stats.deaths}/${stats.assists}).\n\n` +
                `${msg}\n\n` +
                (streakResult.streak > 1 ? `🔥 Loss streak: **${streakResult.streak}**` : '')
              )
              .setTimestamp();

            const sent = await leagueChannel.send({ embeds: [embed] });

            // Add snowballing reactions
            const reactions = getDepharioReactions(streakResult.streak);
            for (const emoji of reactions) {
              await sent.react(emoji).catch(() => {});
            }
          }
```

- [ ] **Step 3: Replace regular player burn section (lines 306-321)**

Replace the block starting with `else if (!stats.win && streakResult.streak >= 2) {` (line 306) through its closing `}` (line 321) with:

```js
          else if (!stats.win && streakResult.streak >= 2) {
            // Try AI-generated burn, fall back to hardcoded
            const aiMsg = await generateBurn({
              playerName: account.game_name,
              streak: streakResult.streak,
              champion: stats.champion,
              kda: { kills: stats.kills, deaths: stats.deaths, assists: stats.assists },
              position: stats.position,
              guildId: guild.id,
              userId: account.user_id,
              isDephario: false,
            });
            const msg = aiMsg || getShameMessage(streakResult.streak);

            if (msg) {
              const embed = new EmbedBuilder()
                .setColor(0xff4444)
                .setTitle('📉 Tilt Alert')
                .setDescription(
                  `<@${account.user_id}> lost on **${stats.champion}** (${stats.kills}/${stats.deaths}/${stats.assists}).\n\n` +
                  `${msg}\n\n` +
                  `🔥 Loss streak: **${streakResult.streak}**`
                )
                .setTimestamp();

              await leagueChannel.send({ embeds: [embed] });
            }
          }
```

- [ ] **Step 4: Replace squad burn in `announceGameEnd` (lines 451-453)**

Replace this block inside `announceGameEnd`:

```js
  if (!squadWon && squadResult.streak >= 2) {
    const roast = getSquadShameMessage(squadResult.streak);
    description += `\n\n🔥 **Squad loss streak: ${squadResult.streak}**\n${roast}`;
  }
```

With:

```js
  if (!squadWon && squadResult.streak >= 2) {
    // Build squad member info for AI burn
    const squadMemberInfo = gameData.players.map(p => {
      const participant = match.info.participants.find(mp => mp.puuid === p.puuid);
      if (!participant) return { name: p.gameName, champion: 'Unknown', kda: { kills: 0, deaths: 0, assists: 0 }, position: '' };
      return {
        name: p.gameName,
        champion: participant.championName,
        kda: { kills: participant.kills, deaths: participant.deaths, assists: participant.assists },
        position: participant.teamPosition || '',
      };
    });

    const aiRoast = await generateSquadBurn({
      squadMembers: squadMemberInfo,
      streak: squadResult.streak,
    });
    const roast = aiRoast || getSquadShameMessage(squadResult.streak);
    description += `\n\n🔥 **Squad loss streak: ${squadResult.streak}**\n${roast}`;
  }
```

- [ ] **Step 5: Commit**

```bash
git add src/services/matchTracker.js
git commit -m "feat: integrate AI burn generator into match tracker with hardcoded fallback"
```

---

### Task 4: Manual Verification

- [ ] **Step 1: Ensure `ANTHROPIC_API_KEY` is set in `.env`**

Add your Anthropic API key to `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 2: Start the bot and verify it loads**

Run:
```bash
cd /c/Apps/TiltedBot && npm start
```

Expected: Bot starts without errors, prints "Match tracker started." No import errors or missing module issues.

- [ ] **Step 3: Verify fallback works without API key**

Temporarily clear the API key in `.env` (`ANTHROPIC_API_KEY=`), restart the bot, and confirm that losses still produce hardcoded burn messages (the old behavior).

- [ ] **Step 4: Verify AI burns with API key**

Restore the API key, restart the bot, and wait for a tracked player to lose a game. The burn message should now be unique and context-aware — referencing the specific champion and KDA.

- [ ] **Step 5: Final commit (if any adjustments needed)**

```bash
git add -A && git commit -m "fix: adjustments from manual testing"
```
