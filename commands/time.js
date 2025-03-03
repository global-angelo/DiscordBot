const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getCurrentWorkDuration, getActiveSession } = require('../utils/dynamoDbManager');
const config = require('../config/config');

// Helper function to format duration with seconds
function formatDurationWithSeconds(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  let result = '';
  
  if (hours > 0) {
    result += `${hours} hour${hours !== 1 ? 's' : ''} `;
  }
  
  if (minutes > 0 || hours > 0) {
    result += `${minutes} minute${minutes !== 1 ? 's' : ''} `;
  }
  
  result += `${seconds} second${seconds !== 1 ? 's' : ''}`;
  
  return result;
}

// Helper function to format duration (minutes only)
function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins} minute${mins !== 1 ? 's' : ''}`;
  } else if (mins === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    return `${hours} hour${hours !== 1 ? 's' : ''} and ${mins} minute${mins !== 1 ? 's' : ''}`;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('time')
    .setDescription('Check your current work duration'),
  
  async execute(interaction) {
    try {
// Check if interaction was already replied to or deferred
      if (interaction.replied || interaction.deferred) {
        console.log('Interaction already handled. Skipping.');
        return;
      }
      
      
      await interaction.deferReply({ ephemeral: true });

      const user = interaction.user;
      const guild = interaction.guild;
      
      // Get the member object to check roles
      const member = await guild.members.fetch(user.id);
      
      // Check if user has either working or onBreak role
      if (!member.roles.cache.has(config.roles.working) && !member.roles.cache.has(config.roles.onBreak)) {
        await interaction.editReply({
          content: "❌ You're not currently signed in. Use `/signin` to start a work session.",
          ephemeral: true
        });
        return;
      }
      
      // Get active session directly to access start time
      const session = await getActiveSession(user.id);
      
      if (!session) {
        await interaction.editReply({
          content: "❌ You don't have an active work session. Use `/signin` to start working.",
          ephemeral: true
        });
        return;
      }
      
      // Check if user is signed out
      if (session.Status === 'SignedOut') {
        await interaction.editReply({
          content: "❌ You're currently signed out. Use `/signin` to start a new work session.",
          ephemeral: true
        });
        return;
      }
      
      // Get current work duration from DynamoDB
      const durationInfo = await getCurrentWorkDuration(user.id);
      
      // Get status emoji
      let statusEmoji = '🟢';
      let statusText = 'Working';
      
      if (durationInfo.status === 'Break') {
        statusEmoji = '🔴';
        statusText = 'On Break';
      }
      
      // Calculate exact durations with seconds
      const startTime = new Date(session.StartTime);
      const now = new Date();
      const totalSeconds = Math.floor((now - startTime) / 1000);
      
      // Calculate break time
      let breakDurationMinutes = session.BreakDuration || 0;
      let breakDurationSeconds = breakDurationMinutes * 60;
      let currentBreakSeconds = 0;
      
      // If currently on break, add the current break duration
      if (durationInfo.status === 'Break' && session.LastBreakStart) {
        const breakStartTime = new Date(session.LastBreakStart);
        currentBreakSeconds = Math.floor((now - breakStartTime) / 1000);
        breakDurationSeconds += currentBreakSeconds;
      }
      
      const workDurationSeconds = totalSeconds - breakDurationSeconds;
      
      // Format durations with seconds for display
      const workDurationFormatted = formatDurationWithSeconds(workDurationSeconds);
      const breakDurationFormatted = formatDurationWithSeconds(breakDurationSeconds);
      const totalDurationFormatted = formatDurationWithSeconds(totalSeconds);
      
      // Additional break info if on break
      let breakInfo = '';
      if (durationInfo.status === 'Break' && session.LastBreakStart) {
        const breakStartTime = new Date(session.LastBreakStart);
        breakInfo = `\n\n**Current Break:** Started <t:${Math.floor(breakStartTime.getTime() / 1000)}:R>`;
      }
      
      // Create embed
      const timeEmbed = new EmbedBuilder()
        .setColor('#2196F3')
        .setTitle(`${statusEmoji} ${statusText}`)
        .setDescription(`# ${user}`)
        .addFields(
          {
            name: '⏱️ Duration',
            value: `Work: **${workDurationFormatted}** | Break: **${breakDurationFormatted}**`,
            inline: false
          },
          { 
            name: '📋 Status',
            value: `${statusEmoji} **${statusText}**${breakInfo}`
          },
          {
            name: '🕒 Session',
            value: `Started: <t:${Math.floor(startTime.getTime() / 1000)}:t> | Current: <t:${Math.floor(now.getTime() / 1000)}:t>`,
            inline: false
          }
        )
        .setAuthor({ 
          name: interaction.member.nickname || user.tag,
          iconURL: user.displayAvatarURL() 
        })
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setFooter({ 
          text: 'Ferret9 Bot', 
          iconURL: interaction.client.user.displayAvatarURL() 
        })
        .setTimestamp();

      // Send the embed
      await interaction.editReply({
        embeds: [timeEmbed],
        ephemeral: true
      });

    } catch (error) {
      console.error('Error in time command:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ An error occurred. Please try again.",
            ephemeral: true
          }).catch(err => console.error('Error replying to interaction:', err));
        } else if (interaction.deferred && !interaction.replied) {
          await interaction.editReply({
            content: "❌ An error occurred. Please try again."
          }).catch(err => console.error('Error editing reply:', err));
        }
      } catch (replyError) {
        console.error('Error sending error message:', replyError);
      }
    }
  },
}; 