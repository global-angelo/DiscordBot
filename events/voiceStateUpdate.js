const { Events, PermissionFlagsBits } = require('discord.js');
const { logUserActivity } = require('../utils/activityLogger');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    try {
      // Get the member and guild
      const member = newState.member;
      const guild = newState.guild;
      
      // Skip bot users
      if (member.user.bot) return;
      
      // Find the "In Meeting" role
      const inMeetingRole = guild.roles.cache.find(role => role.name === 'In Meeting');
      if (!inMeetingRole) {
        console.log(`"In Meeting" role not found in guild ${guild.name}`);
        return;
      }
      
      // Check if bot has permission to manage roles
      const botMember = guild.members.cache.get(guild.client.user.id);
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        console.log(`Bot doesn't have permission to manage roles in guild ${guild.name}`);
        return;
      }
      
      // Check if the bot's role is higher than the "In Meeting" role
      if (botMember.roles.highest.position <= inMeetingRole.position) {
        console.log(`Bot's highest role is not high enough to manage "In Meeting" role in guild ${guild.name}`);
        return;
      }
      
      // User joined a voice channel
      if (!oldState.channelId && newState.channelId) {
        const channel = newState.channel;
        
        // Log voice activity
        const logResult = await logUserActivity(
          guild,
          member.user,
          '🎙️ VOICE CHANNEL JOINED',
          `# ${member.user} joined voice channel`,
          '#2196F3', // Blue
          { 'Channel': channel.name }
        );
  
        console.log(`${member.user.tag} joined voice channel ${channel.name}`);
        if (logResult) {
          console.log(`Logged voice join activity for ${member.user.tag} to activity log channel`);
        }
        
        // Try to manage roles if bot has permission
        try {
          // Find the roles by name
          const workingRole = guild.roles.cache.find(role => role.name === 'Working');
          const inMeetingRole = guild.roles.cache.find(role => role.name === 'In Meeting');
          
          // Check if bot has permission to manage roles
          const botMember = guild.members.me;
          if (botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            // If they have the Working role, keep it but add In Meeting
            if (inMeetingRole && member.roles.cache.has(workingRole?.id)) {
              await member.roles.add(inMeetingRole.id);
            } 
            // If they don't have Working role, just add In Meeting
            else if (inMeetingRole) {
              await member.roles.add(inMeetingRole.id);
            }
          }
        } catch (roleError) {
          console.error('Error managing roles for voice join:', roleError);
        }
      }
      
      // User left a voice channel
      else if (oldState.channelId && !newState.channelId) {
        const channel = oldState.channel;
        
        // Log voice activity
        const logResult = await logUserActivity(
          guild,
          member.user,
          '🔇 VOICE CHANNEL LEFT',
          `# ${member.user} left voice channel`,
          '#9E9E9E', // Gray
          { 'Channel': channel.name }
        );
        
        console.log(`${member.user.tag} left voice channel`);
        if (logResult) {
          console.log(`Logged voice leave activity for ${member.user.tag} to activity log channel`);
        }
        
        // Try to manage roles if bot has permission
        try {
          // Find the roles by name
          const workingRole = guild.roles.cache.find(role => role.name === 'Working');
          const inMeetingRole = guild.roles.cache.find(role => role.name === 'In Meeting');
          
          // Check if bot has permission to manage roles
          const botMember = guild.members.me;
          if (botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            // Remove the In Meeting role if they have it
            if (inMeetingRole && member.roles.cache.has(inMeetingRole.id)) {
              await member.roles.remove(inMeetingRole.id);
            }
          }
        } catch (roleError) {
          console.error('Error managing roles for voice leave:', roleError);
        }
      }
      
      // User switched voice channels
      else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        console.log(`${member.user.tag} switched from voice channel ${oldState.channel.name} to ${newState.channel.name}`);
        
        // No need to change roles as they're still in a voice channel
        // But we can record the activity and send an embed
        try {
          // Log voice channel switch
          const logResult = await logUserActivity(
            guild,
            member.user,
            '🔄 SWITCHED VOICE CHANNELS',
            `# ${member.user} switched voice channels`,
            '#FFC107', // Amber color
            { 
              'From Channel': `**${oldState.channel.name}**`,
              'To Channel': `**${newState.channel.name}**`
            }
          );
          
          if (logResult) {
            console.log(`Logged voice channel switch for ${member.user.tag} to activity log channel`);
          }
        } catch (error) {
          console.error(`Error recording voice channel switch for ${member.user.tag}:`, error);
        }
      }
      
    } catch (error) {
      console.error('Error handling voice state update:', error);
    }
  },
}; 