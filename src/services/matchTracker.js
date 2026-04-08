const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getMatchIds, getMatch, getParticipantStats, getActiveGame, getChampionName } = require('../utils/riot');
const { getAllLinkedAccounts, isMatchTracked, recordMatch, updateLossStreak, POSITION_NAMES, updateSquadStreak, getLossStreak } = require('../utils/league');
const { generateBurn, generateSquadBurn, getSingleLossMessage } = require('./burnGenerator');
const { isGoodGame, generateCompliment, getFallbackCompliment } = require('./complimentGenerator');
const { generateGameReview } = require('./gameReviewGenerator');

// Track announced live games so we don't repeat announcements
// Key: gameId, Value: { announcedAt, matchId (set later), players, messageId }
const activeGames = new Map();

const DEPHARIO_NAME = 'Dephario';
const TURBOTWIT_NAME = 'TurboTwit';

function isTurboTwit(account) {
  return account.game_name.toLowerCase() === TURBOTWIT_NAME.toLowerCase();
}

// Loss streak shame messages — each streak level has multiple options picked at random
const SHAME_MESSAGES = {
  2: [
    "That's back to back L's. Rough.",
    "Two in a row. Coincidence? Probably not.",
    "Double L. The tilt might be setting in.",
    "Back to back losses. You hate to see it.",
    "Two straight. Just warming up... right?",
  ],
  3: [
    "Three in a row. Maybe take a break?",
    "Three losses straight. The copium is running low.",
    "That's a hat trick of L's. Impressive in the wrong way.",
    "Three in a row. Alt+F4 might be the play here.",
    "Triple L. The universe is sending a message.",
  ],
  4: [
    "Four losses straight. The tilt is real.",
    "Four in a row. This is no longer bad luck, this is a pattern.",
    "Quad feed of losses. Someone intervene.",
    "Four straight L's. Have you considered a different hobby?",
    "That's four. The keyboard did nothing wrong, put it down.",
  ],
  5: [
    "FIVE. Someone check on this person.",
    "Five losses in a row. This is a cry for help.",
    "FIVE STRAIGHT. At this point just lock in Yuumi and pray.",
    "Five in a row. The elo is in freefall.",
    "That's five. Are you playing with a steering wheel?",
  ],
  6: [
    "Six losses in a row. At this point it's a lifestyle.",
    "SIX. This person is a danger to themselves and their LP.",
    "Six straight L's. The MMR is in the shadow realm.",
    "Half a dozen losses. That's not a streak, that's a career.",
    "Six in a row. Someone call a wellness check.",
  ],
  7: [
    "SEVEN losses in a row. This is actually impressive.",
    "Seven straight. At some point you have to respect the commitment.",
    "SEVEN. How do you even lose this many in a row?",
    "Seven L's. This person has been cursed by the rift itself.",
    "Seven in a row. Legend says they're still losing.",
  ],
  8: [
    "EIGHT losses. This is beyond tilt. This is a lifestyle choice.",
    "Eight in a row. The account is begging for mercy.",
    "EIGHT. Someone take their computer. This is an intervention.",
    "Eight straight losses. We're witnessing history.",
    "That's eight. At this point just start a new account.",
  ],
  9: [
    "NINE. We are watching the greatest L streak of our generation.",
    "Nine in a row. This transcends gaming. This is art.",
    "NINE losses straight. The MMR doesn't even exist anymore.",
    "Nine. I didn't even know it was possible to lose this many.",
  ],
  10: [
    "TEN LOSSES IN A ROW. SOMEONE CALL 911.",
    "Double digits. This person needs to touch grass immediately.",
    "TEN. This is no longer funny. Actually wait, yes it is.",
    "Ten straight L's. This has to be a world record.",
  ],
};

// Dephario loss reaction emojis (snowballing)
const DEPHARIO_REACTIONS = [
  ['😂'],                          // 1 loss
  ['😂', '💀'],                    // 2 losses
  ['😂', '💀', '🤡'],             // 3 losses
  ['😂', '💀', '🤡', '📉'],      // 4 losses
  ['😂', '💀', '🤡', '📉', '🔥'], // 5 losses
  ['😂', '💀', '🤡', '📉', '🔥', '⚰️'], // 6 losses
  ['😂', '💀', '🤡', '📉', '🔥', '⚰️', '🪦'], // 7+ losses
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getShameMessage(streak) {
  if (streak < 2) return null;
  const key = Math.min(streak, 10);
  const options = SHAME_MESSAGES[key];
  return options ? pick(options) : pick(SHAME_MESSAGES[10]);
}

function getDepharioReactions(streak) {
  const index = Math.min(streak - 1, DEPHARIO_REACTIONS.length - 1);
  return DEPHARIO_REACTIONS[index];
}

function isDephario(account) {
  return account.game_name.toLowerCase() === DEPHARIO_NAME.toLowerCase();
}

/**
 * Start the match tracking loop.
 */
function startMatchTracker(client) {
  if (!config.riotApiKey) {
    console.log('No Riot API key configured, skipping match tracker.');
    return;
  }

  console.log('Match tracker started.');

  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        await checkGuildMatches(client, guild);
      } catch (err) {
        console.error(`Match tracker error for ${guild.name}:`, err.message);
      }
    }
  }, config.MATCH_CHECK_INTERVAL);

  // Live game check — runs every 90 seconds
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        await checkLiveGames(client, guild);
      } catch (err) {
        console.error(`Live game check error for ${guild.name}:`, err.message);
      }
    }
  }, 90 * 1000);

  // Also run once on startup after a short delay
  setTimeout(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        await checkGuildMatches(client, guild);
      } catch (err) {
        console.error(`Initial match check error for ${guild.name}:`, err.message);
      }
    }
  }, 10000);
}

