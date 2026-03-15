const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAccountByRiotId, getSummonerByPuuid, getRankedEntries, formatRank, getSoloQueue } = require('../utils/riot');
const { linkAccount, getLinkedAccount, getAllLinkedAccounts, getRecentMatches, getLossStreak } = require('../utils/league');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('league')
      .setDescription('League of Legends commands')
      .addSubcommand(sub =>
        sub.setName('link')
          .setDescription('Link your Riot account')
          .addStringOption(opt =>
            opt.setName('riot-id')
              .setDescription('Your Riot ID (e.g. Name#TAG)')
              .setRequired(true)
          )
      )
      .addSubcommand(sub =>
        sub.setName('rank')
          .setDescription('Show ranked info')
          .addUserOption(opt =>
            opt.setName('player').setDescription('Player to look up').setRequired(false)
          )
      )
      .addSubcommand(sub =>
        sub.setName('stats')
          .setDescription('Show recent match history')
          .addUserOption(opt =>
            opt.setName('player').setDescription('Player to look up').setRequired(false)
          )
      )
      .addSubcommand(sub =>
        sub.setName('leaderboard')
          .setDescription('Server rank leaderboard')
      )
      .addSubcommand(sub =>
        sub.setName('shame')
          .setDescription('Who\'s feeding this week?')
      )
      .addSubcommand(sub =>
        sub.setName('help')
          .setDescription('Show League command details')
      ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();

      if (sub === 'link') return handleLink(interaction);
      if (sub === 'rank') return handleRank(interaction);
      if (sub === 'stats') return handleStats(interaction);
      if (sub === 'leaderboard') return handleLeaderboard(interaction);
      if (sub === 'shame') return handleShame(interaction);
      if (sub === 'help') return handleLeagueHelp(interaction);
    },
  },
];

async function handleLink(interaction) {
  const riotId = interaction.options.getString('riot-id');
  const parts = riotId.split('#');
  if (parts.length !== 2) {
    await interaction.reply({ content: 'Invalid format. Use `Name#TAG`.', ephemeral: true });
    return;
  }
  const [gameName, tagLine] = parts;

  await interaction.deferReply({ ephemeral: true });

  try {
    const account = await getAccountByRiotId(gameName, tagLine);
    const summoner = await getSummonerByPuuid(account.puuid);

    linkAccount(
      interaction.guildId,
      interaction.user.id,
      account.puuid,
      account.gameName,
      account.tagLine,
      summoner.id
    );

    await interaction.editReply({
      content: `Linked **${account.gameName}#${account.tagLine}** to your Discord account.`,
    });
  } catch (err) {
    if (err.status === 404) {
      await interaction.editReply({ content: 'Riot account not found. Check the name and tag.' });
    } else {
      console.error('Link error:', err);
      await interaction.editReply({ content: 'Failed to link account. Try again later.' });
    }
  }
}

