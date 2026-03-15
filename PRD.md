# Tilted Discord Bot — PRD

**Goal:** Build a custom Discord bot for HunterOnTilt's gaming server. Solve the onboarding problem, give the server its own identity, and lay groundwork for game integrations.

---

## 1. Product Overview

**Server profile:**
- ~10-15 concurrent users in voice on active nights
- Mostly IRL friends, some newer members the owner doesn't recognize
- Primary games: League of Legends, Ark Raiders, Tarkov (plus whatever's new)
- Tilt-themed identity — roles, names, and vibe all lean into gaming tilt culture
- Replacing carl-bot. Jockie Music stays for now.

**Core problem:** New members join with no roles. Owner sees random names and doesn't know who they are. No structure, no identity.

**Solution:** Bot-driven onboarding that forces role selection on join, plus a role management system that keeps the server organized without manual admin work.

---

## 2. User Roles & Permissions

### Access Roles (permission-based)

| Role | Permission Level | Assignment |
|------|-----------------|------------|
| General | Base access — can see/use all public channels | Auto-assigned after completing onboarding |
| Damage Control (Admin) | Full mod permissions — manage messages, kick, ban, manage roles | Manually assigned by server owner only |

### Protected Roles (bot never touches)

| Role | Purpose |
|------|---------|
| (angel) Shimmy | Memorial for a friend who passed from cancer. Sacred — never auto-assign, remove, or reference in onboarding. Bot must be coded to explicitly skip this role in all operations. |
| Zell | Special one-off role for Itzell. Manually assigned. |
| Server Booster | Discord system role. Handled by Discord. |
| Jockie Music | Bot role for music bot. Stays. |

### Theme Roles (cosmetic — no permissions)

**Tilt Tier** — pick one. This is your identity on the server.

| Role | Vibe |
|------|------|
| PermaTilted | Main crew energy. Always tilted. |
| Tilt Proof | Nothing gets to you. Zen gamer. |
| Tilties | Somewhere in between. |

> Owner can add more tilt tiers over time. Bot should support dynamic tilt roles via config, not hardcoded.

### Genre Roles (pingable — no permissions)

Multi-select. Used for @mentions when someone wants to rally players for a genre.

| Role | Covers |
|------|--------|
| MOBA | League of Legends, etc. |
| FPS | Tarkov, Valorant, etc. |
| Survival | Ark Raiders, Rust, etc. |
| MMORPG | WoW, FFXIV, etc. |
| Battle Royale | Apex, Fortnite, etc. |

> Genre list is configurable by admins. When a new game drops, it maps to an existing genre tag — no new role needed. Add genres via `/admin genre add [name]`.

### Platform Roles (optional — pingable)

Multi-select. For cross-platform coordination.

| Role |
|------|
| PC |
| PS5 |
| Xbox |
| Switch |

> PC might be dropped if everyone's on it. Configurable — admin can enable/disable platforms.

---

## 3. Feature Requirements — MVP

### 3.1 Onboarding Flow

**Trigger:** `GuildMemberAdd` event — fires when a new member joins the server.

**Flow:**

```
1. New member joins
2. Bot sends an embed to a dedicated #welcome or #onboarding channel
   (NOT a DM — DMs are often blocked and feel spammy)
3. Embed says:
   "Welcome to the server! Pick your roles to get started."
   - Step 1: Select your Tilt Tier (dropdown — pick one)
   - Step 2: Select your Genres (buttons or multi-select menu)
   - Step 3: Select your Platform (buttons or multi-select menu)
4. Member clicks through selections
5. Bot assigns: General + selected tilt tier + genres + platforms
6. Bot posts a welcome message in #general:
   "[user] just joined. They're a [Tilt Tier] who plays [genres] on [platforms]. Welcome in."
7. Member now has General access to the server
```

**Pre-onboarding state:**
- New members see ONLY the #onboarding channel until they complete the flow
- All other channels are locked behind the `General` role
- This is enforced via Discord channel permissions, not the bot — bot just assigns the role

**Edge cases:**
- Member leaves and rejoins — bot should re-trigger onboarding (don't persist old roles)
- Member doesn't complete onboarding — stays in limbo. Admin can nudge or kick after X days.
- Bot goes offline during join — member is stuck without roles. Provide a `/setup` command they can run manually.

**Discord components used:**
- `StringSelectMenu` for tilt tier (single select)
- `StringSelectMenu` for genres (multi-select, min 1)
- `StringSelectMenu` for platforms (multi-select, min 1)
- `ButtonBuilder` for confirm/submit

### 3.2 Role Management

Members should be able to update their roles anytime.

**`/roles`** — opens the same selection UI as onboarding (tilt tier, genres, platforms). Pre-populated with current selections. Updates roles on submit.

**`/tilt [tier]`** — quick shortcut to change tilt tier without the full menu.

**`/genres`** — opens genre selection only.

**`/platforms`** — opens platform selection only.

### 3.3 Admin Commands

All admin commands require `Damage Control` role.

**`/admin genre add [name]`** — creates a new genre role and adds it to the onboarding menu.

**`/admin genre remove [name]`** — removes a genre role. Warns if members currently have it.

**`/admin platform add [name]`** — same for platforms.

**`/admin platform remove [name]`** — same for platforms.

**`/admin tilt add [name]`** — adds a new tilt tier.

**`/admin tilt remove [name]`** — removes a tilt tier.

**`/admin roster`** — shows a breakdown of the server:
```
Tilt Tiers:    PermaTilted (8) | Tilt Proof (4) | Tilties (3)
Genres:        MOBA (10) | FPS (7) | Survival (5) | MMORPG (3)
Platforms:     PC (14) | PS5 (3) | Xbox (2)
No roles:      2 members
```

**`/admin kick-unroled [days]`** — lists members who haven't completed onboarding after X days. Doesn't auto-kick — just surfaces the list for manual action.

### 3.4 Welcome/Leave Messages

**On join:** Handled by onboarding flow (see 3.1).

**On leave:** Post in a #logs channel (admin-only):
`"[user] left the server. They were [tilt tier], played [genres] on [platforms]. Member for X days."`

---

## 4. Feature Requirements — Phase 2

Build after MVP is stable and in use. Prioritize based on what the server actually wants.

### 4.1 League of Legends Integration (Riot API)

- `/link [summoner-name#tag]` — link your Discord account to your Riot account
- `/stats [@user]` — pull recent match history, KDA, win rate
- `/rank [@user]` — show current rank, LP, recent rank changes
- `/live [@user]` — show live game info (champs, game mode)
- `/leaderboard` — server-wide rank leaderboard
- `/shame` — "who's feeding this week" board (most deaths, lowest KDA)
- Auto-post rank up/down notifications in a #league channel

### 4.2 LFG System

- `/lfg [game/genre] [count] [time?]` — post a looking-for-group embed
  - Pings the relevant genre role
  - Reaction-based sign-up
  - Auto-closes when full or time passes
- `/lfg list` — show active LFG posts

### 4.3 Event Scheduling

- `/event [title] [date] [time]` — create a server event with RSVP
- `/poll [question] [options...]` — "what are we playing Friday" polls

### 4.4 Activity Tracking

- **Weekly recap** (auto-posted Sundays): games played, hours in voice, MVP of the week
- **"Who's playing what"** — live status board reading Discord presence
- XP/leveling system based on voice time + messages (optional — might be noise)

### 4.5 Fun/Custom

- **Bet system** — fake currency, bet on match outcomes
- **Custom commands** — inside jokes the owner can add via `/custom add [trigger] [response]`
- **Soundboard triggers** — if Jockie Music gets replaced, handle audio clips

---

## 5. Technical Architecture

### Project Structure

```
tilted-bot/
├── src/
│   ├── index.js              # Entry point, client setup
│   ├── config.js             # Environment vars, constants
│   ├── database.js           # SQLite connection + migrations
│   ├── events/
│   │   ├── guildMemberAdd.js # Onboarding trigger
│   │   ├── guildMemberRemove.js
│   │   └── interactionCreate.js
│   ├── commands/
│   │   ├── roles.js          # /roles, /tilt, /genres, /platforms
│   │   ├── admin.js          # /admin genre|platform|tilt|roster
│   │   └── ... (Phase 2)
│   ├── components/
│   │   ├── onboarding.js     # Build onboarding embeds + menus
│   │   └── roleSelector.js   # Reusable role selection UI
│   └── utils/
│       ├── roles.js          # Role CRUD helpers
│       └── embeds.js         # Embed builders
├── migrations/               # SQLite schema migrations
├── .env
├── package.json
└── README.md
```

### Data Model (SQLite)

```sql
-- Server configuration
CREATE TABLE config (
    guild_id TEXT PRIMARY KEY,
    welcome_channel_id TEXT,
    log_channel_id TEXT,
    onboarding_channel_id TEXT
);

-- Dynamic role definitions (admin-configurable)
CREATE TABLE role_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,        -- Discord role ID
    name TEXT NOT NULL,
    category TEXT NOT NULL,        -- 'tilt' | 'genre' | 'platform'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Track member onboarding status
CREATE TABLE members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    onboarded_at DATETIME,
    UNIQUE(guild_id, user_id)
);

-- Phase 2: Riot account links
CREATE TABLE riot_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    riot_puuid TEXT NOT NULL,
    summoner_name TEXT,
    linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, user_id)
);
```

### Discord Bot Permissions (Intent + OAuth2)

**Gateway Intents required:**
- `Guilds` — role and channel access
- `GuildMembers` — detect joins/leaves (privileged intent — must enable in Discord Developer Portal)
- `GuildPresences` — Phase 2 only, for "who's playing what"
- `MessageContent` — only if adding prefix commands (slash commands don't need this)

**OAuth2 scopes:** `bot`, `applications.commands`

**Bot permissions:**
- Manage Roles — assign/remove roles during onboarding
- Send Messages — welcome messages, embeds
- Use Application Commands — slash commands
- Embed Links — rich embeds
- Read Message History — for context in onboarding channel

### Protected Role Safety

The bot must maintain a hardcoded + configurable "do not touch" list:
```javascript
const PROTECTED_ROLES = [
    'Shimmy',           // Memorial — never touch
    'Damage Control',   // Admin — manual only
    'Zell',             // Special — manual only
    'Server Booster',   // Discord system
    'Jockie Music',     // External bot
    // Bot's own role is auto-protected by Discord
];
```

Before ANY role operation, check against this list. Log and skip if matched.

---

## 6. Hosting & Deployment

| Option | Cost | Uptime | Best for |
|--------|------|--------|----------|
| Railway (free tier) | $0 | ~21 hrs/day (sleeps on inactivity) | Testing/dev |
| Fly.io (free tier) | $0 | Always-on with keep-alive | Budget prod |
| DigitalOcean droplet | $4-6/mo | 24/7 | Reliable prod |
| Self-hosted (someone's PC) | $0 | Depends | If someone volunteers |

**Recommendation:** Start on Railway for dev/testing. Move to a $5/mo VPS or Fly.io for prod once it's stable.

**Deployment:**
- Git push to main triggers deploy (Railway/Fly.io have GitHub integration)
- SQLite DB file persists on the server (or use a volume mount)
- `.env` for bot token, guild ID, Riot API key (Phase 2)

---

## 7. Success Criteria

### MVP is done when:
- [ ] New members are forced through onboarding before accessing the server
- [ ] Tilt tier, genre, and platform roles are selectable via interactive UI
- [ ] Members can update their roles anytime via `/roles`
- [ ] Admins can add/remove role options without touching code
- [ ] `/admin roster` shows a clean breakdown of the server
- [ ] Leave messages log to an admin channel
- [ ] Shimmy's role and other protected roles are never touched by the bot
- [ ] Bot is running 24/7 on prod hosting

### Phase 2 is scoped when:
- [ ] MVP has been running stable for 2+ weeks
- [ ] Owner gives feedback on what features matter most
- [ ] Riot API key is approved (takes a few days)

---

## 8. Open Questions

- [ ] Does the server already have an #onboarding or #welcome channel, or do we create one?
- [ ] Should new members see a "you must complete onboarding" message if they try to post elsewhere?
- [ ] Any existing carl-bot automations we need to replicate before removing it?
- [ ] Does the owner want the bot to have a personality in its messages (snarky, chill, etc.)?

---

## 9. Next Actions

- [x] Send discovery questions to server owner
- [x] Get owner feedback
- [x] Get the full list of current roles from the server
- [x] Write PRD
- [ ] Get answers to open questions (section 8)
- [ ] Set up repo and boilerplate
- [ ] Set up Discord Developer Portal app + bot token
- [ ] Build onboarding flow
- [ ] Build role management commands
- [ ] Build admin commands
- [ ] Test on the server
- [ ] Deploy to prod
- [ ] Phase 2 scoping

---

## 10. References

- [discord.js Guide](https://discordjs.guide/)
- [discord.js Docs](https://discord.js.org/)
- [Riot Games Developer Portal](https://developer.riotgames.com/)
- [Discord Developer Portal](https://discord.com/developers/applications)
- [Discord Permissions Calculator](https://discordapi.com/permissions.html)
