const { EmbedBuilder } = require('discord.js');
const schedule = require('node-schedule');
const { getDailyReport } = require('../utils/dynamoDbManager');
const config = require('../config/config');

module.exports = {
  name: 'ready',
  once: false,
  execute(client) {
    console.log('Setting up daily report scheduler...');
    
    // Schedule the daily report job - 9:00 AM Manila time (UTC+8)
    scheduleDailyReport(client);
  }
};

/**
 * Schedule daily activity reports
 * @param {Client} client - Discord.js client
 */
function scheduleDailyReport(client) {
  // Daily report at 9:00 AM Manila time (UTC+8)
  // In cron: minute hour day-of-month month day-of-week
  const cronExpression = '0 9 * * *';
  console.log(`Scheduling daily report for 9:00 AM Manila time (cron: ${cronExpression})`);
  
  // Create a rule with Manila timezone (UTC+8)
  const rule = new schedule.RecurrenceRule();
  rule.hour = 9;
  rule.minute = 0;
  rule.tz = config.timezone || 'Asia/Manila';
  
  schedule.scheduleJob(rule, async function() {
    try {
      console.log(`Running daily report at ${new Date().toLocaleString('en-US', { timeZone: config.timezone || 'Asia/Manila' })}`);
      
      // Get yesterday's date in Manila time
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: config.timezone || 'Asia/Manila' }));
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      
      // Format the date for display
      const dateString = yesterday.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: config.timezone || 'Asia/Manila'
      });
      
      // Get the report data from DynamoDB
      const reportData = await getDailyReport(yesterday);
      
      // Send the report to all guilds
      for (const guild of client.guilds.cache.values()) {
        try {
          // Get the daily report channel
          const dailyReportChannelId = config.channels.dailyReport;
          const channel = guild.channels.cache.get(dailyReportChannelId);
          
          if (!channel) {
            console.warn(`Daily report channel not found in guild: ${guild.name}`);
            continue;
          }
          
          // Get the Intern role to identify interns
          const internRoleId = config.roles.intern;
          
          // Format all users' report content
          let reportContent = '';
          if (reportData.length === 0) {
            reportContent = 'No activity recorded for today.';
          } else {
            for (const user of reportData) {
              // Check if user is an intern
              const member = await guild.members.fetch(user.userId).catch(() => null);
              const isIntern = member && internRoleId && member.roles.cache.has(internRoleId);
              
              // Convert minutes to hours and minutes
              const hours = Math.floor(user.workMinutes / 60);
              const minutes = user.workMinutes % 60;
              
              // Format the time string
              const timeString = hours > 0 
                ? `${hours} hour${hours !== 1 ? 's' : ''}${minutes > 0 ? ` ${minutes} minute${minutes !== 1 ? 's' : ''}` : ''}`
                : `${minutes} minute${minutes !== 1 ? 's' : ''}`;
              
              reportContent += `### ${user.username}${isIntern ? ' 👨‍🎓 (Intern)' : ''}\n`;
              reportContent += `⏱️ Work Time: ${timeString}\n\n`;
              
              // Add work summaries if available
              if (user.sessions && user.sessions.length > 0) {
                reportContent += `📝 Work Summary:\n`;
                for (const session of user.sessions) {
                  if (session.workSummary) {
                    const startTime = new Date(session.startTime).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    });
                    reportContent += `**Session at ${startTime}:**\n${session.workSummary}\n\n`;
                  }
                }
              }
              reportContent += '---\n';
            }
          }
          
          // Create the daily report embed
          const dailyReportEmbed = new EmbedBuilder()
            .setColor('#00AAFF')
            .setTitle(`📊 Daily Activity Report - ${dateString}`)
            .setDescription(`Here's a summary of yesterday's activities:`)
            .addFields({ 
              name: 'Work Summary', 
              value: reportContent 
            })
            .setFooter({ 
              text: 'Ferret9 Bot - Daily Report', 
              iconURL: client.user.displayAvatarURL() 
            })
            .setTimestamp();
          
          // Send the report
          await channel.send({ embeds: [dailyReportEmbed] });
          
          console.log(`Sent daily report to ${guild.name}`);
        } catch (guildError) {
          console.error(`Error sending daily report in guild ${guild.name}:`, guildError);
        }
      }
    } catch (error) {
      console.error('Error in daily report scheduler:', error);
    }
  });
  
  console.log('Daily report scheduled successfully');
} 