const config = require('../config');

const PLATFORM_BASE = `https://${config.RIOT_PLATFORM}.api.riotgames.com`;

async function clashFetch(url) {
  const res = await fetch(url, {
    headers: { 'X-Riot-Token': config.riotApiKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Riot Clash API ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Get all upcoming Clash tournaments.
 * Returns tournaments that have at least one phase with a start time in the future.
 */
async function getUpcomingTournaments() {
  const tournaments = await clashFetch(
    `${PLATFORM_BASE}/lol/clash/v1/tournaments`
  );
  const now = Date.now();
  return tournaments.filter(t =>
    t.schedule && t.schedule.some(phase => phase.startTime > now)
  );
}

/**
 * Get a player's current Clash registration info.
 * Returns an array of active Clash player entries (may be empty).
 */
async function getPlayerClashInfo(summonerId) {
  try {
    return await clashFetch(
      `${PLATFORM_BASE}/lol/clash/v1/players/by-summoner/${summonerId}`
    );
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

/**
 * Get Clash team details by team ID.
 */
async function getClashTeam(teamId) {
  return clashFetch(
    `${PLATFORM_BASE}/lol/clash/v1/teams/${teamId}`
  );
}

module.exports = { getUpcomingTournaments, getPlayerClashInfo, getClashTeam };
