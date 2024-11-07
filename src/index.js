require('dotenv').config()
const { Client, IntentsBitField, ActivityType, EmbedBuilder } = require('discord.js')

// inputs
const channelId = '1169317299237433475'; // channel to read
const startDate = new Date('2024-11-06T18:40:00-05:00'); // -5:00 for EST, start from this date

// initialize point tracking object
const userPoints = {};

// helper function to increment points
function incrementPoints(userId, type) {
  if (!userPoints[userId]) {
    userPoints[userId] = { sniper: 0, sniped: 0 };
  }
  userPoints[userId][type]++;
}

// helper function to calculate k/d ratio
function calculateKD(sniper, sniped) {
  if (sniped === 0) {
    return 'U'
  } else {
    kd = sniper/sniped;
    return kd.toFixed(2);
  }
}

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ]
})

client.on('ready', (c) => {
  console.log(`🟢 ${c.user.tag} online.`)

  client.user.setActivity({
    name: '📷 Always watching',
    type: ActivityType.Custom
  })
})

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
          value: 'Send an image and tag the sniped member *in the same message.* If the tag and image are *not* in the same message, it will *not* be counted! If this happens, *delete then resend* the corrected version.'
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
    const notice = await message.channel.send('🟡  Please wait...');

    const args = message.content.split(' '); // split command and arguments
    const sortType = args[1];

    const channel = await client.channels.fetch(channelId);

    // reset points each time the command is run
    Object.keys(userPoints).forEach(user => {
      userPoints[user].sniper = 0;
      userPoints[user].sniped = 0;
    });

    let lastMessageId;
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

    // sort based on the command
    let sortedUsers;
    if (sortType === 'sniped') {
      sortedUsers = Object.entries(userPoints).sort(([, a], [, b]) => b.sniped - a.sniped);
    } else {
      sortedUsers = Object.entries(userPoints).sort(([, a], [, b]) => b.sniper - a.sniper);
    }

    if (sortType !== 'all') { sortedUsers = sortedUsers.slice(0, 10) }

    // generate the leaderboard table
    let leaderboard = '# Leaderboard\n';
    if (sortType === 'sniped') {leaderboard += '**Filter: Most sniped**\n\n'};
    if (sortType === 'teams' || sortType === 'team') {
      leaderboard += '**Filter: Teams**\n\n'
      leaderboard += '**Team  •  Sniper  •  Sniped  •  K/D**\n';
    } else {
      leaderboard += '**Member  •  Sniper  •  Sniped  •  K/D**\n';
    };
    
    const medals = ['🥇', '🥈', '🥉'];

    for (const [index, [userId, points]] of sortedUsers.entries()) {
      const user = await client.users.fetch(userId);
      const medal = medals[index] || `(${index+1}) `;
      leaderboard += `${medal} ${user.displayName}  •  ${points.sniper}  •  ${points.sniped}  •  ${calculateKD(points.sniper, points.sniped)}\n`;
    };

    message.channel.send(leaderboard);
    notice.delete();
  }
})

// enable bot by entering nodemon in the terminal
client.login(process.env.TOKEN)