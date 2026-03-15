const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  addRoleDefinition,
  removeRoleDefinition,
  getRolesByCategory,
  getUnonboardedMembers,
  updateGuildConfig,
  isProtectedRole,
} = require('../utils/roles');
const { rosterEmbed } = require('../utils/embeds');
const { ROLE_CATEGORIES } = require('../config');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('admin')
      .setDescription('Admin commands for managing the server')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addSubcommandGroup(group =>
        group
          .setName('genre')
          .setDescription('Manage genre roles')
          .addSubcommand(sub =>
            sub
              .setName('add')
              .setDescription('Add a new genre role')
              .addStringOption(opt =>
                opt.setName('name').setDescription('Genre name').setRequired(true)
              )
          )
          .addSubcommand(sub =>
            sub
              .setName('remove')
              .setDescription('Remove a genre role')
              .addStringOption(opt =>
                opt.setName('name').setDescription('Genre name').setRequired(true)
              )
          )
      )
      .addSubcommandGroup(group =>
        group
          .setName('platform')
          .setDescription('Manage platform roles')
          .addSubcommand(sub =>
            sub
              .setName('add')
              .setDescription('Add a new platform role')
              .addStringOption(opt =>
                opt.setName('name').setDescription('Platform name').setRequired(true)
              )
          )
          .addSubcommand(sub =>
            sub
              .setName('remove')
              .setDescription('Remove a platform role')
              .addStringOption(opt =>
                opt.setName('name').setDescription('Platform name').setRequired(true)
              )
          )
      )
      .addSubcommandGroup(group =>
        group
          .setName('tilt')
          .setDescription('Manage tilt tier roles')
          .addSubcommand(sub =>
            sub
              .setName('add')
              .setDescription('Add a new tilt tier')
              .addStringOption(opt =>
                opt.setName('name').setDescription('Tilt tier name').setRequired(true)
              )
          )
          .addSubcommand(sub =>
            sub
              .setName('remove')
              .setDescription('Remove a tilt tier')
              .addStringOption(opt =>
                opt.setName('name').setDescription('Tilt tier name').setRequired(true)
              )
          )
      )
      .addSubcommandGroup(group =>
        group
          .setName('game')
          .setDescription('Manage the game catalog')
          .addSubcommand(sub =>
            sub
              .setName('add')
              .setDescription('Add a game to the catalog')
              .addStringOption(opt =>
                opt.setName('name').setDescription('Game name').setRequired(true)
              )
              .addStringOption(opt =>
                opt.setName('genres').setDescription('Genres (comma-separated, e.g. "FPS,Battle Royale")').setRequired(true)
              )
              .addStringOption(opt =>
                opt.setName('platforms').setDescription('Platforms (comma-separated, e.g. "PC,PS5") — leave empty for all').setRequired(false)
              )
          )
          .addSubcommand(sub =>
            sub
              .setName('remove')
              .setDescription('Remove a game from the catalog')
              .addStringOption(opt =>
                opt.setName('name').setDescription('Game name').setRequired(true)
              )
          )
      )
      .addSubcommand(sub =>
        sub.setName('roster').setDescription('Show server role breakdown')
      )
      .addSubcommand(sub =>
        sub.setName('sync').setDescription('Re-sync bot role IDs with existing Discord roles (fixes mismatches)')
      )
      .addSubcommand(sub =>
        sub
          .setName('unroled')
          .setDescription('List members who haven\'t completed onboarding')
          .addIntegerOption(opt =>
            opt
              .setName('days')
              .setDescription('Minimum days since joining')
              .setRequired(false)
          )
      )
      .addSubcommand(sub =>
        sub
          .setName('setchannel')
          .setDescription('Set a bot channel (onboarding, welcome, or log)')
          .addStringOption(opt =>
            opt
              .setName('type')
              .setDescription('Channel type')
              .setRequired(true)
              .addChoices(
                { name: 'onboarding', value: 'onboarding_channel_id' },
                { name: 'welcome', value: 'welcome_channel_id' },
                { name: 'log', value: 'log_channel_id' }
              )
          )
          .addChannelOption(opt =>
            opt.setName('channel').setDescription('The channel').setRequired(true)
          )
      )
      .addSubcommand(sub =>
        sub.setName('help').setDescription('Show admin command details')
      ),
    async execute(interaction) {
      const subcommandGroup = interaction.options.getSubcommandGroup(false);
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guildId;
      const guild = interaction.guild;

      // Allow help without permission check
      if (subcommand === 'help') {
        // handled below
      } else {
        // Check for Damage Control role
        const hasDamageControl = interaction.member.roles.cache.some(
          r => r.name === 'Damage Control'
        );
        if (!hasDamageControl && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.reply({
            content: 'You need the **Damage Control** role to use admin commands.',
            ephemeral: true,
          });
          return;
        }
      }

      // Handle game subcommand group separately
      if (subcommandGroup === 'game') {
        const { addGame, removeGame, getGuildGames } = require('../utils/games');
        const name = interaction.options.getString('name');

        if (subcommand === 'add') {
          const genresRaw = interaction.options.getString('genres');
          const platformsRaw = interaction.options.getString('platforms');
          const genres = genresRaw.split(',').map(s => s.trim()).filter(Boolean);
          const platforms = platformsRaw
            ? platformsRaw.split(',').map(s => s.trim()).filter(Boolean)
            : null;

          if (!genres.length) {
            await interaction.reply({ content: 'You need at least one genre.', ephemeral: true });
            return;
          }

          addGame(guildId, name, genres, platforms);
          await interaction.reply({
            content: `Added **${name}** to the game catalog.\nGenres: ${genres.join(', ')}\nPlatforms: ${platforms ? platforms.join(', ') : 'All'}`,
            ephemeral: true,
          });
        } else if (subcommand === 'remove') {
          const removed = removeGame(guildId, name);
          if (!removed) {
            await interaction.reply({ content: `**${name}** is not in the game catalog.`, ephemeral: true });
          } else {
            await interaction.reply({ content: `Removed **${name}** from the game catalog.`, ephemeral: true });
          }
        }
        return;
      }

      // Handle subcommand groups (genre/platform/tilt add/remove)
      if (subcommandGroup) {
        const name = interaction.options.getString('name');
        const categoryMap = {
          genre: ROLE_CATEGORIES.GENRE,
          platform: ROLE_CATEGORIES.PLATFORM,
          tilt: ROLE_CATEGORIES.TILT,
        };
        const category = categoryMap[subcommandGroup];

        if (subcommand === 'add') {
          if (isProtectedRole(name)) {
            await interaction.reply({
              content: `**${name}** is a protected role and cannot be managed by the bot.`,
              ephemeral: true,
            });
            return;
          }

          // Create the Discord role if it doesn't exist
          let role = guild.roles.cache.find(r => r.name === name);
          if (!role) {
            role = await guild.roles.create({
              name,
              reason: `Added by admin via /admin ${subcommandGroup} add`,
            });
          }

          addRoleDefinition(guildId, role.id, name, category);
          await interaction.reply({
            content: `Added **${name}** as a ${subcommandGroup} role.`,
            ephemeral: true,
          });
        } else if (subcommand === 'remove') {
          const existing = getRolesByCategory(guildId, category);
          const roleDef = existing.find(
            r => r.name.toLowerCase() === name.toLowerCase()
          );

          if (!roleDef) {
            await interaction.reply({
              content: `**${name}** is not a registered ${subcommandGroup} role.`,
              ephemeral: true,
            });
            return;
          }

          // Count members with this role
          const role = guild.roles.cache.get(roleDef.role_id);
          const memberCount = role ? role.members.size : 0;

          removeRoleDefinition(guildId, roleDef.name, category);
          await interaction.reply({
            content: `Removed **${name}** as a ${subcommandGroup} role.` +
              (memberCount > 0
                ? ` Warning: ${memberCount} member(s) currently have this role.`
                : ''),
            ephemeral: true,
          });
        }
        return;
      }

      // Handle standalone subcommands
      if (subcommand === 'roster') {
        await interaction.deferReply({ ephemeral: true });

        // Fetch all members via REST API (avoids gateway rate limits)
        const allMembers = new Map();
        let lastId = '0';
        while (true) {
          const batch = await guild.members.list({ limit: 1000, after: lastId });
          if (batch.size === 0) break;
          batch.forEach(m => allMembers.set(m.id, m));
          lastId = batch.last().id;
          if (batch.size < 1000) break;
        }

        const humans = [...allMembers.values()].filter(m => !m.user.bot);
        console.log(`[roster] Fetched ${humans.length} human members`);

        const tiltRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.TILT);
        const genreRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.GENRE);
        const platformRoles = getRolesByCategory(guildId, ROLE_CATEGORIES.PLATFORM);

        // Debug: show what the caller's roles look like
        const caller = allMembers.get(interaction.user.id);
        if (caller) {
          console.log(`[roster] Your roles:`, caller.roles.cache.map(r => `${r.name} (${r.id})`).join(', '));
        }
        console.log(`[roster] DB tilt role IDs:`, tiltRoles.map(r => `${r.name}=${r.role_id}`).join(', '));

        const countRoles = (roleDefs) => {
          const counts = {};
          for (const r of roleDefs) {
            counts[r.name] = humans.filter(m => m.roles.cache.has(r.role_id)).length;
          }
          return counts;
        };

        const allManagedIds = [
          ...tiltRoles.map(r => r.role_id),
          ...genreRoles.map(r => r.role_id),
          ...platformRoles.map(r => r.role_id),
        ];
        const noRolesCount = humans.filter(m =>
          !m.roles.cache.some(r => allManagedIds.includes(r.id))
        ).length;

        const embed = rosterEmbed(
          countRoles(tiltRoles),
          countRoles(genreRoles),
          countRoles(platformRoles),
          noRolesCount
        );
        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'unroled') {
        const days = interaction.options.getInteger('days') || 7;
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

        const members = await guild.members.fetch();
        const unroled = members.filter(m => {
          if (m.user.bot) return false;
          const generalRole = guild.roles.cache.find(r => r.name === 'General');
          const hasGeneral = generalRole && m.roles.cache.has(generalRole.id);
          if (hasGeneral) return false;
          const joinedAt = m.joinedAt?.getTime() || Date.now();
          return joinedAt < cutoff;
        });

        if (unroled.size === 0) {
          await interaction.reply({
            content: `No members have been waiting longer than ${days} days without completing onboarding.`,
            ephemeral: true,
          });
          return;
        }

        const list = unroled
          .map(m => {
            const daysAgo = Math.floor(
              (Date.now() - (m.joinedAt?.getTime() || Date.now())) / (1000 * 60 * 60 * 24)
            );
            return `- ${m.user.tag} (joined ${daysAgo} days ago)`;
          })
          .join('\n');

        await interaction.reply({
          content: `**Members without roles (${days}+ days):**\n${list}`,
          ephemeral: true,
        });
      } else if (subcommand === 'sync') {
        await interaction.deferReply({ ephemeral: true });

        const { getDb } = require('../database');
        const db = getDb();

        // Get all Discord roles on the server
        await guild.roles.fetch();
        const discordRoles = guild.roles.cache
          .filter(r => r.name !== '@everyone')
          .map(r => `${r.name} (${r.id})`);

        // Get current DB definitions
        const currentDefs = db.prepare('SELECT * FROM role_definitions WHERE guild_id = ?').all(guildId);

        // For each DB role, try to find a matching Discord role by name (case-insensitive)
        let fixed = 0;
        let notFound = [];
        for (const def of currentDefs) {
          const match = guild.roles.cache.find(
            r => r.name.toLowerCase() === def.name.toLowerCase()
          );
          if (match && match.id !== def.role_id) {
            db.prepare('UPDATE role_definitions SET role_id = ? WHERE id = ?').run(match.id, def.id);
            console.log(`[sync] Fixed ${def.name}: ${def.role_id} -> ${match.id}`);
            fixed++;
          } else if (!match) {
            notFound.push(def.name);
          }
        }

        let msg = `Sync complete. Fixed **${fixed}** role ID(s).`;
        if (notFound.length) {
          msg += `\n\nCouldn't find Discord roles for: ${notFound.join(', ')}`;
          msg += `\n\nAvailable server roles:\n${discordRoles.join('\n')}`;
        }
        await interaction.editReply({ content: msg });
      } else if (subcommand === 'setchannel') {
        const type = interaction.options.getString('type');
        const channel = interaction.options.getChannel('channel');
        updateGuildConfig(guildId, type, channel.id);

        const friendlyNames = {
          onboarding_channel_id: 'onboarding',
          welcome_channel_id: 'welcome',
          log_channel_id: 'log',
        };
        await interaction.reply({
          content: `Set **${friendlyNames[type]}** channel to ${channel}.`,
          ephemeral: true,
        });
      } else if (subcommand === 'help') {
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('Admin Commands *(Damage Control only)*')
          .addFields(
            {
              name: 'Role Management',
              value: [
                '`/admin genre add [name]` — Add a new genre role',
                '`/admin genre remove [name]` — Remove a genre role',
                '`/admin platform add [name]` — Add a new platform role',
                '`/admin platform remove [name]` — Remove a platform role',
                '`/admin tilt add [name]` — Add a new tilt tier',
                '`/admin tilt remove [name]` — Remove a tilt tier',
              ].join('\n'),
            },
            {
              name: 'Game Catalog',
              value: [
                '`/admin game add [name] [genres] [platforms]` — Add a game (platforms optional)',
                '`/admin game remove [name]` — Remove a game',
              ].join('\n'),
            },
            {
              name: 'Server Info',
              value: [
                '`/admin roster` — Role breakdown with member counts',
                '`/admin unroled [days]` — List members who haven\'t onboarded (default: 7 days)',
              ].join('\n'),
            },
            {
              name: 'Configuration',
              value: [
                '`/admin setchannel [type] [channel]` — Set onboarding, welcome, or log channel',
                '`/admin sync` — Re-sync bot role IDs with Discord (fixes mismatches)',
              ].join('\n'),
            }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    },
  },
];
