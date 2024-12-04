require('dotenv').config()
const { Client, IntentsBitField, ActivityType, EmbedBuilder } = require('discord.js')

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
  if (message.content.startsWith('!leaderboard')) {
    const notice = await message.channel.send('🟡 Please wait...');
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
      .sort(([, a], [, b]) => {
        if (sortType === 'sniped') return b.sniped - a.sniped;
        if (sortType === 'kd') return (b.sniper / b.sniped || 0) - (a.sniper / a.sniped || 0);
        return b.sniper - a.sniper; // default sort by sniper points
      });

    if (sortType !== 'all') {
      combinedLeaderboard = combinedLeaderboard.slice(0, 10);
    }

    let leaderboard = '# Leaderboard\n**Member  •  Sniper  •  Sniped  •  K/D**\n';
    const guild = await client.guilds.fetch(guildId);
    const medals = ['🥇', '🥈', '🥉'];

    for (const [index, [userId, points]] of combinedLeaderboard.entries()) {
      const user = await guild.members.fetch(userId);
      const medal = medals[index] || `(${index + 1}) `;
      leaderboard += `${medal} ${user.displayName}  •  ${points.sniper}  •  ${points.sniped}  •  ${calculateKD(points.sniper, points.sniped)}\n`;
    }

    message.channel.send(leaderboard);
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

  // if there is an image and no tagged user, send a response
  if (hasImage && hasNoTaggedUser) {
    message.reply('⚠️ Was that a snipe? For a snipe to be counted, edit your message to include the tagged user in the same message.');
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
        if (msg.createdTimestamp < startDate.getTime()) {
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

    // cache the result
    leaderboardCache.userPoints = JSON.parse(JSON.stringify(userPoints));
    leaderboardCache.cacheDate = new Date();

    message.channel.send(`✅ Leaderboard cached at ${leaderboardCache.cacheDate.toLocaleString()}`);
  }
});

// enable bot by entering nodemon in the terminal
client.login(process.env.TOKEN)