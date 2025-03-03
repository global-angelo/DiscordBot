const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('test')
    .setDescription('Run tests for bot functionality')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    try {
      // Check if interaction was already replied to or deferred
      if (interaction.replied || interaction.deferred) {
        console.log('Interaction already handled. Skipping.');
        return;
      }
      
      await interaction.deferReply({ ephemeral: true });
      
      let debugInfo = '# Bot Test Results\n\n';
      
      // Test 1: Check bot permissions
      debugInfo += '## 1. Bot Permissions\n';
      try {
        const botMember = interaction.guild.members.me;
        const permissions = botMember.permissions.toArray();
        
        debugInfo += `Bot has the following permissions:\n\`\`\`\n${permissions.join('\n')}\`\`\`\n\n`;
        
        // Check for critical permissions
        const criticalPermissions = [
          'ManageChannels',
          'ManageRoles',
          'ViewChannel',
          'SendMessages',
          'EmbedLinks'
        ];
        
        const missingPermissions = criticalPermissions.filter(perm => !permissions.includes(perm));
        
        if (missingPermissions.length > 0) {
          debugInfo += `⚠️ Missing critical permissions: ${missingPermissions.join(', ')}\n\n`;
        } else {
          debugInfo += `✅ All critical permissions are granted.\n\n`;
        }
      } catch (error) {
        debugInfo += `❌ Error checking permissions: ${error.message}\n\n`;
      }
      
      // Test 2: Check database connection
      debugInfo += '## 2. Database Connection\n';
      try {
        const { testDatabaseConnection } = require('../utils/dynamoDbManager');
        const result = await testDatabaseConnection();
        
        if (result.success) {
          debugInfo += `✅ Successfully connected to DynamoDB.\n`;
          debugInfo += `Tables: ${result.tables.join(', ')}\n\n`;
        } else {
          debugInfo += `❌ Failed to connect to DynamoDB: ${result.error}\n\n`;
        }
      } catch (error) {
        debugInfo += `❌ Error testing database connection: ${error.message}\n\n`;
      }
      
      // Test 3: Check channel creation
      debugInfo += '## 3. Channel Creation\n';
      try {
        // Create a test channel
        const testChannel = await interaction.guild.channels.create({
          name: 'bot-test-channel',
          reason: 'Testing bot channel creation'
        });
        
        debugInfo += `✅ Successfully created channel: ${testChannel.name}\n`;
        
        // Delete the test channel
        await testChannel.delete('Test complete');
        debugInfo += `Channel deleted successfully.\n\n`;
      } catch (error) {
        debugInfo += `❌ Error: ${error.message}\n`;
        if (error.code) debugInfo += `Error code: ${error.code}\n\n`;
      }
      
      // Test 4: Check role management
      debugInfo += '## 4. Role Management\n';
      try {
        // Create a test role
        const testRole = await interaction.guild.roles.create({
          name: 'bot-test-role',
          reason: 'Testing bot role creation'
        });
        
        debugInfo += `✅ Successfully created role: ${testRole.name}\n`;
        
        // Delete the test role
        await testRole.delete('Test complete');
        debugInfo += `Role deleted successfully.\n\n`;
      } catch (error) {
        debugInfo += `❌ Error: ${error.message}\n`;
        if (error.code) debugInfo += `Error code: ${error.code}\n\n`;
      }
      
      // Send the results
      await interaction.editReply({
        content: debugInfo,
        ephemeral: true
      });
      
    } catch (error) {
      console.error('Error executing test command:', error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: `Error running tests: ${error.message}`,
          ephemeral: true 
        });
      } else {
        await interaction.editReply({ 
          content: `Error running tests: ${error.message}`,
          ephemeral: true 
        });
      }
    }
  }
}; 