const { EmbedBuilder } = require('discord.js');
const schedule = require('node-schedule');
const config = require('../config/config');

module.exports = {
  name: 'ready',
  once: false,
  execute(client) {
    console.log('Setting up update reminder scheduler...');
    
    // Schedule the reminder job
    scheduleUpdateReminders(client);
  }
};

/**
 * Schedule update reminders for users with the specified role
 * @param {Client} client - Discord.js client
 */
function scheduleUpdateReminders(client) {
  // Get reminder settings from config
  const reminderTimes = config.reminderTimes || [];
  const reminderRoleId = config.updateReminders?.roleId;
  const reminderChannelId = config.updateReminders?.channelId || config.channels.updates;
  
  // Check if we have reminder times configured
  if (!reminderTimes || reminderTimes.length === 0) {
    console.warn('No reminder times configured. Reminders will not be sent.');
    return;
  }
  
  // Log the configured reminder times
  console.log('Configuring reminders for the following times:');
  reminderTimes.forEach(time => {
    console.log(`- ${time.hour}:${time.minute.toString().padStart(2, '0')}`);
  });
  
  // Schedule a job for each reminder time
  reminderTimes.forEach(time => {
    const cronExpression = `${time.minute} ${time.hour} * * *`;
    console.log(`Scheduling reminder for ${time.hour}:${time.minute.toString().padStart(2, '0')} (cron: ${cronExpression})`);
    
    schedule.scheduleJob(cronExpression, async function() {
      try {
        console.log(`Running scheduled reminder at ${new Date().toLocaleTimeString()}`);
        
        // Get all guilds the bot is in
        for (const guild of client.guilds.cache.values()) {
          try {
            // Find the role in this guild - either use the configured ID or find the "Working" role
            let role;
            if (reminderRoleId && reminderRoleId !== 'WORKING_ROLE_ID') {
              role = guild.roles.cache.get(reminderRoleId);
            } else {
              // If no specific role ID is configured, use the "Working" role
              role = guild.roles.cache.find(r => r.name === 'Working');
            }
            
            if (!role) {
              console.warn(`Update reminder role not found in guild: ${guild.name}`);
              continue;
            }
            
            // Find the channel to send reminders to
            let channel;
            if (reminderChannelId && reminderChannelId !== 'PING_CHANNEL_ID') {
              channel = guild.channels.cache.get(reminderChannelId);
            } else {
              // If no specific channel ID is configured, use the "ping" channel
              channel = guild.channels.cache.find(ch => ch.name === 'ping');
            }
            
            if (!channel) {
              console.warn(`Update reminder channel not found in guild: ${guild.name}`);
              continue;
            }
            
            // Get the next scheduled reminder time
            const now = new Date();
            let nextReminderTime = null;
            
            // Find the next reminder time
            for (const reminderTime of reminderTimes) {
              const nextTime = new Date();
              nextTime.setHours(reminderTime.hour, reminderTime.minute, 0, 0);
              
              // If the time has already passed today, set it for tomorrow
              if (nextTime <= now) {
                nextTime.setDate(nextTime.getDate() + 1);
              }
              
              // If this is the first time we've found, or it's earlier than our current next time
              if (nextReminderTime === null || nextTime < nextReminderTime) {
                nextReminderTime = nextTime;
              }
            }
            
            // Format the next reminder time
            const nextTimeString = nextReminderTime.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: true 
            });
            
            // Create the reminder embed
            const reminderEmbed = new EmbedBuilder()
              .setColor('#FF9900')
              .setTitle('⏰ Update Reminder')
              .setDescription(`Hey <@&${role.id}>! It's time for your regular update.\n\nPlease use the \`/update\` command to share your progress.`)
              .addFields(
                { name: 'How to provide an update', value: 'Use `/update message:Your update message here`' },
                { name: 'Why updates matter', value: 'Regular updates help the team stay informed about your progress and identify any blockers early.' }
              )
              .setFooter({ 
                text: `Next reminder at ${nextTimeString}`, 
                iconURL: client.user.displayAvatarURL() 
              })
              .setTimestamp();
            
            // Send the reminder
            await channel.send({ 
              content: `<@&${role.id}>`,
              embeds: [reminderEmbed] 
            });
            
            console.log(`Sent update reminder to ${role.name} in ${guild.name}`);
          } catch (guildError) {
            console.error(`Error sending reminder in guild ${guild.name}:`, guildError);
          }
        }
      } catch (error) {
        console.error('Error in update reminder scheduler:', error);
      }
    });
  });
  
  console.log(`Update reminders scheduled at ${reminderTimes.length} specific times`);
} 