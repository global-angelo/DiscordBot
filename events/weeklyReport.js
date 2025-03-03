const { EmbedBuilder } = require('discord.js');
const schedule = require('node-schedule');
const { getWeeklyReportByUser } = require('../utils/dynamoDbManager');
const config = require('../config/config');

module.exports = {
  name: 'ready',
  once: false,
  execute(client) {
    console.log('Setting up weekly report scheduler...');
    
    // Schedule the weekly report job - 9:00 AM Manila time (UTC+8) every Sunday
    scheduleWeeklyReport(client);
  }
};

/**
 * Schedule weekly activity reports
 * @param {Client} client - Discord.js client
 */
function scheduleWeeklyReport(client) {
  // Weekly report at 9:00 AM Manila time (UTC+8) every Sunday
  // In cron: minute hour day-of-month month day-of-week
  const cronExpression = '0 9 * * 0'; // Sunday at 9:00 AM (0 = Sunday in cron)
  console.log(`Scheduling weekly report for 9:00 AM Manila time every Sunday (cron: ${cronExpression})`);
  
  // Create a rule with Manila timezone (UTC+8)
  const rule = new schedule.RecurrenceRule();
  rule.hour = 9;
  rule.minute = 0;
  rule.dayOfWeek = 0; // Sunday (0 = Sunday in RecurrenceRule)
  rule.tz = config.timezone || 'Asia/Manila';
  
  schedule.scheduleJob(rule, async function() {
    try {
      console.log(`Running weekly report at ${new Date().toLocaleString('en-US', { timeZone: config.timezone || 'Asia/Manila' })}`);
      
      // Get date range for the current week (Monday to Sunday)
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: config.timezone || 'Asia/Manila' }));
      
      // Calculate this week's Monday and Sunday (today)
      const monday = new Date(now);
      monday.setDate(now.getDate() - now.getDay() + 1); // Go back to Monday of this week
      monday.setHours(0, 0, 0, 0);
      
      const sunday = new Date(now); // Today is Sunday
      sunday.setHours(23, 59, 59, 999);
      
      // Format the date range for display
      const startDateString = monday.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: config.timezone || 'Asia/Manila'
      });
      
      const endDateString = sunday.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: config.timezone || 'Asia/Manila'
      });
      
      // Get the report data from DynamoDB
      const reportData = await getWeeklyReportByUser(monday, sunday);
      
      // Get all guilds the bot is in
      for (const guild of client.guilds.cache.values()) {
        try {
          // Get the weekly report channel
          const weeklyReportChannelId = config.channels.weeklyReport;
          const channel = guild.channels.cache.get(weeklyReportChannelId);
          
          if (!channel) {
            console.warn(`Weekly report channel not found in guild: ${guild.name}`);
            continue;
          }
          
          // Get the Intern role to exclude those users
          const internRoleId = config.roles.intern;
          
          // Send a header message
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#4CAF50')
                .setTitle(`📊 Weekly Activity Report`)
                .setDescription(`**Period:** ${startDateString} to ${endDateString}\n\n*Note: This report excludes interns.*`)
                .setFooter({ 
                  text: 'Ferret9 Bot - Weekly Report', 
                  iconURL: client.user.displayAvatarURL() 
                })
                .setTimestamp()
            ]
          });
          
          // Process each user's data
          const userIds = Object.keys(reportData);
          
          if (userIds.length === 0) {
            await channel.send('No activity recorded for this week.');
          } else {
            // For each user, create a separate message
            let includedUsers = 0;
            
            for (const userId of userIds) {
              const userData = reportData[userId];
              
              // Skip users with the Intern role
              const member = await guild.members.fetch(userId).catch(() => null);
              if (member && internRoleId && member.roles.cache.has(internRoleId)) {
                console.log(`Skipping intern user: ${userData.username}`);
                continue;
              }
              
              // Format the user's daily work data
              let userContent = '';
              const days = Object.keys(userData.days).sort();
              
              for (const dayStr of days) {
                const dayData = userData.days[dayStr];
                const date = new Date(dayData.date);
                
                // Format the date
                const dayString = date.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  timeZone: config.timezone || 'Asia/Manila'
                });
                
                // Convert minutes to hours and minutes
                const hours = Math.floor(dayData.workMinutes / 60);
                const minutes = dayData.workMinutes % 60;
                
                // Format the time string
                const timeString = hours > 0 
                  ? `${hours} hour${hours !== 1 ? 's' : ''}${minutes > 0 ? ` ${minutes} minute${minutes !== 1 ? 's' : ''}` : ''}`
                  : `${minutes} minute${minutes !== 1 ? 's' : ''}`;
                
                userContent += `### ${dayString}\n`;
                userContent += `⏱️ Work Time: ${timeString}\n`;
                
                // Add break time if any
                if (dayData.breakMinutes > 0) {
                  userContent += `☕ Break Time: ${dayData.breakMinutes} minute${dayData.breakMinutes !== 1 ? 's' : ''}\n`;
                }
                
                // Add work summaries if available
                if (dayData.summaries && dayData.summaries.length > 0) {
                  userContent += `\n📝 Work Summary:\n`;
                  for (const summary of dayData.summaries) {
                    const startTime = new Date(summary.startTime).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                      timeZone: config.timezone || 'Asia/Manila'
                    });
                    userContent += `**Session at ${startTime}:**\n${summary.summary}\n\n`;
                  }
                }
                
                userContent += '---\n\n';
              }
              
              // Add total work and break time
              const totalHours = Math.floor(userData.totalWorkMinutes / 60);
              const totalMinutes = userData.totalWorkMinutes % 60;
              const totalTimeString = totalHours > 0 
                ? `${totalHours} hour${totalHours !== 1 ? 's' : ''}${totalMinutes > 0 ? ` ${totalMinutes} minute${totalMinutes !== 1 ? 's' : ''}` : ''}`
                : `${totalMinutes} minute${totalMinutes !== 1 ? 's' : ''}`;
              
              const totalBreakHours = Math.floor(userData.totalBreakMinutes / 60);
              const totalBreakMinutes = userData.totalBreakMinutes % 60;
              const totalBreakString = totalBreakHours > 0 
                ? `${totalBreakHours} hour${totalBreakHours !== 1 ? 's' : ''}${totalBreakMinutes > 0 ? ` ${totalBreakMinutes} minute${totalBreakMinutes !== 1 ? 's' : ''}` : ''}`
                : `${totalBreakMinutes} minute${totalBreakMinutes !== 1 ? 's' : ''}`;
              
              // Create user embed
              const userEmbed = new EmbedBuilder()
                .setColor('#2196F3')
                .setTitle(`📊 Weekly Report: ${userData.username}`)
                .setDescription(userContent)
                .addFields(
                  { 
                    name: '⏱️ Total Work Time', 
                    value: totalTimeString,
                    inline: true 
                  },
                  { 
                    name: '☕ Total Break Time', 
                    value: totalBreakString,
                    inline: true 
                  }
                )
                .setFooter({ 
                  text: 'Ferret9 Bot - Weekly Report', 
                  iconURL: client.user.displayAvatarURL() 
                });
              
              // Send the user's report
              await channel.send({ embeds: [userEmbed] });
              includedUsers++;
            }
            
            if (includedUsers === 0) {
              await channel.send('No non-intern activity recorded for this week.');
            }
          }
          
          console.log(`Sent weekly report to ${guild.name}`);
        } catch (guildError) {
          console.error(`Error sending weekly report in guild ${guild.name}:`, guildError);
        }
      }
    } catch (error) {
      console.error('Error in weekly report scheduler:', error);
    }
  });
  
  console.log('Weekly report scheduled successfully');
} 