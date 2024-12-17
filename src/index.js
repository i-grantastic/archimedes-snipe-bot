require('dotenv').config();
const { Client, IntentsBitField, ActivityType, EmbedBuilder } = require('discord.js');

// inputs
const channelId = '1169317299237433475'; // snipe channel ID
const guildId = '1099834703130935296'; // archimedes server ID
const startDate = new Date('2024-11-06T18:40:00-05:00'); // -5:00 for EST, start from this date

// initialize point tracking object
const userPoints = {};

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

async function getUserTeam(userID, guild) {
  try {
    // Fetch the member object using the userID
    const member = await guild.members.fetch(userID);
    if (!member) {
      console.log('Member not found');
      return null;
    }

    // Define roles for each team
    const leadershipRoles = ['President', 'Vice President', 'Secretary', 'Treasurer', 'Publicity', 'Recruiter', 'Advisor'];
    const teamRoles = ['Astra', 'Infinitum', 'Juvo', 'Terra'];

    // Check for leadership roles first
    const hasLeadershipRole = member.roles.cache.some(role => leadershipRoles.includes(role.name));
    if (hasLeadershipRole) {
      return 'Leadership';
    }

    // If not leadership, check for other team roles
    const userRole = member.roles.cache.find(role => teamRoles.includes(role.name));
    return userRole ? userRole.name : null;

  } catch (error) {
    console.error('Error fetching member:', error);
    return null;
  }
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
client.on('ready', (c) => {
  console.log(`🟢 ${c.user.tag} online.`)

  client.user.setActivity({
    name: '📷 Always watching',
    type: ActivityType.Custom
  })
})

// initialize memory
let leaderboardMemory = {
  lastMessageId: null,
  userPoints: {}
};

// initialize cache
let leaderboardCache = {
  lastMessageId: null,
  userPoints: {}
};

// command listener
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // starts with !rules
  if (message.content.startsWith('!rules')) {
    const embed = new EmbedBuilder()
      .setTitle('How sniping works')
      .setDescription('"Sniping" refers to the action of taking a picture of someone without them noticing.')
      .setColor('#ffc800')
      .addFields(
        {
          name: '\u200B\nCounting your snipe',
          value: 'Send an image and tag the sniped member *in the same message.*'
        },
        {
          name: '\u200B\nRules',
          value: '1. No sniping within 15 minutes of a meeting.\n2. No sniping if a member location is revealed.\n3. No snipe-backs.'
        },
        {
          name: '\u200B\nInvalidating a snipe',
          value: 'If a snipe does not follow the rules, *delete the message.*'
        }
      )
    
    message.reply({ embeds: [embed]})
  }

  // starts with !leaderboard
  if (message.content.startsWith('!leaderboard') || message.content.startsWith('!leader') || message.content.startsWith('!lb')) {
    leaderboardCache = structuredClone(leaderboardMemory)

    // check if the leaderboard cache is empty
    if (Object.keys(leaderboardCache.userPoints).length === 0) {
      return message.channel.send("🔻 Memory error, please cache.");
    }

    const notice = await message.channel.send('🔹 Generating...');
    const args = message.content.split(' ');
    const sortType = args[1];

    const channel = await client.channels.fetch(channelId);

    // reset leaderboard data for this calculation
    Object.keys(userPoints).forEach(user => {
      userPoints[user].sniper = 0;
      userPoints[user].sniped = 0;
    });

    let lastMessageId = null;
    let keepFetching = true;

    while (keepFetching) {
      const options = { limit: 100 };
      if (lastMessageId) options.before = lastMessageId;

      const messages = await channel.messages.fetch(options);
      if (messages.size === 0) break;

      messages.forEach((msg) => {
        if (leaderboardCache.cacheDate && msg.createdTimestamp < leaderboardCache.cacheDate.getTime()) {
          keepFetching = false;
          return;
        }

        const hasImage = msg.attachments.some(attachment =>
          attachment.contentType && attachment.contentType.startsWith('image')
        ) || msg.embeds.some(embed => embed.image || embed.thumbnail);

        if (hasImage && msg.mentions.users.size > 0) {
          incrementPoints(msg.author.id, 'sniper');
          msg.mentions.users.forEach(user => {
            incrementPoints(user.id, 'sniped');
          });
        }
      });

      lastMessageId = messages.last().id;
    }

    // merge new results into the cached leaderboard
    Object.keys(userPoints).forEach(user => {
      if (!leaderboardCache.userPoints[user]) {
        leaderboardCache.userPoints[user] = userPoints[user];
      } else {
        leaderboardCache.userPoints[user].sniper += userPoints[user].sniper;
        leaderboardCache.userPoints[user].sniped += userPoints[user].sniped;
      }
    });

    // sort and display the combined leaderboard
    let combinedLeaderboard = Object.entries(leaderboardCache.userPoints)
    if (sortType === 'teams') {
      combinedLeaderboard = Object.entries(leaderboardCache.teamPoints)
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
    } else if (sortType === 'kd' || sortType === 'k/d') {
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

    } else {
      for (const [index, [userId, points]] of sortedUsers.entries()) {
        const user = await guild.members.fetch(userId);
        const medal = medals[index] || `(${index+1})`;
        const shortName = user.displayName.split(' ')[0];
        leaderboard += `${medal} ${shortName} — ${points.sniper} • ${points.sniped} • ${calculateKD(points.sniper, points.sniped)}\n`;
      };

      // create the EmbedBuilder
      embed = new EmbedBuilder()
        .setTitle(`**${title}**`)
        .setDescription(leaderboard)
        .setColor('#ffc800')
        .setFooter({ text: 'Sniper • Sniped • K/D' });
    }

    // send the embed
    await message.channel.send({ embeds: [embed] });
    notice.delete();
  }
})

