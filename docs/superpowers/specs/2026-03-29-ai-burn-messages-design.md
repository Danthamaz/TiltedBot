# AI-Powered Burn Messages

## Overview

Replace the random hardcoded burn message selection in TiltedBot with AI-generated, context-aware roasts using the Claude API. Hardcoded messages are retained as a fallback when the API is unavailable.

## Motivation

The current system picks randomly from ~60 static messages across three categories. Players eventually see repeats, and the messages can't reference specific in-game context (champion, KDA, patterns). AI generation produces unique, contextual burns every time.

## Architecture

### New Module: `src/services/burnGenerator.js`

Exports a single function:

```js
async function generateBurn({
  playerName,
  streak,
  champion,
  kda,
  position,
  matchHistory,   // last 10 matches: [{ champion, kills, deaths, assists, win, position }]
  isDephario,
  isSquad,
  squadMembers    // array of player names (squad mode only)
})
// Returns: string (burn message) or null (on failure)
```

Internally:
1. Builds a system prompt defining personality and escalation tier
2. Builds a user prompt with match context
3. Calls Claude API with a 10-second timeout
4. Returns the generated message text, or `null` on any failure

### Modified Module: `src/services/matchTracker.js`

At each point where a burn message is currently selected:
1. Call `generateBurn()` with the match context
2. If it returns a string, use it
3. If it returns `null`, fall back to `pick()` from the existing hardcoded arrays

No other changes to `matchTracker.js` — embeds, emoji reactions, streak tracking, and all slash commands remain untouched.

## Prompt Design

### System Prompt

The system prompt defines the bot's personality as a trash-talking friend in a Discord gaming server. It instructs Claude to return only the burn message — no preamble, no quotes, 1-3 sentences max.

### Escalation Tiers

Based on the player's current loss streak:

| Tier | Streak | Tone | Description |
|------|--------|------|-------------|
| 1 | 2-3 | Playful | Light teasing, casual friend poking fun |
| 2 | 4-6 | Pointed | More serious roasts, questioning life choices, referencing bad plays |
| 3 | 7+ | Unhinged | No holds barred, dramatic, absurd, all-caps energy |

### Dephario Special Handling

When the player is Dephario:
- Minimum escalation tier is 2 (even on first loss)
- Reaches Tier 3 (unhinged) faster than other players
- System prompt includes extra instructions: be extra brutal, make it personal, reference his history of feeding, treat every loss as expected and every win as suspicious
- Existing emoji reaction snowball behavior is unchanged

### Squad Mode

When multiple tracked players lose together:
- Roast the group dynamic — blame teamwork, question why they keep queuing together
- Reference individual squad member stats if notably bad
- Uses `squadMembers` array for names

### User Prompt Context

The user prompt provides Claude with:
- Player name (or squad member names)
- Current loss streak count
- This game's stats: champion played, K/D/A, position
- Recent match history (last 10 games): champion, result, KDA, position
  - Enables pattern-based roasts like "3rd time on Yasuo this week, 3rd time feeding"

## Fallback Strategy

The existing hardcoded message arrays remain in `matchTracker.js` as fallbacks:
- `SHAME_MESSAGES` — general player burns by streak level
- `DEPHARIO_MESSAGES` — Dephario-specific burns by streak level
- `SQUAD_SHAME` — squad burns by streak level

Fallback triggers:
- API call returns an error
- API call exceeds 10-second timeout
- Response is empty or unparseable

## Dependencies

### New Package
- `@anthropic-ai/sdk` — official Anthropic Node.js SDK

### Configuration

**`.env` additions:**
- `ANTHROPIC_API_KEY` — Claude API key

**`config.js` additions:**
- `ANTHROPIC_MODEL` — model to use (default: `claude-haiku-4-5-20251001`)

## Database

No schema changes. The existing `match_history` table provides all context needed:
- `champion`, `kills`, `deaths`, `assists`, `win`, `position`, `played_at`
- Queried for last 10 matches per player to build history context

## Cost Estimate

- ~5 burns/day average
- Using Claude Haiku: ~$0.01-0.05/day
- Negligible monthly cost for a small group

## Scope Exclusions

- No new slash commands
- No changes to Discord embed formatting (title, color, timestamp)
- No changes to streak tracking logic
- No changes to Dephario emoji reactions
- No database migrations
- No caching or rate limiting (unnecessary at this volume)
