require('dotenv').config();
const { Client, IntentsBitField, ActivityType, EmbedBuilder } = require('discord.js');

// inputs
const channelId = '1169317299237433475'; // snipe channel ID
const guildId = '1099834703130935296'; // archimedes server ID
const startDate = new Date('2025-09-27T01:00:00-05:00'); // -5:00 for EST, start from this date

// initialize point tracking object
const userPoints = {};
const teamPoints = { Astra: { sniper: 0, sniped: 0 }, Infinitum: { sniper: 0, sniped: 0 }, Juvo: { sniper: 0, sniped: 0 }, Terra: { sniper: 0, sniped: 0 }, Leadership: { sniper: 0, sniped: 0 } };
const snipedPairs = {};

// initialize leaderboard objects
let leaderboardMemory = {
  userPoints: {},
  teamPoints: {},
  snipedPairs: {},
  cacheDate: null
};

// function to increment points
function incrementPoints(userId, type) {
  if (!userPoints[userId]) {
    userPoints[userId] = { sniper: 0, sniped: 0 };
  }
  userPoints[userId][type]++;
}

// function to calculate k/d ratio
function calculateKD(sniper, sniped) {
  if (sniped === 0) {
    return 'UD'
  } else {
    kd = sniper/sniped;
    return kd.toFixed(2);
  }
}

// function to get team
async function getUserTeam(userID, guild) {
  try {
    // fetch the member object using the userID
    const member = await guild.members.fetch(userID);
    if (!member) {
      console.log('Member not found');
      return null;
    }

    // define roles for each team
    const leadershipRoles = ['Executive Board', 'Officer', 'Advisor', 'Recruiter/Interviewer'];
    const teamRoles = ['Astra', 'Infinitum', 'Juvo', 'Terra'];
    const alumniRoles = ['E-board Alumni', 'Astra Alumni', "Infinitum Alumni", "Juvo Alumni", "Terra Alumni"];

    // check for leadership roles first
    const hasLeadershipRole = member.roles.cache.some(role => leadershipRoles.includes(role.name));
    if (hasLeadershipRole) {
      return 'Leadership';
    }

    // check for alumni roles second
    const hasAlumniRole = member.roles.cache.some(role => alumniRoles.includes(role.name));
    if (hasAlumniRole) {
      return 'Alumni';
    }

    // else check for other team roles
    const userRole = member.roles.cache.find(role => teamRoles.includes(role.name));
    return userRole ? userRole.name : null;

  } catch (error) {
    console.error('Error fetching member:', error);
    return null;
  }
}

// function to get leaderboard
async function getLeaderboard(stopDate, timeout) {
  const channel = await client.channels.fetch(channelId);
  let lastMessageId = null;
  let keepFetching = true;
  let getLeaderboard = {
    userPoints: {},
    teamPoints: {},
    snipedPairs: {},
    cacheDate: null
  };

  // reset leaderboard data for this calculation
  Object.keys(userPoints).forEach(user => {
    userPoints[user].sniper = 0;
    userPoints[user].sniped = 0;
  });
  Object.keys(teamPoints).forEach(team => {
    teamPoints[team].sniper = 0;
    teamPoints[team].sniped = 0;
  })
  Object.keys(snipedPairs).forEach(pair => {
    snipedPairs[pair] = 0;
  });

  while (keepFetching) {
    const options = { limit: 100 };
    if (lastMessageId) options.before = lastMessageId;

    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;

    messages.forEach(async (msg) => {
      if (msg.createdTimestamp < stopDate.getTime()) {
        keepFetching = false;
        return;
      }

      const hasExplicitMention = [...msg.mentions.users.values()].some(user =>
        msg.content.includes(`<@${user.id}>`) || msg.content.includes(`<@!${user.id}>`)
      );

      const hasImage = msg.attachments.some(attachment =>
        attachment.contentType && attachment.contentType.startsWith('image') && attachment.contentType !== 'image/gif'
      );

      if (hasImage && hasExplicitMention) {
        try {
          // check if member exists
          const author = await msg.guild.members.fetch(msg.author.id);

          // add points to user
          msg.mentions.users.forEach(() => {
            incrementPoints(msg.author.id, 'sniper');
          });

          // add points to team
          const authorTeam = await getUserTeam(msg.author.id, msg.guild);
          if (authorTeam && teamPoints[authorTeam]) {
            teamPoints[authorTeam].sniper++;
          }
        } catch(error) {
          if (error.code === 10007) {
            console.log(`User ${msg.author.id} has left the server, skipping...`);
          } else {
            console.error(`Error fetching user ${msg.author.id}:`, error);
          }
        }

        msg.mentions.users.forEach(async user => {
          try {
            // check if member exists
            const member = await msg.guild.members.fetch(user.id);

            // add points to user
            incrementPoints(user.id, 'sniped');

            // add points to team
            const mentionedTeam = await getUserTeam(user.id, msg.guild);
            if (mentionedTeam && teamPoints[mentionedTeam]) {
              teamPoints[mentionedTeam].sniped++;
            }

            // add points to duos
            const pairKey = `${msg.author.id}:${user.id}`;
            const pairKeyInv = `${user.id}:${msg.author.id}`;

            if (snipedPairs[pairKey] === undefined && snipedPairs[pairKeyInv] === undefined) {
              snipedPairs[pairKey] = 1;
            } else if (snipedPairs[pairKeyInv] !== undefined) {
              snipedPairs[pairKeyInv]++;
            } else {
              snipedPairs[pairKey]++;
            }
          } catch(error) {
            if (error.code === 10007) {
              console.log(`User ${user.id} has left the server, skipping...`);
            } else {
              console.error(`Error fetching user ${user.id}:`, error);
            }
          }
        });
      }
    });

    lastMessageId = messages.last().id;
    await new Promise(resolve => setTimeout(resolve, timeout));
  }

  // cache the results
  getLeaderboard.userPoints = JSON.parse(JSON.stringify(userPoints));
  getLeaderboard.teamPoints = JSON.parse(JSON.stringify(teamPoints));
  getLeaderboard.snipedPairs = JSON.parse(JSON.stringify(snipedPairs));
  getLeaderboard.cacheDate = new Date();

  return getLeaderboard
}

