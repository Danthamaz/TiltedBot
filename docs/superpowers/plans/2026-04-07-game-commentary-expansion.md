# Game Commentary Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand TiltedBot to compliment standout performances (with extra hype for TurboTwit), generate AI game reviews for group games, and naturalize Dephario's roasts by removing his special branding.

**Architecture:** Two new services (`complimentGenerator.js`, `gameReviewGenerator.js`) follow the existing `burnGenerator.js` pattern — each exports an async function that calls Claude Haiku with a tailored prompt and falls back to hardcoded messages on failure. The `matchTracker.js` orchestrator is modified to detect good performances, call the new services, and merge Dephario's code path into the unified loss-announcement flow.

**Tech Stack:** Node.js, Discord.js v14 (EmbedBuilder), @anthropic-ai/sdk (Claude Haiku), better-sqlite3 (existing match_history)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/services/complimentGenerator.js` | **Create** | `generateCompliment()` — AI compliment with TurboTwit weighting, hardcoded fallbacks |
| `src/services/gameReviewGenerator.js` | **Create** | `generateGameReview()` — AI post-game analysis for group games |
| `src/services/burnGenerator.js` | **Modify** | Remove `DEPHARIO_MESSAGES`, add `SINGLE_LOSS_MESSAGES` fallback for streak-1 losses |
| `src/services/matchTracker.js` | **Modify** | Add compliment detection logic, unify Dephario embed path, integrate game review into `announceGameEnd` |

---

### Task 1: Create `complimentGenerator.js`

**Files:**
- Create: `src/services/complimentGenerator.js`

- [ ] **Step 1: Create the compliment generator service**

Create `src/services/complimentGenerator.js` with the following content:

```javascript
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
```

- [ ] **Step 2: Verify the file loads without syntax errors**

Run: `node -e "require('./src/services/complimentGenerator.js')" 2>&1`
Expected: No output (clean require)

- [ ] **Step 3: Commit**

```bash
git add src/services/complimentGenerator.js
git commit -m "feat: add compliment generator service with TurboTwit weighting"
```

---

### Task 2: Create `gameReviewGenerator.js`

**Files:**
- Create: `src/services/gameReviewGenerator.js`

- [ ] **Step 1: Create the game review generator service**

Create `src/services/gameReviewGenerator.js` with the following content:

```javascript
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

    const userPrompt = `Result: ${win ? 'VICTORY' : 'DEFEAT'}
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
```

- [ ] **Step 2: Verify the file loads without syntax errors**

Run: `node -e "require('./src/services/gameReviewGenerator.js')" 2>&1`
Expected: No output (clean require)

- [ ] **Step 3: Commit**

```bash
git add src/services/gameReviewGenerator.js
git commit -m "feat: add game review generator service for group game analysis"
```

---

### Task 3: Modify `burnGenerator.js` — Remove Dephario fallbacks, add single-loss fallbacks

**Files:**
- Modify: `src/services/burnGenerator.js`

- [ ] **Step 1: Add `SINGLE_LOSS_MESSAGES` array and `getSingleLossMessage` function**

After the `PLAYER_LORE` object (line 72), add a new fallback array for single-loss scenarios (used when Dephario loses a single game and AI fails):

```javascript
// Generic single-loss fallback messages (for players roasted on every loss, when AI fails)
const SINGLE_LOSS_MESSAGES = [
  "Another L. Shocking absolutely no one.",
  "Lost again. Water is wet. Sky is blue.",
  "Doing what they do best. (Losing.)",
  "Classic L. Consistency is a virtue, I guess.",
  "Lost. In other news, grass is green.",
  "Another loss added to the collection.",
  "That's an L. The man is nothing if not consistent.",
  "Lost again. Some things never change.",
];

function getSingleLossMessage() {
  return SINGLE_LOSS_MESSAGES[Math.floor(Math.random() * SINGLE_LOSS_MESSAGES.length)];
}
```

- [ ] **Step 2: Export `getSingleLossMessage` from the module**

Change the module.exports at line 193 from:

```javascript
module.exports = { generateBurn, generateSquadBurn };
```

to:

```javascript
module.exports = { generateBurn, generateSquadBurn, getSingleLossMessage };
```

- [ ] **Step 3: Verify the file loads without syntax errors**

Run: `node -e "require('./src/services/burnGenerator.js')" 2>&1`
Expected: No output (clean require)

- [ ] **Step 4: Commit**

```bash
git add src/services/burnGenerator.js
git commit -m "feat: add single-loss fallback messages for unified loss path"
```

---

### Task 4: Modify `matchTracker.js` — Unify Dephario path, add compliments, integrate game review

