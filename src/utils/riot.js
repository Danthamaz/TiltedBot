const config = require('../config');

const ACCOUNT_BASE = `https://${config.RIOT_REGION}.api.riotgames.com`;
const PLATFORM_BASE = `https://${config.RIOT_PLATFORM}.api.riotgames.com`;

async function riotFetch(url) {
  const res = await fetch(url, {
    headers: { 'X-Riot-Token': config.riotApiKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Riot API ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Get account by Riot ID (gameName#tagLine)
 */
async function getAccountByRiotId(gameName, tagLine) {
  return riotFetch(
    `${ACCOUNT_BASE}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
  );
}

/**
 * Get account by PUUID
 */
async function getAccountByPuuid(puuid) {
  return riotFetch(
    `${ACCOUNT_BASE}/riot/account/v1/accounts/by-puuid/${puuid}`
  );
}

/**
 * Get summoner by PUUID
 */
async function getSummonerByPuuid(puuid) {
  return riotFetch(
    `${PLATFORM_BASE}/lol/summoner/v4/summoners/by-puuid/${puuid}`
  );
}

/**
 * Get ranked entries for a summoner
 */
async function getRankedEntries(summonerId) {
  return riotFetch(
    `${PLATFORM_BASE}/lol/league/v4/entries/by-summoner/${summonerId}`
  );
}

/**
 * Get recent match IDs for a PUUID
 */
async function getMatchIds(puuid, count = 5) {
  return riotFetch(
    `${ACCOUNT_BASE}/lol/match/v5/matches/by-puuid/${puuid}/ids?count=${count}`
  );
}

/**
 * Get match details by match ID
 */
async function getMatch(matchId) {
  return riotFetch(
    `${ACCOUNT_BASE}/lol/match/v5/matches/${matchId}`
  );
}

/**
 * Extract a participant's stats from a match
 */
function getParticipantStats(match, puuid) {
  const participant = match.info.participants.find(p => p.puuid === puuid);
  if (!participant) return null;
  return {
    champion: participant.championName,
    win: participant.win,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    gameMode: match.info.gameMode,
    gameDuration: match.info.gameDuration,
    gameEndTimestamp: match.info.gameEndTimestamp,
  };
}

/**
 * Format rank string
 */
function formatRank(entry) {
  if (!entry) return 'Unranked';
  return `${entry.tier} ${entry.rank} (${entry.leaguePoints} LP)`;
}

/**
 * Get solo queue entry from ranked entries
 */
function getSoloQueue(entries) {
  return entries.find(e => e.queueType === 'RANKED_SOLO_5x5') || null;
}

module.exports = {
  getAccountByRiotId,
  getAccountByPuuid,
  getSummonerByPuuid,
  getRankedEntries,
  getMatchIds,
  getMatch,
  getParticipantStats,
  formatRank,
  getSoloQueue,
};
