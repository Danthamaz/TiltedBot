const { getDb } = require('../database');

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

/**
 * Get a player's win rate and games for each position from match_history.
 */
function getPlayerRoleStats(guildId, userId) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT position,
           COUNT(*) as games,
           SUM(win) as wins,
           ROUND(SUM(win) * 100.0 / COUNT(*), 1) as win_rate
    FROM match_history
    WHERE guild_id = ? AND user_id = ? AND position IS NOT NULL
    GROUP BY position
    HAVING COUNT(*) >= 2
    ORDER BY games DESC
  `).all(guildId, userId);

  const stats = {};
  for (const row of rows) {
    stats[row.position] = { games: row.games, wins: row.wins, winRate: row.win_rate };
  }
  return stats;
}

/**
 * Build a suggested team roster from signups.
 *
 * @param {string} guildId
 * @param {Array} signups - From getSignups(), each has user_id, preferred_role, is_captain
 * @returns {{ roster: Array, unassigned: Array }} roster is 5 players with assigned roles, unassigned is everyone else
 */
function suggestTeam(guildId, signups) {
  // Enrich signups with role stats
  const players = signups.map(s => ({
    userId: s.user_id,
    preferredRole: s.preferred_role,
    isCaptain: s.is_captain,
    roleStats: getPlayerRoleStats(guildId, s.user_id),
  }));

  if (players.length <= 5) {
    // Assign everyone — resolve conflicts
    const roster = assignRoles(players);
    return { roster, unassigned: [] };
  }

  // More than 5 — find best 5-player combination
  let bestRoster = null;
  let bestScore = -1;

  const combos = combinations(players, 5);
  for (const combo of combos) {
    const roster = assignRoles(combo);
    const score = scoreRoster(roster);
    if (score > bestScore) {
      bestScore = score;
      bestRoster = roster;
    }
  }

  const rosterUserIds = new Set(bestRoster.map(r => r.userId));
  const unassigned = players.filter(p => !rosterUserIds.has(p.userId));

  return { roster: bestRoster, unassigned };
}

/**
 * Assign roles to a group of up to 5 players, resolving conflicts.
 * Prefers player preference, breaks ties with win rate.
 */
function assignRoles(players) {
  const assigned = new Map(); // position -> player
  const unplaced = [];

  // First pass: assign players with unique preferences
  const prefCounts = {};
  for (const p of players) {
    if (p.preferredRole && p.preferredRole !== 'FILL') {
      prefCounts[p.preferredRole] = (prefCounts[p.preferredRole] || 0) + 1;
    }
  }

  // Players with unique preferences get their role
  for (const p of players) {
    const pref = p.preferredRole;
    if (pref && pref !== 'FILL' && prefCounts[pref] === 1 && !assigned.has(pref)) {
      assigned.set(pref, { ...p, assignedRole: pref });
    } else {
      unplaced.push(p);
    }
  }

  // Second pass: resolve conflicts — player with higher win rate in the role gets it
  const stillUnplaced = [];
  for (const p of unplaced) {
    const pref = p.preferredRole;
    if (pref && pref !== 'FILL' && !assigned.has(pref)) {
      assigned.set(pref, { ...p, assignedRole: pref });
    } else if (pref && pref !== 'FILL' && assigned.has(pref)) {
      const current = assigned.get(pref);
      const currentWr = current.roleStats[pref]?.winRate || 0;
      const challengerWr = p.roleStats[pref]?.winRate || 0;
      if (challengerWr > currentWr) {
        assigned.set(pref, { ...p, assignedRole: pref });
        stillUnplaced.push(current);
      } else {
        stillUnplaced.push(p);
      }
    } else {
      stillUnplaced.push(p);
    }
  }

  // Third pass: assign remaining players to open roles by best win rate
  const openRoles = POSITIONS.filter(pos => !assigned.has(pos));
  for (const p of stillUnplaced) {
    if (openRoles.length === 0) break;
    // Find the open role this player has the best win rate in
    let bestRole = openRoles[0];
    let bestWr = -1;
    for (const role of openRoles) {
      const wr = p.roleStats[role]?.winRate || 0;
      if (wr > bestWr) {
        bestWr = wr;
        bestRole = role;
      }
    }
    assigned.set(bestRole, { ...p, assignedRole: bestRole });
    openRoles.splice(openRoles.indexOf(bestRole), 1);
  }

  return Array.from(assigned.values());
}

/**
 * Score a roster — higher is better.
 * Weights: preferred role match = 20 points, win rate = actual value
 */
function scoreRoster(roster) {
  let score = 0;
  for (const p of roster) {
    if (p.assignedRole === p.preferredRole) score += 20;
    score += (p.roleStats[p.assignedRole]?.winRate || 0);
  }
  return score;
}

/**
 * Generate all combinations of k items from an array.
 * For a small Discord server (< 15 signups), this is fast enough.
 */
function combinations(arr, k) {
  const results = [];
  function recurse(start, combo) {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      recurse(i + 1, combo);
      combo.pop();
    }
  }
  recurse(0, []);
  return results;
}

module.exports = { suggestTeam, getPlayerRoleStats, POSITIONS };