async function checkGuildMatches(client, guild) {
  const accounts = getAllLinkedAccounts(guild.id);
  if (!accounts.length) return;

  const leagueChannel = guild.channels.cache.find(
    c => c.name === config.LEAGUE_CHANNEL_NAME
  );

  for (const account of accounts) {
    try {
      // Small delay between accounts to respect rate limits
      await new Promise(r => setTimeout(r, 1500));

      const matchIds = await getMatchIds(account.riot_puuid, 3);

      for (const matchId of matchIds) {
        if (isMatchTracked(guild.id, account.user_id, matchId)) continue;

        // Small delay between match lookups
        await new Promise(r => setTimeout(r, 1200));

        const match = await getMatch(matchId);
        const stats = getParticipantStats(match, account.riot_puuid);
        if (!stats) continue;

        // Only track games played after the account was linked
        const linkedAt = new Date(account.linked_at).getTime();
        if (stats.gameEndTimestamp < linkedAt) continue;

        recordMatch(guild.id, account.user_id, matchId, stats);

        // Check if this match was part of a tracked live game and announce result
        if (leagueChannel) {
          await announceGameEnd(leagueChannel, guild.id, matchId, match);
        }

        // Update loss streak
        const streakResult = updateLossStreak(guild.id, account.user_id, stats.win);

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
                const reactions = getDepharioReactions(streakResult.streak);
                for (const emoji of reactions) {
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
      }
    } catch (err) {
      if (err.status === 429) {
        console.warn('Riot API rate limited, will retry next cycle.');
        return; // Stop checking this cycle
      }
      console.error(`Match check error for ${account.game_name}:`, err.message);
    }
  }
}

// Squad loss streak roast messages — for when the group loses together
const SQUAD_SHAME = {
  2: [
    "Two in a row as a squad. Maybe it's a team diff... from within.",
    "Back to back squad L's. The synergy is not synergizing.",
    "Two straight together. At least you're losing as a family.",
    "Y'all went 0-2 as a group. Comms aren't the problem. Skill is.",
  ],
  3: [
    "Three squad losses in a row. Maybe we should invite some good players into the discord?",
    "0-3 as a team. Solo queue might be the better decision.",
    "Three straight squad L's. The friendship is being tested.",
    "Trio of losses together. Have you considered playing AGAINST each other instead?",
    "Three in a row. The squad is giving 'open mid' energy.",
  ],
  4: [
    "FOUR squad losses. At this point you're making each other worse.",
    "0-4 together. The discord squad is officially cursed.",
    "Four in a row as a group. Maybe try a different game? Like Minecraft?",
    "Squad went 0-4. Collectively, you are the problem.",
    "Four straight. Friendship does NOT win games apparently.",
  ],
  5: [
    "FIVE losses as a squad. This group is a humanitarian crisis.",
    "0-5 together. Riot should ban you from queuing as a group.",
    "Five in a row. The squad's combined MMR just hit a new low.",
    "FIVE squad L's. At this point, playing together IS the int.",
    "You've lost five in a row as a team. The enemy team thanks you for the free wins.",
  ],
  6: [
    "SIX squad losses. This isn't a loss streak, it's a lifestyle brand.",
    "0-6 as a group. Please stop. The server can't take any more of this.",
    "Six in a row together. You're not a squad, you're a support group for bad players.",
    "SIX. Maybe the real elo was the friends we lost along the way.",
  ],
  7: [
    "SEVEN squad losses. This is genuinely unprecedented. You should be studied.",
    "0-7 together. At this point just queue into practice tool as a group.",
    "Seven in a row. The squad is actively making League of Legends a worse game.",
    "SEVEN. Rename the discord to 'Losers Anonymous'. It fits.",
  ],
  8: [
    "EIGHT squad losses in a row. Riot is considering adding you to the tutorial as a bad example.",
    "0-8 together. You could lose to bots at this point. Intermediate bots.",
    "Eight in a row as a group. Have you tried NOT playing together? Serious question.",
  ],
};

function getSquadShameMessage(streak) {
  if (streak < 2) return null;
  const key = Math.min(streak, 8);
  const options = SQUAD_SHAME[key];
  return options ? pick(options) : pick(SQUAD_SHAME[8]);
}

/**
 * Announce the result of a tracked live game when the match completes.
 * Only fires once per game (deletes from activeGames after announcing).
 */
async function announceGameEnd(channel, guildId, matchId, match) {
  // Find which activeGame this match belongs to by checking participant PUUIDs
  let foundGameId = null;
  let gameData = null;

  for (const [gameId, data] of activeGames) {
    if (data.announced) continue;
    const matchPuuids = match.info.participants.map(p => p.puuid);
    const overlap = data.players.filter(p => matchPuuids.includes(p.puuid));
    if (overlap.length >= 2) {
      foundGameId = gameId;
      gameData = data;
      break;
    }
  }

  if (!foundGameId || !gameData) return;

  // Mark as announced so we don't repeat
  gameData.announced = true;

  // Determine if the squad won or lost (check first player's result)
  const firstParticipant = match.info.participants.find(
    mp => mp.puuid === gameData.players[0].puuid
  );
  const squadWon = firstParticipant?.win || false;
  const resultLabel = squadWon ? '🟢 Victory' : '🔴 Defeat';

  // Build player lines with individual loss streaks
  const lines = gameData.players.map(p => {
    const participant = match.info.participants.find(mp => mp.puuid === p.puuid);
    if (!participant) return `> <@${p.userId}> — result unknown`;

    const kda = `${participant.kills}/${participant.deaths}/${participant.assists}`;
    const posName = participant.teamPosition ? (POSITION_NAMES[participant.teamPosition] || participant.teamPosition) : '';
    const streak = getLossStreak(guildId, p.userId);
    const streakText = !squadWon && streak.current_streak > 1
      ? ` | 🔥 ${streak.current_streak} solo streak`
      : '';
    return `> <@${p.userId}> — **${participant.championName}** ${posName} (${kda})${streakText}`;
  });

  const duration = Math.floor(match.info.gameDuration / 60);

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

  // Update squad streak
  const userIds = gameData.players.map(p => p.userId);
  const squadResult = updateSquadStreak(guildId, userIds, squadWon);

  let description = `**${resultLabel}**\n\n${lines.join('\n')}\n\n⏱️ ${duration} minutes`;

  // Append AI game review if available
  if (gameReview) {
    description += `\n\n📋 **Post-Game Analysis**\n${gameReview}`;
  }

  // Add squad streak info on loss
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

  // Win after a squad loss streak
  if (squadWon && squadResult.wasOnStreak >= 2) {
    description += `\n\n😮‍💨 Finally broke a **${squadResult.wasOnStreak}** game squad loss streak.`;
  }

  const embed = new EmbedBuilder()
    .setColor(squadWon ? 0x00cc44 : 0xff4444)
    .setTitle('🏁 Game Over!')
    .setDescription(description)
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});

  // Clean up
  activeGames.delete(foundGameId);
}

