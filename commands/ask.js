const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { generateAiResponse } = require('../utils/openAiHelper');
const { logUserActivity } = require('../utils/activityLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask Ferret9 a question')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('The question or message for the AI')
        .setRequired(false))
    .addAttachmentOption(option =>
      option.setName('image')
        .setDescription('An image to analyze (optional)')
        .setRequired(false)),
  
  async execute(interaction) {
    try {
      // Defer the reply to give more time for the AI to respond
      await interaction.deferReply();
      
      // Get the question from the command options
      const question = interaction.options.getString('question') || '';
      const imageAttachment = interaction.options.getAttachment('image');
      
      // Check if either question or image is provided
      if (!question && !imageAttachment) {
        return interaction.editReply('Please provide a question or an image to analyze.');
      }
      
      // Prepare image URLs array if an image is attached
      const imageUrls = [];
      if (imageAttachment && imageAttachment.contentType && imageAttachment.contentType.startsWith('image/')) {
        imageUrls.push(imageAttachment.url);
      }
      
      // Log the activity
      await logUserActivity(
        interaction.guild,
        interaction.user,
        imageUrls.length > 0 ? '🖼️ AI IMAGE ANALYSIS' : '❓ AI QUESTION',
        `# ${interaction.user} ${imageUrls.length > 0 ? 'asked the AI to analyze an image' : 'asked the AI a question'}`,
        '#9C27B0', // Purple
        {
          'Question': question.length > 1000 
            ? question.substring(0, 997) + '...' 
            : question || '(Image only)',
          'Channel': `<#${interaction.channel.id}>`
        }
      );
      
      // Generate AI response
      const aiResponse = await generateAiResponse(
        question || "What do you see in this image?", // Default prompt if only image is provided
        interaction.user.username,
        interaction.client.user.username,
        imageUrls
      );
      
      // Send the AI response
      await interaction.editReply(aiResponse);
    } catch (error) {
      console.error('Error executing /ask command:', error);
      
      // If we've already deferred, edit the reply
      if (interaction.deferred) {
        await interaction.editReply("I'm sorry, I encountered an error while processing your request. Please try again later.");
      } else {
        // Otherwise, reply normally
        await interaction.reply({
          content: "I'm sorry, I encountered an error while processing your request. Please try again later.",
          ephemeral: true
        });
      }
    }
  },
}; 