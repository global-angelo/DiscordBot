require('dotenv').config();
const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');

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

// Initialize Discord Player with optimized settings
const player = new Player(client, {
  ytdlOptions: {
    quality: 'highestaudio',
    highWaterMark: 1 << 25, // 32MB buffer (helps prevent stuttering)
    requestOptions: {
      maxRedirects: 10, // Increase redirects for better reliability
    },
  },
  connectionTimeout: 30000, // 30 seconds (default is 20s)
  disableHistory: false, // Enable history for better tracking
  smoothVolume: true, // For smoother volume transitions
});

// Set up comprehensive player events for better error handling and logging
player.events.on('error', (queue, error) => {
  console.error(`[Player Error] Queue ${queue.guild.name}:`, error.message);
});

player.events.on('playerError', (queue, error) => {
  console.error(`[Player Error] Queue ${queue.guild.name}:`, error.message);
  
  // Try to recover from errors by skipping the problematic track
  try {
    if (queue && queue.isPlaying()) {
      queue.node.skip();
      console.log(`[Player Recovery] Attempting to skip problematic track and continue playback.`);
    }
  } catch (skipError) {
    console.error('[Player Recovery] Failed to skip problematic track:', skipError.message);
  }
});

player.events.on('playerSkip', (queue, track) => {
  console.log(`[Player Skip] Track "${track.title}" skipped due to an issue.`);
});

player.events.on('audioTrackAdd', (queue, track) => {
  console.log(`[Player] Track "${track.title}" added to queue.`);
});

player.events.on('disconnect', (queue) => {
  console.log(`[Player] Disconnected from voice channel in ${queue.guild.name}.`);
});

player.events.on('emptyChannel', (queue) => {
  console.log(`[Player] Voice channel became empty in ${queue.guild.name}.`);
});

player.events.on('emptyQueue', (queue) => {
  console.log(`[Player] Queue ended in ${queue.guild.name}.`);
});

player.events.on('connectionCreate', (queue) => {
  console.log(`[Player] Connected to voice channel in ${queue.guild.name}.`);
});

player.events.on('connectionError', (queue, error) => {
  console.error(`[Player] Connection error in ${queue.guild.name}:`, error.message);
});

player.events.on('debug', (message) => {
  // Uncomment this if you need more detailed debug information
  // console.log(`[Player Debug] ${message}`);
});

// Enhanced voice state tracking
client.on('voiceStateUpdate', (oldState, newState) => {
  const queue = player.nodes.get(newState.guild.id);
  
  // If there's no queue or the bot isn't playing, we don't need to do anything
  if (!queue || !queue.isPlaying()) return;
  
  // Check if the bot got disconnected forcefully
  if (oldState.member.id === client.user.id && oldState.channelId && !newState.channelId) {
    console.log(`[Voice] Bot was forcefully disconnected from voice channel in ${newState.guild.name}`);
    // Clean up the queue to prevent issues
    queue.delete();
  }
});

// Initialize player extractors when client is ready
client.once('ready', async () => {
  console.log('Loading Discord Player extractors...');
  try {
    // Use loadMulti instead of loadDefault as required by the current discord-player version
    await player.extractors.loadMulti(DefaultExtractors);
    console.log('Discord Player extractors loaded successfully!');
  } catch (error) {
    console.error('Failed to load Discord Player extractors:', error);
  }
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

// Login to Discord with your client's token
client.login(process.env.BOT_TOKEN); 