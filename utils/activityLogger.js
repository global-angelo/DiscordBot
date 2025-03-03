const { EmbedBuilder } = require('discord.js');
const config = require('../config/config');

/**
 * Logs user activity to the activity log channel
 * @param {Guild} guild - The Discord guild
 * @param {User} user - The user who performed the activity
 * @param {string} title - The title of the activity
 * @param {string} description - The description of the activity
 * @param {string} color - The color of the embed in hex format
 * @param {Object} additionalFields - Additional fields to add to the embed
 * @returns {Promise<boolean>} - Whether the logging was successful
 */
async function logUserActivity(guild, user, title, description, color, additionalFields = {}) {
  try {
    // Get the activity log channel ID from config
    const activityLogChannelId = config.channels.activityLog;
    
    // Check if the activity log channel ID is valid
    if (!activityLogChannelId || activityLogChannelId === 'ACTIVITY_LOG_CHANNEL_ID') {
      console.log('Activity log channel ID is not configured properly');
      return false;
    }
    
    // Get the activity log channel
    const activityLogChannel = guild.channels.cache.get(activityLogChannelId);
    
    // If activity log channel doesn't exist, don't proceed
    if (!activityLogChannel) {
      console.log(`Activity log channel with ID ${activityLogChannelId} not found`);
      return false;
    }
    
    // Get the current time
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
    
    const dateString = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    
    // Create fields array with time and date
    const fields = [
      { name: 'Time', value: `**${timeString}**`, inline: true },
      { name: 'Date', value: `**${dateString}**`, inline: true }
    ];
    
    // Add additional fields if provided
    for (const [name, value] of Object.entries(additionalFields)) {
      fields.push({ name, value, inline: false });
    }
    
    // Create the embed
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .addFields(fields)
      .setAuthor({ 
        name: user.tag, 
        iconURL: user.displayAvatarURL() 
      })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setFooter({ 
        text: 'F9 Global Discord Bot | Activity Tracking', 
        iconURL: guild.client.user.displayAvatarURL() 
      })
      .setTimestamp();
    
    // Log where we're sending the embed
    console.log(`Logging user activity to channel: ${activityLogChannel.name} (${activityLogChannel.id})`);
    
    // Send the embed to the activity log channel
    await activityLogChannel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.error('Error logging user activity:', error);
    return false;
  }
}

/**
 * Logs command usage to the activity log channel
 * @param {Interaction} interaction - The interaction that triggered the command
 * @param {string} commandName - The name of the command
 * @param {Object} options - The options provided to the command
 * @returns {Promise<boolean>} - Whether the logging was successful
 */
async function logCommandUsage(interaction, commandName, options = {}) {
  try {
    const { guild, user } = interaction;
    
    // Format options for display
    let optionsText = '';
    if (Object.keys(options).length > 0) {
      optionsText = Object.entries(options)
        .map(([key, value]) => `• **${key}**: ${value}`)
        .join('\n');
    } else {
      optionsText = '• *No options provided*';
    }
    
    // Create additional fields
    const additionalFields = {
      'Command': `\`/${commandName}\``,
      'Options': optionsText,
      'Channel': `<#${interaction.channelId}>`
    };
    
    // Log the command usage
    return await logUserActivity(
      guild,
      user,
      '🤖 COMMAND USED',
      `# ${user} used a command`,
      '#9C27B0', // Purple
      additionalFields
    );
  } catch (error) {
    console.error('Error logging command usage:', error);
    return false;
  }
}

module.exports = {
  logUserActivity,
  logCommandUsage
}; 