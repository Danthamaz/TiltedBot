# Clash Team Coordinator

## Overview

Automatically remind players about upcoming League of Legends Clash tournaments, collect signups with role preferences via Discord buttons, and suggest optimal team compositions based on player stats. All coordination happens in the `#league` channel.

## Motivation

Coordinating five players for Clash is difficult — people forget dates, don't know who else is available, and spend time figuring out roles. This feature automates the reminder/signup/team-formation flow so the captain just needs to create the team in the League client.

## Riot API Constraints

The Clash API (`/lol/clash/v1`) is **read-only**. Available:
- `GET /lol/clash/v1/tournaments` — list upcoming tournaments with schedule phases
- `GET /lol/clash/v1/players/by-summoner/{summonerId}` — player's current Clash registration
- `GET /lol/clash/v1/teams/{teamId}` — team roster and tier

**Not available:** team creation, invites, lock-in, or any write operations. These must happen in the League client.

## Architecture

### New Files

- **`src/utils/clash.js`** — Riot Clash API wrappers
- **`src/services/clashTracker.js`** — polling loop, reminder logic, signup handling, team formation
- **`src/commands/clash.js`** — `/clash schedule`, `/clash team`, `/clash signups`
- **`migrations/008_clash.sql`** — new tables

### Modified Files

- **`src/index.js`** — start clash tracker alongside match tracker
- **`src/events/interactionCreate.js`** — handle button and dropdown interactions for signup flow

## Clash API Utility (`src/utils/clash.js`)

Simple GET wrappers using the same fetch pattern as `src/utils/riot.js`:

- `getUpcomingTournaments()` — fetches `/lol/clash/v1/tournaments`, filters to tournaments with future registration or start times
- `getPlayerClashInfo(summonerId)` — fetches a player's current Clash registration
- `getClashTeam(teamId)` — fetches team roster and tier

Uses the existing `RIOT_API_KEY` from config. Platform-specific endpoint (`na1`).

## Clash Tracker Service (`src/services/clashTracker.js`)

### Polling Loop

- Runs every 6 hours via `setInterval` (tournaments are monthly)
- Calls `getUpcomingTournaments()` each cycle
- Compares current time against reminder thresholds for each tournament phase
- Also runs once on startup (after a short delay, like matchTracker)

### Reminder Thresholds

Three reminders per tournament phase (each tournament day is a separate phase):

| Reminder | When | Description |
|----------|------|-------------|
| `formation` | When team formation opens (Monday of Clash week) | "Clash is coming! Start signing up." |
| `day_before` | Day before the tournament day (Friday for Saturday, Saturday for Sunday) | "Clash is tomorrow!" |
| `hours_before` | 3 hours before lock-in opens on tournament day | "Lock-in opens soon! Last call." |

### Reminder Embeds

Each phase (Saturday, Sunday) gets its own separate embed. They are never combined.

**Embed format:**
- **Title:** "Clash — Saturday, March 21" (day and date clearly stated)
- **Body:** Tournament name (e.g., "Summoner's Rift Noxus Cup"), type (SR or ARAM), lock-in time
- **Dynamic fields:** Captain name (or "No captain yet"), signup count, list of signed-up players with roles
- **Buttons:** "I'm In (Captain)" | "I'm In" | "Can't Make It"

On Monday (formation opens), both Saturday and Sunday embeds are posted back-to-back. Each follow-up reminder (day_before, hours_before) posts a NEW embed with current signup state and fresh buttons — this ensures visibility since older messages may have scrolled away. Previous reminder embeds for the same phase are also updated via stored `message_id` to reflect current signups. The hours_before reminder only fires for the relevant day (Saturday's hours_before only posts for Saturday's phase).

### Reminder State Tracking

The `clash_reminders` table prevents duplicate reminders. Before sending, check if a row exists for that `(guild_id, tournament_id, phase_id, reminder_type)`. After sending, store the Discord `message_id` so the embed can be updated later with current signup data.

