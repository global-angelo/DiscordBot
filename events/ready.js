const { Events } = require('discord.js');
const { logUserActivity } = require('../utils/activityLogger');
const { loadUserChannelMappings } = require('../utils/channelManager');
const { synchronizeAllUserRoles } = require('../utils/roleManager');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    
    // For each guild the bot is in
    client.guilds.cache.forEach(async (guild) => {
      try {
        // Load user channel mappings from DynamoDB
        await loadUserChannelMappings(guild.id);
        console.log(`Loaded user channel mappings for guild: ${guild.name}`);
        
        // Synchronize user roles with database status
        await synchronizeAllUserRoles(guild);
        console.log(`Synchronized user roles for guild: ${guild.name}`);
        
        // Log bot startup to activity log channel
        await logUserActivity(
          guild,
          client.user,
          '🚀 BOT STARTED',
          `# ${client.user} is now online`,
          '#4CAF50', // Green
          {
            'Version': '1.0.0',
            'Guild': guild.name
          }
        );
        
        // Find the test-bot channel
        const testChannel = guild.channels.cache.find(
          channel => channel.name === 'test-bot' && channel.type === 0 // 0 is GUILD_TEXT
        );
        
        if (testChannel) {
          await testChannel.send('Ready nako. 321 Lets go.');
        } else {
          console.log(`No test-bot channel found in guild: ${guild.name}`);
        }
      } catch (error) {
        console.error(`Error sending ready message to guild ${guild.name}:`, error);
      }
    });
  },
}; 