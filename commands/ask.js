const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { generateAiResponse, splitMessage, truncateMessage } = require('../utils/claudeHelper');
const { logUserActivity } = require('../utils/activityLogger');
const { 
  addMessage, 
  getConversation, 
  initializeConversation,
  clearConversation
} = require('../utils/conversationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask Ferret9 a question (powered by Claude 3.7 Sonnet)')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('The question or message for the AI')
        .setRequired(false))
    .addAttachmentOption(option =>
      option.setName('image')
        .setDescription('An image to analyze (optional)')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('reset')
        .setDescription('Reset the conversation history (optional)')
        .setRequired(false)),
  
  async execute(interaction) {
    try {
      // Defer the reply to give more time for the AI to respond
      await interaction.deferReply();
      
      // Get the question from the command options
      const question = interaction.options.getString('question') || '';
      const imageAttachment = interaction.options.getAttachment('image');
      const shouldReset = interaction.options.getBoolean('reset') || false;
      
      // Check if this is the special channel that requires direct replies
      const isSpecialChannel = interaction.channel.id === '1346800900630642740';
      
      // Check if reset option is selected
      if (shouldReset) {
        initializeConversation(interaction.channel.id, interaction.client.user.username);
        if (!question && !imageAttachment) {
          return interaction.editReply('Conversation has been reset. You can start a new conversation now.');
        }
      }
      
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
      
      // Get or initialize conversation history
      let conversationHistory = getConversation(interaction.channel.id);
      if (conversationHistory.length === 0) {
        initializeConversation(interaction.channel.id, interaction.client.user.username);
        conversationHistory = getConversation(interaction.channel.id);
      }
      
      // Add user message to conversation history
      addMessage(
        interaction.channel.id, 
        'user', 
        question || "What do you see in this image?", 
        interaction.user.username
      );
      
      // Generate AI response with conversation history
      const aiResponse = await generateAiResponse(
        question || "What do you see in this image?", // Default prompt if only image is provided
        interaction.user.username,
        interaction.client.user.username,
        imageUrls,
        isSpecialChannel ? [] : getConversation(interaction.channel.id) // Don't use conversation history for special channel
      );
      
      // Ensure the response is within Discord's character limit
      const safeResponse = truncateMessage(aiResponse);
      
      // Add AI response to conversation history (truncated response)
      addMessage(interaction.channel.id, 'assistant', safeResponse);
      
      try {
        // Send the response
        if (safeResponse.length <= 2000) {
          await interaction.editReply(safeResponse);
        } else {
          // Split the response into parts if it's too long for a single message
          const responseParts = splitMessage(safeResponse);
          
          // Send the first part as the reply to the interaction
          await interaction.editReply(responseParts[0]);
          
          // Send any additional parts as follow-up messages
          for (let i = 1; i < responseParts.length; i++) {
            await interaction.channel.send(responseParts[i]);
          }
        }
      } catch (error) {
        console.error('Error sending message:', error);
        
        // Check if the error is due to message length
        if (error.code === 50035) {
          try {
            // Try to send a truncated version
            const truncatedResponse = truncateMessage(safeResponse, 1500);
            await interaction.editReply(truncatedResponse);
          } catch (truncateError) {
            console.error('Error sending truncated message:', truncateError);
            await interaction.editReply("I apologize, but my response was too long for Discord. Please ask a more specific question.");
          }
        } else {
          await interaction.editReply("I apologize, but I encountered an error while sending my response. Please try again.");
        }
      }
    } catch (error) {
      console.error('Error executing /ask command:', error);
      
      // If we've already deferred, edit the reply
      if (interaction.deferred) {
        await interaction.editReply("I apologize, but I encountered an error while processing your request. Please try again.");
      } else {
        // Otherwise, reply normally
        await interaction.reply({
          content: "I apologize, but I encountered an error while processing your request. Please try again.",
          ephemeral: true
        });
      }
    }
  },
}; 