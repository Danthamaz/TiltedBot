const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDb } = require('../database');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('quote')
      .setDescription('Quote commands')
      .addSubcommand(sub =>
        sub.setName('add')
          .setDescription('Add a quote to the wall')
          .addStringOption(opt =>
            opt.setName('text')
              .setDescription('The quote')
              .setRequired(true)
          )
          .addUserOption(opt =>
            opt.setName('who')
              .setDescription('Who said it')
              .setRequired(true)
          )
      )
      .addSubcommand(sub =>
        sub.setName('random')
          .setDescription('Get a random quote')
          .addUserOption(opt =>
            opt.setName('who')
              .setDescription('Get a random quote from this person')
              .setRequired(false)
          )
      )
      .addSubcommand(sub =>
        sub.setName('wall')
          .setDescription('Show the quote wall')
          .addUserOption(opt =>
            opt.setName('who')
              .setDescription('Filter by person')
              .setRequired(false)
          )
      )
      .addSubcommand(sub =>
        sub.setName('remove')
          .setDescription('Remove a quote by ID')
          .addIntegerOption(opt =>
            opt.setName('id')
              .setDescription('Quote ID')
              .setRequired(true)
          )
      ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === 'add') return handleAdd(interaction);
      if (sub === 'random') return handleRandom(interaction);
      if (sub === 'wall') return handleWall(interaction);
      if (sub === 'remove') return handleRemove(interaction);
    },
  },
];

async function handleAdd(interaction) {
  const text = interaction.options.getString('text');
  const who = interaction.options.getUser('who');
  const db = getDb();

  db.prepare(
    'INSERT INTO quotes (guild_id, quote, said_by_user_id, added_by_user_id) VALUES (?, ?, ?, ?)'
  ).run(interaction.guildId, text, who.id, interaction.user.id);

  await interaction.reply({
    content: `Added quote from ${who}:\n> "${text}"`,
  });
}

async function handleRandom(interaction) {
  const who = interaction.options.getUser('who');
  const db = getDb();

  let row;
  if (who) {
    row = db.prepare(
      'SELECT * FROM quotes WHERE guild_id = ? AND said_by_user_id = ? ORDER BY RANDOM() LIMIT 1'
    ).get(interaction.guildId, who.id);
  } else {
    row = db.prepare(
      'SELECT * FROM quotes WHERE guild_id = ? ORDER BY RANDOM() LIMIT 1'
    ).get(interaction.guildId);
  }

  if (!row) {
    await interaction.reply({
      content: who ? `No quotes from ${who} yet.` : 'No quotes yet. Add one with `/quote add`.',
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xff4444)
    .setDescription(`> "${row.quote}"\n\n— <@${row.said_by_user_id}>`)
    .setFooter({ text: `Quote #${row.id}` })
    .setTimestamp(new Date(row.added_at));

  await interaction.reply({ embeds: [embed] });
}

async function handleWall(interaction) {
  const who = interaction.options.getUser('who');
  const db = getDb();

  let rows;
  if (who) {
    rows = db.prepare(
      'SELECT * FROM quotes WHERE guild_id = ? AND said_by_user_id = ? ORDER BY added_at DESC LIMIT 15'
    ).all(interaction.guildId, who.id);
  } else {
    rows = db.prepare(
      'SELECT * FROM quotes WHERE guild_id = ? ORDER BY added_at DESC LIMIT 15'
    ).all(interaction.guildId);
  }

  if (!rows.length) {
    await interaction.reply({
      content: who ? `No quotes from ${who} yet.` : 'No quotes yet. Add one with `/quote add`.',
      ephemeral: true,
    });
    return;
  }

  const lines = rows.map(r =>
    `**#${r.id}** — <@${r.said_by_user_id}>: "${r.quote}"`
  );

  const title = who ? `Quotes from <@${who.id}>` : 'Quote Wall';

  const embed = new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle(title)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `${rows.length} quote${rows.length === 1 ? '' : 's'} shown` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleRemove(interaction) {
  const id = interaction.options.getInteger('id');
  const db = getDb();

  const row = db.prepare(
    'SELECT * FROM quotes WHERE id = ? AND guild_id = ?'
  ).get(id, interaction.guildId);

  if (!row) {
    await interaction.reply({ content: `Quote #${id} not found.`, ephemeral: true });
    return;
  }

  // Only the person who added it or Damage Control can remove
  const hasDamageControl = interaction.member.roles.cache.some(r => r.name === 'Damage Control');
  if (row.added_by_user_id !== interaction.user.id && !hasDamageControl) {
    await interaction.reply({ content: 'You can only remove quotes you added.', ephemeral: true });
    return;
  }

  db.prepare('DELETE FROM quotes WHERE id = ? AND guild_id = ?').run(id, interaction.guildId);
  await interaction.reply({ content: `Deleted quote #${id}.`, ephemeral: true });
}
