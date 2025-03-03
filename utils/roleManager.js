const { PermissionFlagsBits } = require('discord.js');
const { getActiveSession } = require('./dynamoDbManager');

// Role definitions with colors and position in hierarchy
const roleDefinitions = {
  working: {
    name: 'Working',
    color: '#4CAF50', // Green
    position: 3, // Higher number = higher in hierarchy
    permissions: []
  },
  inMeeting: {
    name: 'In Meeting',
    color: '#2196F3', // Blue
    position: 4,
    permissions: []
  },
  onBreak: {
    name: 'On Break',
    color: '#FFC107', // Amber
    position: 2,
    permissions: []
  },
  notAvailable: {
    name: 'Not Available',
    color: '#9E9E9E', // Gray
    position: 1,
    permissions: []
  }
};

/**
 * Ensures all required roles exist in the guild with correct colors and positions
 * @param {Guild} guild - Discord.js Guild object
 * @returns {Object} Map of role keys to role IDs
 */
async function setupRoles(guild) {
  console.log('Setting up roles for guild:', guild.name);
  
  const roleMap = {};
  
  // Sort role definitions by position to ensure correct hierarchy
  const sortedRoles = Object.entries(roleDefinitions).sort((a, b) => 
    b[1].position - a[1].position
  );
  
  // Create or update roles
  for (const [key, definition] of sortedRoles) {
    try {
      let role = guild.roles.cache.find(r => r.name === definition.name);
      
      if (!role) {
        console.log(`Creating role: ${definition.name}`);
        role = await guild.roles.create({
          name: definition.name,
          color: definition.color,
          reason: 'F9 Global Discord Bot role setup',
          permissions: definition.permissions
        });
      } else {
        console.log(`Updating role: ${definition.name}`);
        await role.edit({
          color: definition.color,
          permissions: definition.permissions
        });
      }
      
      // Store role ID in map
      roleMap[key] = role.id;
    } catch (error) {
      console.error(`Error creating/updating role ${definition.name}:`, error);
    }
  }
  
  // Set role positions to establish hierarchy
  try {
    await updateRolePositions(guild, roleMap);
  } catch (error) {
    console.error('Error updating role positions:', error);
  }
  
  return roleMap;
}

/**
 * Updates role positions to establish proper hierarchy
 * @param {Guild} guild - Discord.js Guild object
 * @param {Object} roleMap - Map of role keys to role IDs
 */
async function updateRolePositions(guild, roleMap) {
  const positions = {};
  let highestPosition = 0;
  
  // Find the highest position among existing roles (below the bot's role)
  const botMember = guild.members.cache.get(guild.client.user.id);
  const botRole = botMember.roles.highest;
  
  // We'll position our roles below the bot's highest role
  highestPosition = botRole.position - 1;
  
  // Set positions for each role based on their defined hierarchy
  for (const [key, roleId] of Object.entries(roleMap)) {
    if (!roleId) continue; // Skip if role creation failed
    
    const role = guild.roles.cache.get(roleId);
    if (!role) continue; // Skip if role doesn't exist
    
    const definition = roleDefinitions[key];
    
    // Calculate position based on hierarchy (higher number = higher position)
    // We subtract from highestPosition to ensure all roles are below the bot's role
    positions[roleId] = highestPosition - (4 - definition.position);
  }
  
  // Update role positions
  try {
    await guild.roles.setPositions(positions);
    console.log('Role positions updated successfully');
  } catch (error) {
    console.error('Error updating role positions:', error);
  }
}

/**
 * Gets the role map for a guild, creating roles if needed
 * @param {Guild} guild - Discord.js Guild object
 * @returns {Object} Map of role keys to role objects
 */
async function getRoleMap(guild) {
  const roleMap = {};
  
  for (const [key, definition] of Object.entries(roleDefinitions)) {
    const role = guild.roles.cache.find(r => r.name === definition.name);
    if (role) {
      roleMap[key] = role;
    }
  }
  
  // If any roles are missing, set up all roles
  if (Object.keys(roleMap).length !== Object.keys(roleDefinitions).length) {
    try {
      const roleIds = await setupRoles(guild);
      
      // Convert IDs to role objects
      for (const [key, id] of Object.entries(roleIds)) {
        if (id) { // Only add if ID exists (role creation might have failed)
          const role = guild.roles.cache.get(id);
          if (role) {
            roleMap[key] = role;
          }
        }
      }
    } catch (error) {
      console.error('Error setting up roles:', error);
    }
  }
  
  return roleMap;
}

/**
 * Synchronizes user roles with their database status
 * @param {Guild} guild - Discord.js Guild object
 * @param {string} userId - Discord user ID
 * @returns {Promise<boolean>} - Whether synchronization was successful
 */
async function synchronizeUserRoles(guild, userId) {
  try {
    // Get the member
    const member = await guild.members.fetch(userId);
    if (!member) {
      console.log(`Member ${userId} not found in guild ${guild.name}`);
      return false;
    }
    
    // Get the role map
    const roleMap = await getRoleMap(guild);
    
    // Get user's active session from database
    const activeSession = await getActiveSession(userId);
    
    // Determine which roles the user should have
    const shouldHaveWorkingRole = activeSession && activeSession.Status === 'Working';
    const shouldHaveBreakRole = activeSession && activeSession.Status === 'Break';
    
    // Check current roles
    const hasWorkingRole = member.roles.cache.has(roleMap.working.id);
    const hasBreakRole = member.roles.cache.has(roleMap.onBreak.id);
    
    // Synchronize roles
    if (shouldHaveWorkingRole && !hasWorkingRole) {
      await member.roles.add(roleMap.working);
      console.log(`Added Working role to ${member.user.tag} during synchronization`);
    } else if (!shouldHaveWorkingRole && hasWorkingRole) {
      await member.roles.remove(roleMap.working);
      console.log(`Removed Working role from ${member.user.tag} during synchronization`);
    }
    
    if (shouldHaveBreakRole && !hasBreakRole) {
      await member.roles.add(roleMap.onBreak);
      console.log(`Added On Break role to ${member.user.tag} during synchronization`);
    } else if (!shouldHaveBreakRole && hasBreakRole) {
      await member.roles.remove(roleMap.onBreak);
      console.log(`Removed On Break role from ${member.user.tag} during synchronization`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error synchronizing roles for user ${userId}:`, error);
    return false;
  }
}

/**
 * Synchronizes all active users' roles with their database status
 * @param {Guild} guild - Discord.js Guild object
 * @returns {Promise<number>} - Number of users synchronized
 */
async function synchronizeAllUserRoles(guild) {
  try {
    console.log(`Starting role synchronization for guild: ${guild.name}`);
    
    // Get all members with either Working or On Break role
    const roleMap = await getRoleMap(guild);
    const workingMembers = guild.members.cache.filter(member => 
      member.roles.cache.has(roleMap.working.id) || 
      member.roles.cache.has(roleMap.onBreak.id)
    );
    
    let syncCount = 0;
    
    // Synchronize each member
    for (const [userId, member] of workingMembers) {
      const success = await synchronizeUserRoles(guild, userId);
      if (success) syncCount++;
    }
    
    console.log(`Synchronized roles for ${syncCount} users in guild: ${guild.name}`);
    return syncCount;
  } catch (error) {
    console.error(`Error synchronizing all user roles in guild ${guild.name}:`, error);
    return 0;
  }
}

module.exports = {
  setupRoles,
  getRoleMap,
  roleDefinitions,
  synchronizeUserRoles,
  synchronizeAllUserRoles
}; 