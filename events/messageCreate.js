const { Events } = require('discord.js');
const { logUserActivity } = require('../utils/activityLogger');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Ignore messages from bots to prevent potential loops
    if (message.author.bot) return;
    
    // Check if the bot was mentioned
    if (message.mentions.has(message.client.user)) {
      try {
        // Log the bot mention to the activity log channel
        await logUserActivity(
          message.guild,
          message.author,
          '🔔 BOT MENTIONED',
          `# ${message.author} mentioned the bot`,
          '#FF5722', // Deep Orange
          {
            'Message': message.content.length > 1000 
              ? message.content.substring(0, 997) + '...' 
              : message.content,
            'Channel': `<#${message.channel.id}>`
          }
        );
        
        // Find the test-bot channel
        const testChannel = message.guild.channels.cache.find(
          channel => channel.name === 'test-bot' && channel.type === 0 // 0 is GUILD_TEXT
        );
        
        if (testChannel) {
          // Respond in the test-bot channel
          await testChannel.send(`Hello ${message.author}! I noticed you mentioned me in ${message.channel}.`);
        } else {
          // If test-bot channel doesn't exist, respond in the same channel
          await message.reply('Hello! I noticed you mentioned me.');
        }
      } catch (error) {
        console.error('Error responding to mention:', error);
      }
    }
  },
};
