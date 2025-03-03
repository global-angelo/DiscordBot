const { Events } = require('discord.js');
const { logCommandUsage } = require('../utils/activityLogger');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Debug logging
    console.log(`Received interaction: ${interaction.type} from ${interaction.user.tag}`);
    
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      console.log(`Received command: ${interaction.commandName}`);
      
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
              content: `Command not found: ${interaction.commandName}`, 
              ephemeral: true 
            }).catch(error => {
              console.error('Error replying to unknown command:', error);
            });
          }
        } catch (error) {
          console.error('Error replying to unknown command:', error);
        }
        return;
      }

      try {
        // Check if interaction was already replied to or deferred
        if (interaction.replied || interaction.deferred) {
          console.log(`Interaction for ${interaction.commandName} already handled. Skipping command execution.`);
          return;
        }
        
        // Collect command options for logging
        const options = {};
        if (interaction.options) {
          // Get all options from the interaction
          for (const option of interaction.options.data) {
            if (option.value !== undefined) {
              // For simple options
              options[option.name] = option.value;
            } else if (option.options) {
              // For subcommand options
              for (const subOption of option.options) {
                options[subOption.name] = subOption.value;
              }
            }
          }
        }
        
        // Execute the command
        await command.execute(interaction);
        
        // Log the command usage after successful execution
        await logCommandUsage(interaction, interaction.commandName, options).catch(error => {
          console.error('Error logging command usage:', error);
        });
        
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}`);
        console.error(error);
        
        // If we haven't replied to the interaction yet, send an error message
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
              content: 'There was an error while executing this command!', 
              ephemeral: true 
            }).catch(replyError => {
              console.error('Error sending error reply:', replyError);
            });
          } else if (interaction.deferred && !interaction.replied) {
            await interaction.editReply({
              content: 'There was an error while executing this command!'
            }).catch(editError => {
              console.error('Error editing reply:', editError);
            });
          }
        } catch (replyError) {
          // If we can't reply, just log the error
          console.error('Error sending error message:', replyError);
        }
      }
    }
  },
}; 