/**
 * Check if multiple linked players are in the same live game.
 * Announces in #league when 2+ server members are in the same match.
 */
async function checkLiveGames(client, guild) {
  const accounts = getAllLinkedAccounts(guild.id);
  if (accounts.length < 2) return;

  const leagueChannel = guild.channels.cache.find(
    c => c.name === config.LEAGUE_CHANNEL_NAME
  );
  if (!leagueChannel) return;

  // Clean up stale entries (older than 2 hours)
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  for (const [gameId, data] of activeGames) {
    if (data.announcedAt < twoHoursAgo) activeGames.delete(gameId);
  }

  // Map: gameId -> [{ account, champion, position }]
  const gamesFound = new Map();

  for (const account of accounts) {
    try {
      await new Promise(r => setTimeout(r, 1500));
      const game = await getActiveGame(account.riot_puuid);
      if (!game) continue;

      const gameId = game.gameId;
      const participant = game.participants.find(p => p.puuid === account.riot_puuid);
      if (!participant) continue;

      if (!gamesFound.has(gameId)) gamesFound.set(gameId, []);
      const champName = await getChampionName(participant.championId);
      gamesFound.get(gameId).push({
        account,
        champion: champName,
        teamId: participant.teamId,
      });
    } catch (err) {
      if (err.status === 429) {
        console.warn('Riot API rate limited during live game check.');
        return;
      }
      // Skip individual errors
    }
  }

  // Announce games with 2+ linked players that we haven't announced yet
  for (const [gameId, players] of gamesFound) {
    if (players.length < 2) continue;
    if (activeGames.has(gameId)) continue;

    const lines = players.map(p => {
      return `> <@${p.account.user_id}> — **${p.champion}**`;
    });

    // Check if they're on the same team
    const allSameTeam = players.every(p => p.teamId === players[0].teamId);
    const teamNote = allSameTeam ? 'They\'re on the same team.' : 'They\'re on opposite teams!';

    const embed = new EmbedBuilder()
      .setColor(0x00ccff)
      .setTitle('🎮 Server Members in Game!')
      .setDescription(
        `${lines.join('\n')}\n\n${teamNote}`
      )
      .setTimestamp();

    const msg = await leagueChannel.send({ embeds: [embed] }).catch(() => null);

    activeGames.set(gameId, {
      announcedAt: Date.now(),
      players: players.map(p => ({
        userId: p.account.user_id,
        puuid: p.account.riot_puuid,
        gameName: p.account.game_name,
        champion: p.champion,
        position: p.position,
      })),
      messageId: msg?.id || null,
    });
  }
}

module.exports = { startMatchTracker };
