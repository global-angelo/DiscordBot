const { Events } = require('discord.js');
const { synchronizeAllUserRoles } = require('../utils/roleManager');
const cron = require('node-cron');
const config = require('../config/config');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log('Setting up role synchronization scheduler...');
    
    // Schedule role synchronization to run every hour
    cron.schedule('0 * * * *', async () => {
      console.log('Running scheduled role synchronization...');
      
      // For each guild the bot is in
      client.guilds.cache.forEach(async (guild) => {
        try {
          // Synchronize user roles with database status
          const syncCount = await synchronizeAllUserRoles(guild);
          console.log(`Synchronized roles for ${syncCount} users in guild: ${guild.name}`);
        } catch (error) {
          console.error(`Error during scheduled role synchronization for guild ${guild.name}:`, error);
        }
      });
    });
    
    console.log('Role synchronization scheduled to run every hour');
  },
}; 