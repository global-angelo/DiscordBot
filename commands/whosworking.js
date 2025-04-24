const { SlashCommandBuilder, EmbedBuilder, Collection } = require('discord.js');
const { getActiveSession } = require('../utils/dynamoDbManager');
const config = require('../config/config');

// Helper function to format duration with seconds (copied from time.js)
function formatDurationWithSeconds(totalSeconds) {
  if (totalSeconds < 0) totalSeconds = 0; // Ensure duration is not negative
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60); // Use floor to avoid fractional seconds

  let parts = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  // Always show seconds if duration is less than a minute or exactly 0
  if (hours === 0 && minutes === 0) {
     parts.push(`${seconds}s`);
  } else if (seconds > 0) {
     // Optionally show seconds if minutes/hours are present
     // parts.push(`${seconds}s`);
  }

  return parts.length > 0 ? parts.join(' ') : '0s';
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('whosworking')
    .setDescription('Lists users currently signed in and their work/break times.'),

  async execute(interaction) {
    try {
      // Check if interaction was already replied to or deferred
      if (interaction.replied || interaction.deferred) {
        console.log('Interaction already handled (whosworking). Skipping.');
        return;
      }

      await interaction.deferReply(); // Defer reply, make it public

      const guild = interaction.guild;
      if (!guild) {
          await interaction.editReply('❌ This command can only be used in a server.');
          return;
      }
      
      // Ensure roles are configured
      if (!config.roles || !config.roles.working || !config.roles.onBreak) {
          console.error('Error: Working or On Break roles not configured in config.js');
          await interaction.editReply('❌ Bot configuration error: Roles not set up.');
          return;
      }

      // Fetch all members to check roles
      await guild.members.fetch();

      // Filter members who have either the working or onBreak role
      const relevantMembers = guild.members.cache.filter(member => 
        !member.user.bot && // Exclude bots
        (member.roles.cache.has(config.roles.working) || member.roles.cache.has(config.roles.onBreak))
      );

      if (relevantMembers.size === 0) {
        await interaction.editReply('🍃 No users are currently signed in.');
        return;
      }

      const userStatuses = [];
      const now = new Date();

      // Use Promise.all to fetch sessions concurrently
      await Promise.all(relevantMembers.map(async (member) => {
        const session = await getActiveSession(member.id);
        
        if (session && session.Status !== 'SignedOut') {
            const startTime = new Date(session.StartTime);
            const totalSeconds = Math.floor((now - startTime) / 1000);

            let breakDurationSeconds = (session.BreakDuration || 0) * 60;
            let currentBreakSeconds = 0;
            let status = 'Working';
            let statusEmoji = '🟢';

            if (session.Status === 'Break') {
                status = 'On Break';
                statusEmoji = '🔴';
                if (session.LastBreakStart) {
                    const breakStartTime = new Date(session.LastBreakStart);
                    currentBreakSeconds = Math.floor((now - breakStartTime) / 1000);
                    breakDurationSeconds += currentBreakSeconds;
                }
            }

            const workDurationSeconds = totalSeconds - breakDurationSeconds;
            
            userStatuses.push({
                name: member.displayName || member.user.username,
                status: status,
                statusEmoji: statusEmoji,
                workTime: formatDurationWithSeconds(workDurationSeconds),
                breakTime: formatDurationWithSeconds(breakDurationSeconds),
                totalTime: formatDurationWithSeconds(totalSeconds)
            });
        }
      }));

      // Sort users alphabetically by name
      userStatuses.sort((a, b) => a.name.localeCompare(b.name));

      // --- Build the response --- \n      let description = `**${userStatuses.length} user(s) currently signed in:**\n\n`;

      if (userStatuses.length > 0) {
          userStatuses.forEach(user => {
              description += `${user.statusEmoji} **${user.name}** - ${user.status}\n`;
              description += `   - Work: \`${user.workTime}\` | Break: \`${user.breakTime}\` | Total: \`${user.totalTime}\`\n`;
          });
      } else {
          description = '🍃 No users found with active sessions.'; // Fallback if sessions were invalid
      }

      // Check if description exceeds limit, truncate if necessary
      const MAX_LENGTH = 4000; // Discord embed description limit is 4096
      if (description.length > MAX_LENGTH) {
          description = description.substring(0, MAX_LENGTH - 20) + '\n... (list truncated)';
      }

      const embed = new EmbedBuilder()
        .setColor('#0099ff') 
        .setTitle('Current User Status')
        .setDescription(description)
        .setFooter({ text: `As of ${now.toLocaleTimeString()}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error in whosworking command:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "❌ An error occurred while fetching user status.", ephemeral: true });
        } else {
            await interaction.editReply({ content: "❌ An error occurred while fetching user status." });
        }
      } catch (replyError) {
        console.error('Error sending error message for whosworking:', replyError);
      }
    }
  },
}; 