// settings to include
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ]
})

// activate bot
client.on('clientReady', (c) => {
  console.log(`🟢 ${c.user.tag} online.`)

  client.user.setActivity({
    name: '📷 Always watching',
    type: ActivityType.Custom
  })
})

// help
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'help') return;
  const embed = new EmbedBuilder()
    .setTitle('**Help**')
    .setDescription(`"Sniping" refers to the action of taking a picture of someone without them noticing. To count your snipe, send an image and tag the sniped member *in the same message.* Use \`/rules\` for a list of rules.\n[SnipeBot Documentation](<https://docs.google.com/document/d/1-fwhA2Hq03x8D3etCO0LTgx7B3W9w96ZYUBcWh5xAFs/edit?usp=sharing>)`)
    .setColor('#ffc800')
  await interaction.reply({ embeds: [embed]})
});

// rules
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'rules') return;
  const embed = new EmbedBuilder()
    .setTitle('**Rules**')
    .setDescription('1. No sniping within 15 minutes of a meeting.\n2. No sniping if a member location is revealed or known.\n3. No snipe-backs.\n4. No sniping in restrooms or inside apartments/dorm rooms.')
    .setColor('#ffc800')
  await interaction.reply({ embeds: [embed]})
});

// leaderboard
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand() || interaction.commandName !== 'leaderboard') return;
  await interaction.deferReply();
  
  // check if the leaderboard cache is empty
  if (Object.keys(leaderboardMemory.userPoints).length === 0) {
    return await interaction.editReply("Memory is empty!");
  }

  const sortType = interaction.options.get('filter')?.value ?? 'sniper';
  let leaderboardCache = structuredClone(leaderboardMemory);
  await getLeaderboard(leaderboardMemory.cacheDate, 0);

  // merge new results into the cached leaderboard
  Object.keys(userPoints).forEach(user => {
    if (!leaderboardCache.userPoints[user]) {
      leaderboardCache.userPoints[user] = userPoints[user];
    } else {
      leaderboardCache.userPoints[user].sniper += userPoints[user].sniper;
      leaderboardCache.userPoints[user].sniped += userPoints[user].sniped;
    }
  });
  Object.keys(teamPoints).forEach(team => {
    if (!leaderboardCache.teamPoints[team]) {
      leaderboardCache.teamPoints[team] = teamPoints[team];
    } else {
      leaderboardCache.teamPoints[team].sniper += teamPoints[team].sniper;
      leaderboardCache.teamPoints[team].sniped += teamPoints[team].sniped;
    }
  });
  Object.keys(snipedPairs).forEach(pair => {
    if (!leaderboardCache.snipedPairs[pair]) {
      leaderboardCache.snipedPairs[pair] = snipedPairs[pair];
    } else {
      leaderboardCache.snipedPairs[pair] += snipedPairs[pair];
    }
  });

  // sort and display the combined leaderboard
  let combinedLeaderboard = Object.entries(leaderboardCache.userPoints)
  if (sortType === 'teams') {
    combinedLeaderboard = Object.entries(leaderboardCache.teamPoints)
  }
  if (sortType === 'duos') {
    combinedLeaderboard = Object.entries(leaderboardCache.snipedPairs)
  }
  let sortedUsers;
  let title = 'Leaderboard'
  if (sortType === 'sniped') {
    title = 'Leaderboard: Most Sniped';
    sortedUsers = combinedLeaderboard.sort(([, a], [, b]) => {
      // primary sort by sniped points (descending)
      if (b.sniped !== a.sniped) return b.sniped - a.sniped;
      // secondary sort by sniper points (ascending)
      return a.sniper - b.sniper;
    });
  } else if (sortType === 'kd') {
    title = 'Leaderboard: Highest K/D';
    sortedUsers = combinedLeaderboard.sort(([, a], [, b]) => {
      // primary sort by sniper points (descending)
      if (b.sniper/b.sniped !== a.sniper/a.sniped) return b.sniper/b.sniped - a.sniper/a.sniped;
      // secondary sort by sniped points (ascending)
      return b.sniper - a.sniper;
    });
  } else if (sortType === 'teams') {
    title = 'Leaderboard: Teams';
    sortedUsers = combinedLeaderboard.sort(([, a], [, b]) => {
      // primary sort by sniper points (descending)
      if (b.sniper !== a.sniper) return b.sniper - a.sniper;
      // secondary sort by sniped points (ascending)
      return a.sniped - b.sniped;
    });
  } else if (sortType === 'duos') {
    title = 'Leaderboard: Sniper Duos';
    sortedUsers = combinedLeaderboard
      .map(([pair, count]) => {
        const [sniperId, snipedId] = pair.split(':');
        return {
          sniperId,
          snipedId,
          count,
        };
      })
      .sort((a, b) => b.count - a.count);
  } else {
    sortedUsers = combinedLeaderboard.sort(([, a], [, b]) => {
      // primary sort by sniper points (descending)
      if (b.sniper !== a.sniper) return b.sniper - a.sniper;
      // secondary sort by sniped points (ascending)
      return a.sniped - b.sniped;
    });
  }

  if (sortType !== 'all') {
    sortedUsers = sortedUsers.slice(0, 10);
  }

  // build the description string
  const medals = ['🥇', '🥈', '🥉'];
  const guild = await client.guilds.fetch(guildId);

  let leaderboard = '';
  let embed = '';

  if (sortType === 'teams') {
    for (const [index, [team, points]] of sortedUsers.entries()) {
      const medal = medals[index] || `(${index+1})`;
      leaderboard += `${medal} ${team} — ${points.sniper} • ${points.sniped} • ${calculateKD(points.sniper, points.sniped)}\n`;
    };

    // create the EmbedBuilder
    embed = new EmbedBuilder()
      .setTitle(`**${title}**`)
      .setDescription(leaderboard)
      .setColor('#ffc800')
      .setFooter({ text: 'Sniper • Sniped • K/D' });

  } else if (sortType === 'duos') {
    for (const [index, { sniperId, snipedId, count }] of sortedUsers.entries()) {
      const sniper = await guild.members.fetch(sniperId);
      const sniped = await guild.members.fetch(snipedId);
      let sniperDispName = sniper.displayName;
      let snipedDispName = sniped.displayName;
      if (sniperDispName.length > 15) sniperDispName = sniperDispName.slice(0, 13) + '...';
      if (snipedDispName.length > 15) snipedDispName = snipedDispName.slice(0, 13) + '...';
      const medal = medals[index] || `(${index+1})`;
      leaderboard += `${medal} ${sniperDispName} ⇄ ${snipedDispName} (${count}) \n`;
    };

    // create the EmbedBuilder
    embed = new EmbedBuilder()
      .setTitle(`**${title}**`)
      .setDescription(leaderboard)
      .setColor('#ffc800')
      .setFooter({ text: 'Sniper ⇄ Sniper (Amount)' });
  } else {
    for (const [index, [userId, points]] of sortedUsers.entries()) {
      const user = await guild.members.fetch(userId);
      const medal = medals[index] || `(${index+1})`;
      let dispName = user.displayName;
      if (dispName.length > 17) dispName = dispName.slice(0, 15) + '...';
      leaderboard += `${medal} ${dispName} — ${points.sniper} • ${points.sniped} • ${calculateKD(points.sniper, points.sniped)}\n`;
    };

    // create the EmbedBuilder
    embed = new EmbedBuilder()
      .setTitle(`**${title}**`)
      .setDescription(leaderboard)
      .setColor('#ffc800')
      .setFooter({ text: 'Sniper • Sniped • K/D' });
  }
  
  // send the embed
  await interaction.editReply({ embeds: [embed] });
});

// listen for images without tag
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== channelId) return;

  // check if the message contains an image (attachment or embed)
  const hasImage = message.attachments.some(attachment => 
    attachment.contentType && attachment.contentType.startsWith('image')
  ) || message.embeds.some(embed => embed.image || embed.thumbnail);

  // check if there are tagged users
  const hasExplicitMention = [...message.mentions.users.values()].some(user =>
    message.content.includes(`<@${user.id}>`) || message.content.includes(`<@!${user.id}>`)
  );

  // if there is an image and no tagged user, react
  if (hasImage && !hasExplicitMention) {
    message.react('⚠️');
  }
});

// cache
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'cache') return;
  await interaction.deferReply();
  leaderboardMemory = await getLeaderboard(startDate, 10000);
  await interaction.editReply(`✅ Leaderboard cached at ${leaderboardMemory.cacheDate.toLocaleString()} UTC`);
});

// enable bot by entering nodemon in the terminal
client.login(process.env.TOKEN)