This is the largest task. It modifies `matchTracker.js` in three areas:
1. Import new services
2. Unify the Dephario loss embed into the regular loss path
3. Add good-game compliment detection on wins
4. Integrate game review into `announceGameEnd`

**Files:**
- Modify: `src/services/matchTracker.js`

- [ ] **Step 1: Add imports for new services and add TurboTwit identifier**

At the top of the file, after the existing `generateBurn`/`generateSquadBurn` import (line 5), add:

```javascript
const { isGoodGame, generateCompliment, getFallbackCompliment } = require('./complimentGenerator');
const { generateGameReview } = require('./gameReviewGenerator');
const { getSingleLossMessage } = require('./burnGenerator');
```

After the `DEPHARIO_NAME` constant (line 13), add:

```javascript
const TURBOTWIT_NAME = 'TurboTwit';

function isTurboTwit(account) {
  return account.game_name.toLowerCase() === TURBOTWIT_NAME.toLowerCase();
}
```

- [ ] **Step 2: Remove `DEPHARIO_MESSAGES`, `getDepharioMessage`, and `getDepharioReactions` function**

Delete the following sections:
- `DEPHARIO_MESSAGES` object (lines 81-159)
- `getDepharioMessage` function (lines 183-186)
- `getDepharioReactions` function (lines 189-192)
- `DEPHARIO_REACTIONS` array (lines 162-170)

These are no longer needed — Dephario flows through the unified path now.

- [ ] **Step 3: Rewrite the loss/win announcement block in `checkGuildMatches`**

Replace the entire `// Post to league channel` block (lines 281-354) with the unified version:

```javascript
        // Post to league channel
        if (leagueChannel) {
          const isDephi = isDephario(account);
          const isTwit = isTurboTwit(account);

          if (!stats.win && (isDephi || streakResult.streak >= 2)) {
            // Losses: Dephario on every loss, others on streak >= 2
            const aiMsg = await generateBurn({
              playerName: account.game_name,
              streak: streakResult.streak,
              champion: stats.champion,
              kda: { kills: stats.kills, deaths: stats.deaths, assists: stats.assists },
              position: stats.position,
              guildId: guild.id,
              userId: account.user_id,
              isDephario: isDephi,
            });

            let msg;
            if (aiMsg) {
              msg = aiMsg;
            } else if (streakResult.streak >= 2) {
              msg = getShameMessage(streakResult.streak);
            } else {
              msg = getSingleLossMessage();
            }

            if (msg) {
              const embed = new EmbedBuilder()
                .setColor(0xff4444)
                .setTitle('📉 Tilt Alert')
                .setDescription(
                  `<@${account.user_id}> lost on **${stats.champion}** (${stats.kills}/${stats.deaths}/${stats.assists}).\n\n` +
                  `${msg}` +
                  (streakResult.streak > 1 ? `\n\n🔥 Loss streak: **${streakResult.streak}**` : '')
                )
                .setTimestamp();

              const sent = await leagueChannel.send({ embeds: [embed] });

              // Dephario still gets snowballing reactions
              if (isDephi) {
                const reactionSets = [
                  ['😂'],
                  ['😂', '💀'],
                  ['😂', '💀', '🤡'],
                  ['😂', '💀', '🤡', '📉'],
                  ['😂', '💀', '🤡', '📉', '🔥'],
                  ['😂', '💀', '🤡', '📉', '🔥', '⚰️'],
                  ['😂', '💀', '🤡', '📉', '🔥', '⚰️', '🪦'],
                ];
                const index = Math.min(streakResult.streak - 1, reactionSets.length - 1);
                for (const emoji of reactionSets[index]) {
                  await sent.react(emoji).catch(() => {});
                }
              }
            }
          }
          // Compliment on a really good win
          else if (stats.win) {
            const goodReason = isGoodGame(
              { kills: stats.kills, deaths: stats.deaths, assists: stats.assists },
              isTwit
            );

            if (goodReason) {
              const aiMsg = await generateCompliment({
                playerName: account.game_name,
                champion: stats.champion,
                kda: { kills: stats.kills, deaths: stats.deaths, assists: stats.assists },
                position: stats.position,
                guildId: guild.id,
                userId: account.user_id,
                isTurboTwit: isTwit,
                reason: goodReason,
              });
              const msg = aiMsg || getFallbackCompliment(goodReason, isTwit);

              const titles = ['🔥 Player Diff', '👑 Carry Alert'];
              const title = titles[Math.floor(Math.random() * titles.length)];

              const embed = new EmbedBuilder()
                .setColor(0xffd700)
                .setTitle(title)
                .setDescription(
                  `<@${account.user_id}> went off on **${stats.champion}** (${stats.kills}/${stats.deaths}/${stats.assists}).\n\n` +
                  `${msg}`
                )
                .setTimestamp();

              await leagueChannel.send({ embeds: [embed] });
            }

            // Win after a loss streak (still fires even if also a good game)
            if (streakResult.wasOnStreak >= 3) {
              await leagueChannel.send({
                content: `<@${account.user_id}> finally won a game after **${streakResult.wasOnStreak}** straight losses. About time.`,
              });
            }
          }
        }
```

