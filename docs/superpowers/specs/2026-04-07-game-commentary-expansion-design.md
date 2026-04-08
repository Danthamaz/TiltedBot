# Game Commentary Expansion — Design Spec

## Overview

Expand TiltedBot's post-game messaging beyond loss roasts to include compliments for standout performances, AI-generated group game reviews, and naturalized Dephario roasting.

## Goals

1. Compliment players who have exceptional games
2. Give TurboTwit weighted/extra compliments (mix of genuine hype and shocked disbelief)
3. Provide an AI-generated review paragraph when a group game finishes
4. Remove "Dephario Update" branding — make his roasts feel natural while still hitting harder

## 1. Good Game Compliments

### Detection (in matchTracker.js)

On any **win**, check if performance meets ANY threshold:

- KDA ratio >= 5.0 (minimum 5 kills+assists to filter passive play)
- 0 deaths with 5+ kills+assists
- 15+ kills
- 20+ kills+assists (high kill participation)

**TurboTwit lower thresholds:**

- KDA >= 4.0 or 12+ kills (identified by game name, same pattern as Dephario)

### New Service: `src/services/complimentGenerator.js`

**`generateCompliment(opts)`** — AI-powered compliment generation.

Parameters:
- `playerName` — display name
- `champion` — champion played
- `kda` — { kills, deaths, assists }
- `position` — position played
- `guildId`, `userId` — for match history lookup
- `isTurboTwit` — boolean for weighted handling

AI prompt design:
- System prompt: hype commentator personality, references specific stats
- Regular players: genuine short compliment (1-2 sentences)
- TurboTwit: extra instructions to mix between over-the-top genuine hype and shocked disbelief that he actually carried. Messages are longer/more dramatic.

**Fallback:** Hardcoded compliment messages if AI fails.
- General pool: ~5 messages per category (high KDA, zero deaths, many kills)
- TurboTwit pool: mix of hype and backhanded compliments

### Embed

- Title: "🔥 Player Diff" or "👑 Carry Alert" (pick randomly)
- Color: gold/green
- Shows champion, KDA, and the compliment message
- Same visual weight as Tilt Alert embeds

## 2. Group Game Review

### Trigger

When `announceGameEnd` fires (tracked live game with 2+ players completes).

### New Service: `src/services/gameReviewGenerator.js`

**`generateGameReview(opts)`** — AI post-game analysis.

Parameters:
- `players` — array of { name, champion, kda, position, isDephario, isTurboTwit }
- `win` — boolean
- `duration` — game duration in minutes
- `sameTeam` — whether all tracked players were on the same team

AI prompt design:
- Personality: post-game analyst desk / sports commentator
- 2-4 sentences reviewing how the game went
- Name players and reference their specific stats
- On wins: highlight who carried, note clean performances
- On losses: point out who struggled, question the draft
- Dephario: the prompt knows his identity — naturally roasts him harder within the review without any special callout
- TurboTwit: gets extra hype if they performed well

**Fallback:** If AI fails, the embed displays normally without the commentary paragraph (current behavior preserved).

### Integration

- The review paragraph is appended to the bottom of the existing "🏁 Game Over!" embed
- Sits below the stat lines and duration, above any squad streak info

## 3. Dephario Naturalization

### matchTracker.js Changes

- **Remove** the separate Dephario code path (lines ~285-316)
- **Remove** the "💀 Dephario Update" embed title
- Dephario losses use the same "📉 Tilt Alert" embed as everyone else
- He still gets roasted on **every loss** (not just streaks >= 2) — that trigger rule stays
- Streak counter and snowballing emoji reactions still apply
- For single-loss (streak = 1) with no special Dephario branding: embed still posts using "📉 Tilt Alert" title, just uses the unified path

### burnGenerator.js Changes

- `DEPHARIO_EXTRA` AI prompt instructions **stay** — the AI still knows to go harder
- **Remove** `DEPHARIO_MESSAGES` hardcoded fallback set
- **Add** `SINGLE_LOSS_MESSAGES` — generic fallback array for streak-1 losses (used for Dephario's every-loss trigger when AI fails)
- Keep `getEscalationTier()` Dephario logic (tier 2 minimum, tier 3 at 5+)
- Keep player lore system as-is

### gameReviewGenerator.js Handling

- Review prompt receives `isDephario` flag per player
- Naturally weaves harder commentary about Dephario into the group review
- No explicit callout — just meaner analysis woven among everyone else

### Net Effect

Server members see Dephario get roasted harder by the bot's "personality" without any special branding announcing it.

## File Change Summary

| File | Action | Purpose |
|---|---|---|
| `src/services/complimentGenerator.js` | New | AI compliment generation + TurboTwit handling + fallbacks |
| `src/services/gameReviewGenerator.js` | New | AI post-game review generation for group games |
| `src/services/burnGenerator.js` | Modify | Remove Dephario fallbacks, add single-loss fallbacks |
| `src/services/matchTracker.js` | Modify | Compliment detection, unified Dephario path, game review integration |

## Non-Changes

- No database schema changes — uses existing match_history data
- No new slash commands — all features are automatic on match completion
- AI model stays as Haiku — cost-effective for additional API calls
- Each group game may now make 2 API calls (review + individual burns/compliments)
