const config = require('../config/config');
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { 
  storeUserChannelMapping, 
  getUserChannelMapping, 
  getAllUserChannelMappings 
} = require('./dynamoDbManager');

// In-memory cache for user channel mappings (for faster access)
const userChannelsCache = new Map();

/**
 * Store a user's channel mapping
 * @param {string} userId - The user's ID
 * @param {string} channelId - The channel ID
 * @param {string} guildId - The guild ID
 * @returns {Promise<boolean>} Success status
 */
async function storeUserChannel(userId, channelId, guildId) {
    // Update in-memory cache
    userChannelsCache.set(userId, channelId);
    
    // Store in DynamoDB for persistence
    return await storeUserChannelMapping(userId, channelId, guildId);
}

/**
 * Get a user's channel ID
 * @param {string} userId - The user's ID
 * @param {string} guildId - The guild ID
 * @returns {Promise<string|null>} The channel ID or null if not found
 */
async function getUserChannelId(userId, guildId) {
    // Check in-memory cache first
    if (userChannelsCache.has(userId)) {
        return userChannelsCache.get(userId);
    }
    
    // If not in cache, check DynamoDB
    const channelId = await getUserChannelMapping(userId, guildId);
    
    // Update cache if found
    if (channelId) {
        userChannelsCache.set(userId, channelId);
    }
    
    return channelId;
}

/**
 * Load all user channel mappings for a guild into memory
 * @param {string} guildId - The guild ID
 * @returns {Promise<void>}
 */
async function loadUserChannelMappings(guildId) {
    try {
        const mappings = await getAllUserChannelMappings(guildId);
        
        // Update cache with all mappings
        for (const [userId, channelId] of Object.entries(mappings)) {
            userChannelsCache.set(userId, channelId);
        }
        
        console.log(`Loaded ${Object.keys(mappings).length} user channel mappings into memory for guild ${guildId}`);
    } catch (error) {
        console.error('Error loading user channel mappings:', error);
    }
}

/**
 * Gets a channel by its configured type, or creates a fallback message
 * @param {Guild} guild - The Discord guild
 * @param {string} channelType - The type of channel from config (team, updates, activityLog)
 * @returns {Object} - { channel, fallbackMessage }
 */
function getConfiguredChannel(guild, channelType) {
  const channelId = config.channels[channelType];
  let channel = null;
  let fallbackMessage = '';
  
  if (channelId && channelId !== `${channelType.toUpperCase()}_CHANNEL_ID`) {
    channel = guild.channels.cache.get(channelId);
  }
  
  if (!channel) {
    const defaultNames = {
      team: 'team-chat',
      updates: 'status-updates',
      activityLog: 'activity-log'
    };
    
    channel = guild.channels.cache.find(
      c => c.name === defaultNames[channelType] && c.type === ChannelType.GuildText
    );
    
    if (!channel) {
      fallbackMessage = `Could not find ${channelType} channel. Please configure it using /config channel ${channelType} #channel-name`;
    }
  }
  
  return { channel, fallbackMessage };
}

/**
 * Gets or creates a personal log channel for a user
 * @param {Guild} guild - The Discord guild
 * @param {User} user - The user to get/create a channel for
 * @param {string} categoryId - The category ID to place the channel in
 * @returns {Promise<TextChannel|null>} The user's log channel or null if it couldn't be created
 */
async function getUserLogChannel(guild, user, categoryId) {
    try {
        // First check if we have a stored channel ID
        const storedChannelId = await getUserChannelId(user.id, guild.id);
        if (storedChannelId) {
            const existingChannel = guild.channels.cache.get(storedChannelId);
            if (existingChannel) {
                // Update permissions for existing channel to ensure privacy
                await updateChannelPermissions(existingChannel, guild, user);
                return existingChannel;
            }
        }

        // Get member for nickname
        const member = await guild.members.fetch(user.id);
        const displayName = member.nickname || user.username;
        const channelName = displayName.toLowerCase().replace(/[^a-z0-9]/g, '-');

        // Check if channel exists by name
        let userChannel = guild.channels.cache.find(
            c => c.name === channelName && c.type === ChannelType.GuildText
        );

        if (userChannel) {
            // Store the channel ID for future reference
            await storeUserChannel(user.id, userChannel.id, guild.id);
            
            // Update permissions for existing channel to ensure privacy
            await updateChannelPermissions(userChannel, guild, user);
            return userChannel;
        }

        // Create new channel
        userChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: categoryId,
            reason: `Personal log channel for ${displayName} (${user.tag})`,
            permissionOverwrites: [
                {
                    id: guild.id, // @everyone role
                    deny: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages
                    ]
                },
                {
                    id: user.id, // The user
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                },
                {
                    id: guild.members.me.id, // The bot
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageMessages
                    ]
                }
            ]
        });

        // Add permission overwrites for admin roles
        await addAdminPermissions(userChannel, guild);

        // Store the channel ID for future reference
        await storeUserChannel(user.id, userChannel.id, guild.id);
        
        return userChannel;
    } catch (error) {
        console.error('Error creating user log channel:', error);
        return null;
    }
}

