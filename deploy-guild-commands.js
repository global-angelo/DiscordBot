require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// Replace with your guild ID
const GUILD_ID = '880748516077600798';

const commands = [];
// Grab all the command files from the commands directory
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Commands to exclude from deployment
const excludedCommands = ['test.js', 'debug.js'];

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
  // Skip excluded commands
  if (excludedCommands.includes(file)) {
    console.log(`[INFO] Skipping excluded command: ${file}`);
    continue;
  }
  
  const filePath = path.join(commandsPath, file);
  console.log(`[DEBUG] Loading command file: ${file}`);
  try {
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
      console.log(`[INFO] Added command: ${command.data.name}`);
    } else {
      console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
  } catch (error) {
    console.error(`[ERROR] Failed to load command ${file}:`, error);
  }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.BOT_TOKEN);

// and deploy your commands!
(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands for guild ${GUILD_ID}.`);

    // The put method is used to fully refresh all commands in the guild
    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD_ID),
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands for guild ${GUILD_ID}.`);
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
  }
})(); 