// listen for images without tag
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== channelId) return;

  // check if the message contains an image (attachment or embed)
  const hasImage = message.attachments.some(attachment => 
    attachment.contentType && attachment.contentType.startsWith('image')
  ) || message.embeds.some(embed => embed.image || embed.thumbnail);

  // check if there are no tagged users
  const hasNoTaggedUser = message.mentions.users.size === 0;

  // if there is an image and no tagged user, react
  if (hasImage && hasNoTaggedUser) {
    message.react('⚠️');
  }
});

// message forwarding
const sourceChannelId = '1306105955854975016'; // input channel
const targetChannelId = channelId; // output channel
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== sourceChannelId) return;

  const targetChannel = await client.channels.fetch(targetChannelId);
  if (!targetChannel) return;

  // forward the message content, if any
  if (message.content) {
    targetChannel.send(message.content);
  }

  // forward attachments (images or other files), if any
  if (message.attachments.size > 0) {
    message.attachments.forEach((attachment) => {
      targetChannel.send({ files: [attachment.url] });
    });
  }
});

// cache leaderboard
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!cache')) {
    const channel = await client.channels.fetch(channelId);
    const notice = await message.channel.send('🔸 Caching...');

    // reset leaderboard data for this calculation
    Object.keys(userPoints).forEach(user => {
      userPoints[user].sniper = 0;
      userPoints[user].sniped = 0;
    });

    const teamPoints = { Astra: { sniper: 0, sniped: 0 }, Infinitum: { sniper: 0, sniped: 0 }, Juvo: { sniper: 0, sniped: 0 }, Terra: { sniper: 0, sniped: 0 }, Leadership: { sniper: 0, sniped: 0 } };

    let lastMessageId = null;
    let keepFetching = true;

    while (keepFetching) {
      const options = { limit: 1000 };
      if (lastMessageId) options.before = lastMessageId;

      const messages = await channel.messages.fetch(options);
      if (messages.size === 0) break;

      messages.forEach(async (msg) => {
        if (msg.createdTimestamp < startDate.getTime()) {
          keepFetching = false;
          return;
        }

        const hasImage = msg.attachments.some(attachment =>
          attachment.contentType && attachment.contentType.startsWith('image')
        ) || msg.embeds.some(embed => embed.image || embed.thumbnail);

        if (hasImage && msg.mentions.users.size > 0) {
          incrementPoints(msg.author.id, 'sniper');

          const authorTeam = await getUserTeam(msg.author.id, msg.guild);
          if (authorTeam && teamPoints[authorTeam]) {
            teamPoints[authorTeam].sniper++;
          }

          msg.mentions.users.forEach(async user => {
            incrementPoints(user.id, 'sniped');

            const mentionedTeam = await getUserTeam(user.id, msg.guild);
            if (mentionedTeam && teamPoints[mentionedTeam]) {
              teamPoints[mentionedTeam].sniped++;
            }
          });
        }
      });

      lastMessageId = messages.last().id;
    }

    // cache the results
    leaderboardMemory.userPoints = JSON.parse(JSON.stringify(userPoints));
    leaderboardMemory.teamPoints = JSON.parse(JSON.stringify(teamPoints));
    leaderboardMemory.cacheDate = new Date();
    console.log(leaderboardMemory.teamPoints);

    message.channel.send(`✅ Leaderboard cached at ${leaderboardMemory.cacheDate.toLocaleString()} UTC`);
    notice.delete();
  }
});

// enable bot by entering nodemon in the terminal
client.login(process.env.TOKEN)