async function handleRank(interaction) {
  const target = interaction.options.getUser('player') || interaction.user;
  const account = getLinkedAccount(interaction.guildId, target.id);

  if (!account) {
    await interaction.reply({
      content: target.id === interaction.user.id
        ? 'You haven\'t linked your Riot account yet. Use `/league link`.'
        : `${target.username} hasn't linked their Riot account.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const entries = await getRankedEntries(account.summoner_id);
    const solo = getSoloQueue(entries);
    const flex = entries.find(e => e.queueType === 'RANKED_FLEX_SR') || null;

    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle(`${account.game_name}#${account.tag_line}`)
      .addFields(
        { name: 'Solo/Duo', value: solo ? `${formatRank(solo)} — ${solo.wins}W ${solo.losses}L` : 'Unranked', inline: true },
        { name: 'Flex', value: flex ? `${formatRank(flex)} — ${flex.wins}W ${flex.losses}L` : 'Unranked', inline: true }
      )
      .setTimestamp();

    if (solo) {
      const wr = ((solo.wins / (solo.wins + solo.losses)) * 100).toFixed(1);
      embed.addFields({ name: 'Win Rate', value: `${wr}%`, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Rank error:', err);
    await interaction.editReply({ content: 'Failed to fetch rank data.' });
  }
}

async function handleStats(interaction) {
  const target = interaction.options.getUser('player') || interaction.user;
  const account = getLinkedAccount(interaction.guildId, target.id);

  if (!account) {
    await interaction.reply({
      content: target.id === interaction.user.id
        ? 'You haven\'t linked your Riot account yet. Use `/league link`.'
        : `${target.username} hasn't linked their Riot account.`,
      ephemeral: true,
    });
    return;
  }

  const matches = getRecentMatches(interaction.guildId, target.id, 10);
  const streak = getLossStreak(interaction.guildId, target.id);

  if (!matches.length) {
    await interaction.reply({
      content: 'No tracked matches yet. Games will show up after they\'re played.',
      ephemeral: true,
    });
    return;
  }

  const lines = matches.map(m => {
    const result = m.win ? '🟢 W' : '🔴 L';
    const kda = `${m.kills}/${m.deaths}/${m.assists}`;
    return `${result} | **${m.champion}** | ${kda}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle(`${account.game_name}#${account.tag_line} — Recent Games`)
    .setDescription(lines.join('\n'))
    .setTimestamp();

  if (streak.current_streak > 0) {
    embed.addFields({ name: 'Current Loss Streak', value: `🔥 ${streak.current_streak}`, inline: true });
  }
  if (streak.max_streak > 0) {
    embed.addFields({ name: 'Worst Loss Streak', value: `💀 ${streak.max_streak}`, inline: true });
  }

  await interaction.reply({ embeds: [embed] });
}

async function handleLeaderboard(interaction) {
  const accounts = getAllLinkedAccounts(interaction.guildId);
  if (!accounts.length) {
    await interaction.reply({ content: 'No one has linked their Riot account yet.', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const rankings = [];
  for (const account of accounts) {
    try {
      const entries = await getRankedEntries(account.summoner_id);
      const solo = getSoloQueue(entries);
      if (solo) {
        rankings.push({
          userId: account.user_id,
          name: `${account.game_name}#${account.tag_line}`,
          tier: solo.tier,
          rank: solo.rank,
          lp: solo.leaguePoints,
          wins: solo.wins,
          losses: solo.losses,
          sortValue: tierToValue(solo.tier, solo.rank, solo.leaguePoints),
        });
      }
    } catch {
      // Skip accounts that fail
    }
  }

  rankings.sort((a, b) => b.sortValue - a.sortValue);

  if (!rankings.length) {
    await interaction.editReply({ content: 'No one is ranked yet.' });
    return;
  }

  const lines = rankings.map((r, i) => {
    const medal = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const wr = ((r.wins / (r.wins + r.losses)) * 100).toFixed(0);
    return `${medal} **${r.name}** — ${r.tier} ${r.rank} (${r.lp} LP) | ${wr}% WR`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle('Server Leaderboard')
    .setDescription(lines.join('\n'))
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleShame(interaction) {
  const accounts = getAllLinkedAccounts(interaction.guildId);
  if (!accounts.length) {
    await interaction.reply({ content: 'No one has linked their Riot account yet.', ephemeral: true });
    return;
  }

  const { getDb } = require('../database');
  const db = getDb();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const shameStats = [];
  for (const account of accounts) {
    const matches = db.prepare(
      `SELECT * FROM match_history WHERE guild_id = ? AND user_id = ? AND played_at > ?`
    ).all(interaction.guildId, account.user_id, weekAgo);

    if (!matches.length) continue;

    const totalDeaths = matches.reduce((sum, m) => sum + m.deaths, 0);
    const totalKills = matches.reduce((sum, m) => sum + m.kills, 0);
    const totalAssists = matches.reduce((sum, m) => sum + m.assists, 0);
    const losses = matches.filter(m => !m.win).length;
    const kda = totalDeaths > 0 ? ((totalKills + totalAssists) / totalDeaths).toFixed(2) : 'Perfect';

    shameStats.push({
      name: `${account.game_name}#${account.tag_line}`,
      userId: account.user_id,
      deaths: totalDeaths,
      kda,
      losses,
      games: matches.length,
    });
  }

  if (!shameStats.length) {
    await interaction.reply({ content: 'No match data this week.', ephemeral: true });
    return;
  }

  shameStats.sort((a, b) => b.deaths - a.deaths);

  const lines = shameStats.map((s, i) => {
    const skull = i === 0 ? '💀' : '☠️';
    return `${skull} **${s.name}** — ${s.deaths} deaths (${s.kda} KDA) | ${s.losses}L in ${s.games} games`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('🔔 Wall of Shame — This Week')
    .setDescription(lines.join('\n'))
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleLeagueHelp(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle('League of Legends Commands')
    .addFields(
      {
        name: '/league link [riot-id]',
        value: 'Link your Riot account to your Discord. Use the format `Name#TAG`.\nOnce linked, the bot tracks your matches automatically.',
      },
      {
        name: '/league rank [@player]',
        value: 'Show Solo/Duo and Flex rank, LP, and win rate.\nLeave player blank to check yourself.',
      },
      {
        name: '/league stats [@player]',
        value: 'Show your last 10 tracked games with champion, KDA, and W/L.\nAlso shows your current and worst loss streaks.',
      },
      {
        name: '/league leaderboard',
        value: 'Server-wide ranked leaderboard sorted by Solo/Duo rank.',
      },
      {
        name: '/league shame',
        value: 'Wall of Shame for the past week — sorted by most deaths.\nShows total deaths, KDA, and losses.',
      },
      {
        name: 'Auto Tracking',
        value: 'The bot checks for new matches every 3 minutes. Loss streaks are tracked automatically and shame messages are posted in #league.',
      }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

function tierToValue(tier, rank, lp) {
  const tiers = { IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4, EMERALD: 5, DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9 };
  const ranks = { IV: 0, III: 1, II: 2, I: 3 };
  return (tiers[tier] || 0) * 400 + (ranks[rank] || 0) * 100 + (lp || 0);
}
