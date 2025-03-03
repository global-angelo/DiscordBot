require('dotenv').config();
const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Create a new client instance with only the Guilds intent
// To use additional intents, you need to enable them in the Discord Developer Portal:
// 1. Go to https://discord.com/developers/applications
// 2. Select your application
// 3. Go to the "Bot" tab
// 4. Scroll down to "Privileged Gateway Intents"
// 5. Enable the intents you need (SERVER MEMBERS INTENT, MESSAGE CONTENT INTENT)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,     // Requires SERVER MEMBERS INTENT to be enabled in Discord Developer Portal
    GatewayIntentBits.GuildMessages,    // For message events
    GatewayIntentBits.MessageContent,   // Requires MESSAGE CONTENT INTENT to be enabled in Discord Developer Portal
    GatewayIntentBits.GuildVoiceStates  // For voice channel events
  ],
});

// Initialize commands collection
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log(`Found ${commandFiles.length} command files to load:`);
for (const file of commandFiles) {
  console.log(`Loading command file: ${file}`);
  const filePath = path.join(commandsPath, file);
  
  try {
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`Successfully registered command: ${command.data.name}`);
    } else {
      console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
  } catch (error) {
    console.error(`[ERROR] Failed to load command ${file}:`, error);
  }
}

// Log all registered commands
console.log('Registered commands:');
client.commands.forEach((command, name) => {
  console.log(`- ${name}`);
});

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

console.log(`Found ${eventFiles.length} event files to load:`);
for (const file of eventFiles) {
  console.log(`Loading event file: ${file}`);
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Log in to Discord with your client's token
client.login(process.env.BOT_TOKEN); 