/**
 * Updates permissions for an existing channel to ensure privacy
 * @param {TextChannel} channel - The channel to update
 * @param {Guild} guild - The Discord guild
 * @param {User} user - The user who owns the channel
 * @returns {Promise<void>}
 */
async function updateChannelPermissions(channel, guild, user) {
    try {
        // Set base permissions
        await channel.permissionOverwrites.set([
            {
                id: guild.id, // @everyone role
                deny: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages
                ]
            },
            {
                id: user.id, // The user
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            },
            {
                id: guild.members.me.id, // The bot
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageMessages
                ]
            }
        ]);

        // Add admin permissions
        await addAdminPermissions(channel, guild);
    } catch (error) {
        console.error('Error updating channel permissions:', error);
    }
}

/**
 * Adds admin role permissions to a channel
 * @param {TextChannel} channel - The channel to update
 * @param {Guild} guild - The Discord guild
 * @returns {Promise<void>}
 */
async function addAdminPermissions(channel, guild) {
    try {
        const adminRoles = guild.roles.cache.filter(role => 
            role.permissions.has(PermissionFlagsBits.Administrator) || 
            role.name === 'Admin' || 
            role.name === 'Manager'
        );

        for (const [_, role] of adminRoles) {
            await channel.permissionOverwrites.create(role, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });
        }
    } catch (error) {
        console.error('Error adding admin permissions:', error);
    }
}

/**
 * Sends a message to a configured channel, with fallback to the current channel
 * @param {Interaction|Message} source - The source interaction or message
 * @param {string} channelType - The type of channel from config
 * @param {string} content - The message content
 * @param {boolean} fallbackToSource - Whether to send to source channel if target not found
 * @returns {Promise<Message>} The sent message
 */
async function sendToChannel(source, channelType, content, fallbackToSource = true) {
  const guild = source.guild;
  const { channel, fallbackMessage } = getConfiguredChannel(guild, channelType);
  
  if (channel) {
    return await channel.send(content);
  } else if (fallbackToSource) {
    const fullContent = fallbackMessage ? `${fallbackMessage}\n\n${content}` : content;
    
    if (source.reply) {
      return await source.reply(fullContent);
    } else if (source.followUp) {
      return await source.followUp(fullContent);
    } else {
      return await source.reply(fullContent);
    }
  }
  
  return null;
}

/**
 * Updates all user channels to ensure they have the correct privacy settings
 * @param {Guild} guild - The Discord guild
 * @param {Object} userChannelsData - The user channels data mapping user IDs to channel IDs
 * @returns {Promise<Object>} Result statistics
 */
async function updateAllUserChannels(guild, userChannelsData) {
    const result = {
        updated: 0,
        notFound: 0,
        errors: 0
    };

    try {
        // Get all users with channels
        const userIds = Object.keys(userChannelsData);
        
        for (const userId of userIds) {
            const channelId = userChannelsData[userId];
            
            // Skip if no channel ID
            if (!channelId) {
                result.notFound++;
                continue;
            }
            
            // Get the channel
            const channel = guild.channels.cache.get(channelId);
            
            // Skip if channel not found
            if (!channel) {
                result.notFound++;
                continue;
            }
            
            try {
                // Get the user
                const user = await guild.client.users.fetch(userId);
                
                // Update the channel permissions
                await updateChannelPermissions(channel, guild, user);
                
                result.updated++;
            } catch (error) {
                console.error(`Error updating channel ${channelId} for user ${userId}:`, error);
                result.errors++;
            }
        }
    } catch (error) {
        console.error('Error in updateAllUserChannels:', error);
        result.errors++;
    }
    
    return result;
}

module.exports = {
    storeUserChannel,
    getUserChannelId,
    getUserLogChannel,
    getConfiguredChannel,
    sendToChannel,
    updateAllUserChannels,
    loadUserChannelMappings
}; 