## Signup & Role Selection Flow

### Buttons

Each reminder embed has 3 buttons:
- **"I'm In (Captain)"** — first person to click becomes captain for that phase. Button disables after claimed.
- **"I'm In"** — regular signup
- **"Can't Make It"** — removes signup (and captain status if applicable)

### Captain Rules

- One captain per tournament phase (first come, first served)
- Captain shown with a crown icon in the signup list
- If the captain clicks "Can't Make It", the captain slot reopens and the "I'm In (Captain)" button re-enables
- Team formation suggestions require both a captain AND 5+ signups

### Role Selection

After clicking "I'm In (Captain)" or "I'm In":
1. Bot replies with an ephemeral message containing a role dropdown: Top, Jungle, Mid, Bot, Support, Fill
2. Player selects their preferred role
3. Stored in `clash_signups` as `preferred_role`
4. All reminder embeds for that phase update to reflect the new signup with role

### Signup Persistence

Signups are per-phase. A player signed up for Saturday is NOT automatically signed up for Sunday. They must click "I'm In" on each day's embed independently. Clicking "I'm In" on any of the 3 reminders for the same phase registers for that phase (no duplicates due to UNIQUE constraint).

### Embed Updates

When a signup/cancellation happens, ALL reminder embeds for that phase (up to 3 messages) update their description to show current state:
- Captain: @PlayerName or "No captain yet"
- Signed up (3/5): @Player1 (Mid), @Player2 (Top), @Player3 (Fill)

## Team Formation Suggestions

### Trigger

Fires automatically when a captain exists AND a 5th player signs up. Can also be triggered manually with `/clash team`.

### Algorithm

1. Gather all signups for the tournament phase
2. For each player, pull role stats from `match_history` — games played and win rate per position
3. **5 or fewer players:** Assign each to their preferred role. On conflicts (two players want Mid), compare win rates for that role — suggest the weaker player move to their next-best role.
4. **More than 5 players:** Find the best 5-player combination that maximizes: players getting their preferred role (weighted highest) + total win rate across assigned roles. Suggest the top team.
5. Always show the full signup list with everyone's preferences and stats so the captain has final say.

### Output

Bot posts an embed in `#league`:
- **Title:** "Clash Team Suggestion — Saturday, March 21"
- **Suggested roster:** Player + assigned role + win rate + games played for that role
- **Full signup list:** All players with preferred role and role stats
- **Footer:** "This is a suggestion — the captain creates the team in the League client"

## Slash Commands (`src/commands/clash.js`)

### `/clash schedule`
Shows upcoming Clash tournaments with dates and types, pulled from the API.

### `/clash team`
Manually triggers team formation suggestion for the next upcoming tournament phase. Shows signups and suggested roster.

### `/clash signups`
Shows current signup list for the next upcoming tournament phase with roles and stats.

## Database Schema

### Migration: `migrations/008_clash.sql`

```sql
CREATE TABLE IF NOT EXISTS clash_reminders (
    guild_id TEXT NOT NULL,
    tournament_id TEXT NOT NULL,
    phase_id INTEGER NOT NULL,
    reminder_type TEXT NOT NULL,
    message_id TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, tournament_id, phase_id, reminder_type)
);

CREATE TABLE IF NOT EXISTS clash_signups (
    guild_id TEXT NOT NULL,
    tournament_id TEXT NOT NULL,
    phase_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    preferred_role TEXT,
    is_captain INTEGER DEFAULT 0,
    signed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, tournament_id, phase_id, user_id)
);
```

No other schema changes. Player role stats are derived from the existing `match_history` table.

## Scope Exclusions

- No in-client automation (team creation, invites, lock-in) — API is read-only
- No scouting features (opponent lookup) — could be a future addition
- No ticket tracking
- No dedicated channel — uses existing `#league`
- No ARAM-specific logic (same flow, just different tournament type label)
