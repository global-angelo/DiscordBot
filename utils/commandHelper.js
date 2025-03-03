/**
 * Command Helper Utility
 * Provides guidance on available commands based on user status
 */

/**
 * Get available commands based on user status
 * @param {string} status - Current user status (Active, Break, etc.)
 * @returns {Object} Object containing command information
 */
function getAvailableCommands(status) {
  // Default commands available to all users
  const defaultCommands = [
    { name: '/start', description: 'Create your personal log channel' },
    { name: '/help', description: 'Show available commands' }
  ];

  // Commands for users who are signed in and active
  const activeCommands = [
    { name: '/time', description: 'Check your current work duration' },
    { name: '/update', description: 'Share what you\'re working on' },
    { name: '/break', description: 'Take a break from work' },
    { name: '/signout', description: 'End your work session' }
  ];

  // Commands for users who are on break
  const breakCommands = [
    { name: '/back', description: 'Return from your break' },
    { name: '/time', description: 'Check your current work and break duration' },
    { name: '/signout', description: 'End your work session' }
  ];

  // Return appropriate commands based on status
  switch(status) {
    case 'Active':
      return {
        title: '🟢 You are currently signed in',
        description: 'Here are the commands you can use:',
        commands: activeCommands
      };
    case 'Break':
      return {
        title: '☕ You are currently on break',
        description: 'Here are the commands you can use:',
        commands: breakCommands
      };
    case 'Inactive':
      return {
        title: '⚪ You are not signed in',
        description: 'Here are the commands you can use:',
        commands: [
          { name: '/signin', description: 'Start your work session' },
          ...defaultCommands
        ]
      };
    default:
      return {
        title: '❓ Command Guide',
        description: 'Here are the available commands:',
        commands: [
          { name: '/signin', description: 'Start your work session' },
          { name: '/signout', description: 'End your work session' },
          { name: '/break', description: 'Take a break from work' },
          { name: '/back', description: 'Return from your break' },
          { name: '/update', description: 'Share what you\'re working on' },
          { name: '/time', description: 'Check your current work duration' },
          ...defaultCommands
        ]
      };
  }
}

/**
 * Format command list as a string
 * @param {Array} commands - Array of command objects
 * @returns {string} Formatted string of commands
 */
function formatCommandList(commands) {
  return commands.map(cmd => `**${cmd.name}** - ${cmd.description}`).join('\n');
}

module.exports = {
  getAvailableCommands,
  formatCommandList
}; 