const { SlashCommandBuilder } = require('discord.js');
const { generateUserActivityReport } = require('../utils/activityReporter');
const { splitMessage } = require('../utils/messageHelper');
const { logUserActivity } = require('../utils/activityLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Generate an activity report for a user on a specific date')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to generate a report for')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('The date to generate the report for (e.g., "March 4", "yesterday", "today")')
        .setRequired(true)),
  
  async execute(interaction) {
    try {
      // Defer the reply to give more time for processing
      await interaction.deferReply();
      
      // Get the options
      const targetUser = interaction.options.getUser('user');
      const dateStr = interaction.options.getString('date');
      
      // Log the activity
      await logUserActivity(
        interaction.guild,
        interaction.user,
        '📊 ACTIVITY REPORT',
        `# ${interaction.user} requested an activity report`,
        '#2196F3', // Blue
        {
          'Target User': targetUser.username,
          'Date': dateStr,
          'Channel': `<#${interaction.channel.id}>`
        }
      );
      
      // Generate the report
      await interaction.editReply(`Generating activity report for ${targetUser.username} on ${dateStr}... This may take a moment.`);
      
      const report = await generateUserActivityReport(
        targetUser,
        dateStr,
        interaction.user.username
      );
      
      // Split the response if needed
      const responseParts = splitMessage(report);
      
      // Send the first part as the reply to the interaction
      await interaction.editReply(responseParts[0]);
      
      // Send any additional parts as follow-up messages
      for (let i = 1; i < responseParts.length; i++) {
        await interaction.channel.send(responseParts[i]);
      }
    } catch (error) {
      console.error('Error executing /report command:', error);
      
      if (interaction.deferred) {
        await interaction.editReply("I'm sorry, I encountered an error while generating the report. Please try again later.");
      } else {
        await interaction.reply({
          content: "I'm sorry, I encountered an error while generating the report. Please try again later.",
          ephemeral: true
        });
      }
    }
  },
}; 