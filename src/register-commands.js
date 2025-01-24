require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');

const commands = [
  {
    name: 'help',
    description: 'Get help on sniping and how this bot works.',
  },
  {
    name: 'rules',
    description: 'Show the rules for sniping.'
  },
  {
    name: 'leaderboard',
    description: 'Generate the current leaderboard.',
    options: [
      {
        name: 'filter',
        description: 'Sorting type (optional).',
        type: ApplicationCommandOptionType.String,
        choices: [
          {
            name: 'all',
            value: 'all',
          },
          {
            name: 'sniper',
            value: 'sniper',
          },
          {
            name: 'sniped',
            value: 'sniped',
          },
          {
            name: 'kd',
            value: 'kd',
          },
          {
            name: 'teams',
            value: 'teams',
          },
          {
            name: 'duos',
            value: 'duos',
          },
        ]
      }
    ],
  },
  {
    name: 'cache',
    description: 'Clear and restore memory.',
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...')
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    )
    console.log('Slash commands successfully registed.')
  } catch (error) {
    console.log(`Error: ${error}`)
  }
})();