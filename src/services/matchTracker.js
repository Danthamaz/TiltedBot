const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getMatchIds, getMatch, getParticipantStats } = require('../utils/riot');
const { getAllLinkedAccounts, isMatchTracked, recordMatch, updateLossStreak } = require('../utils/league');

// Dephario's Discord user ID — set this after he links
// You can also use his Riot PUUID or game name to identify him
const DEPHARIO_NAME = 'Dephario';

// Loss streak shame messages (escalating)
const SHAME_MESSAGES = [
  // 2 losses
  "That's back to back L's. Rough.",
  // 3 losses
  "Three in a row. Maybe take a break?",
  // 4 losses
  "Four losses straight. The tilt is real.",
  // 5 losses
  "FIVE. Someone check on this person.",
  // 6 losses
  "Six losses in a row. At this point it's a lifestyle.",
  // 7+ losses
  "This is actually impressive. How do you lose this many in a row?",
];

// Special Dephario shame messages (escalating harder)
const DEPHARIO_MESSAGES = [
  // Single loss
  "Dephario lost again. Shocking absolutely no one.",
  // 2 losses
  "Dephario down bad. Two in a row.",
  // 3 losses
  "Dephario is speedrunning losses. Three straight.",
  // 4 losses
  "Someone take Dephario's keyboard. Four L's.",
  // 5 losses
  "DEPHARIO FIVE LOSSES IN A ROW. THIS MAN IS COOKED.",
  // 6 losses
  "Dephario has lost SIX IN A ROW. Genuinely concerning.",
  // 7 losses
  "SEVEN. Dephario is the final boss of losing.",
  // 8+ losses
  "Dephario has transcended tilt. He IS the tilt.",
];

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

function getShameMessage(streak) {
  if (streak < 2) return null;
  const index = Math.min(streak - 2, SHAME_MESSAGES.length - 1);
  return SHAME_MESSAGES[index];
}

function getDepharioMessage(streak) {
  const index = Math.min(streak - 1, DEPHARIO_MESSAGES.length - 1);
  return DEPHARIO_MESSAGES[index];
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

        // Update loss streak
        const streakResult = updateLossStreak(guild.id, account.user_id, stats.win);

        // Post to league channel
        if (leagueChannel) {
          const isDephi = isDephario(account);

          // Dephario gets called out on EVERY loss
          if (!stats.win && isDephi) {
            const msg = getDepharioMessage(streakResult.streak);
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
          // Regular players get shamed on loss streaks (2+)
          else if (!stats.win && streakResult.streak >= 2) {
            const msg = getShameMessage(streakResult.streak);
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
          // Win after a loss streak
          else if (stats.win && streakResult.wasOnStreak >= 3) {
            const name = isDephi ? 'Dephario' : `<@${account.user_id}>`;
            await leagueChannel.send({
              content: `${name} finally won a game after **${streakResult.wasOnStreak}** straight losses. About time.`,
            });
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

module.exports = { startMatchTracker };