- [ ] **Step 4: Integrate game review into `announceGameEnd`**

In the `announceGameEnd` function, add the game review call. The review needs player identity flags (isDephario, isTurboTwit), so we need to look up accounts.

First, add this import to the top of the file (alongside the existing league imports on line 4) — add `getAllLinkedAccounts` if not already imported. Check: it IS already imported on line 4.

Now, in the `announceGameEnd` function, after computing `duration` (line 467) and before `// Update squad streak` (line 469), add the game review generation:

```javascript
  // Generate AI game review
  const allAccounts = getAllLinkedAccounts(guildId);
  const reviewPlayers = gameData.players.map(p => {
    const participant = match.info.participants.find(mp => mp.puuid === p.puuid);
    const account = allAccounts.find(a => a.user_id === p.userId);
    if (!participant) return { name: p.gameName, champion: 'Unknown', kda: { kills: 0, deaths: 0, assists: 0 }, position: '', isDephario: false, isTurboTwit: false };
    return {
      name: p.gameName,
      champion: participant.championName,
      kda: { kills: participant.kills, deaths: participant.deaths, assists: participant.assists },
      position: participant.teamPosition || '',
      isDephario: account ? isDephario(account) : false,
      isTurboTwit: account ? isTurboTwit(account) : false,
    };
  });

  const allSameTeam = (() => {
    const teamIds = gameData.players.map(p => {
      const participant = match.info.participants.find(mp => mp.puuid === p.puuid);
      return participant?.teamId;
    }).filter(Boolean);
    return teamIds.length > 0 && teamIds.every(t => t === teamIds[0]);
  })();

  const gameReview = await generateGameReview({
    players: reviewPlayers,
    win: squadWon,
    duration,
    sameTeam: allSameTeam,
  });
```

Then, modify the description construction. After the line that builds the base description (currently line 473):

```javascript
  let description = `**${resultLabel}**\n\n${lines.join('\n')}\n\n⏱️ ${duration} minutes`;
```

Add the review right after:

```javascript
  // Append AI game review if available
  if (gameReview) {
    description += `\n\n📋 **Post-Game Analysis**\n${gameReview}`;
  }
```

- [ ] **Step 5: Verify the file loads without syntax errors**

Run: `node -e "require('./src/services/matchTracker.js')" 2>&1`
Expected: No output (clean require), or a known error about missing Discord client (which is normal since it only runs in the bot context)

- [ ] **Step 6: Start the bot and verify no crash on startup**

Run: `node src/index.js`
Expected: Bot starts, logs "Match tracker started." and connects to Discord without errors. Stop with Ctrl+C after confirming.

- [ ] **Step 7: Commit**

```bash
git add src/services/matchTracker.js
git commit -m "feat: unify Dephario path, add compliments and game reviews"
```

---

### Task 5: Final integration verification

**Files:**
- All modified/created files

- [ ] **Step 1: Verify all imports resolve**

Run: `node -e "require('./src/services/complimentGenerator.js'); require('./src/services/gameReviewGenerator.js'); require('./src/services/burnGenerator.js'); console.log('All imports OK')" 2>&1`
Expected: `All imports OK`

- [ ] **Step 2: Start the bot end-to-end**

Run: `node src/index.js`
Expected: Bot starts cleanly, connects to Discord, logs "Match tracker started."

- [ ] **Step 3: Verify no leftover Dephario Update references**

Run: `grep -r "Dephario Update" src/`
Expected: No matches found

- [ ] **Step 4: Verify no unused imports or dead code**

Check that `DEPHARIO_MESSAGES`, `getDepharioMessage`, `getDepharioReactions`, and `DEPHARIO_REACTIONS` are fully removed from `matchTracker.js`.

Run: `grep -n "DEPHARIO_MESSAGES\|getDepharioMessage\|DEPHARIO_REACTIONS\|getDepharioReactions" src/services/matchTracker.js`
Expected: No matches found

- [ ] **Step 5: Commit all remaining changes (if any)**

```bash
git add -A
git commit -m "chore: final cleanup for game commentary expansion"
```
