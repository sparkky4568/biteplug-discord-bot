// Discord Slash Command Registration Script
// Run this once to register all slash commands with Discord

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');

const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_BOT_TOKEN;

if (!clientId || !guildId || !token) {
  console.error('❌ Missing required environment variables!');
  console.error('Required: DISCORD_CLIENT_ID, GUILD_ID, DISCORD_BOT_TOKEN');
  process.exit(1);
}

// Construct and prepare an instance of the REST module
const rest = new REST({ version: '10' }).setToken(token);

// Deploy commands
(async () => {
  try {
    console.log(`🔄 Started registering ${commands.length} slash commands...`);

    // Register commands to specific guild (faster, instant updates)
    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log(`✅ Successfully registered ${data.length} slash commands!`);
    console.log('Commands registered:');
    data.forEach(cmd => {
      console.log(`  - /${cmd.name}: ${cmd.description}`);
    });

  } catch (error) {
    console.error('❌ Error registering slash commands:', error);

    if (error.code === 50001) {
      console.error('⚠️  Bot is missing access to the guild. Make sure the bot is in the server.');
    } else if (error.code === 10004) {
      console.error('⚠️  Invalid guild ID. Check your GUILD_ID environment variable.');
    } else if (error.code === 0) {
      console.error('⚠️  Invalid bot token. Check your DISCORD_BOT_TOKEN environment variable.');
    }
  }
})();
