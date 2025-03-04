const { Events } = require('discord.js');
const { logUserActivity } = require('../utils/activityLogger');
const { generateAiResponse } = require('../utils/openAiHelper');
const axios = require('axios');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Ignore messages from bots to prevent potential loops
    if (message.author.bot) return;
    
    // Check if the bot was mentioned
    if (message.mentions.has(message.client.user)) {
      try {
        // Log the bot mention to the activity log channel
        await logUserActivity(
          message.guild,
          message.author,
          '🔔 BOT MENTIONED',
          `# ${message.author} mentioned the bot`,
          '#FF5722', // Deep Orange
          {
            'Message': message.content.length > 1000 
              ? message.content.substring(0, 997) + '...' 
              : message.content,
            'Channel': `<#${message.channel.id}>`
          }
        );
        
        // Extract the actual message content without the mention
        const mentionRegex = new RegExp(`<@!?${message.client.user.id}>`, 'g');
        const prompt = message.content.replace(mentionRegex, '').trim();
        
        // If there's no actual message after removing the mention, provide a help message
        if (!prompt && message.attachments.size === 0) {
          await message.reply("Hello! I'm Ferret9. You can ask me questions or chat with me by mentioning me followed by your message. You can also send images for me to analyze.");
          return;
        }
        
        // Show typing indicator to indicate the bot is processing
        await message.channel.sendTyping();
        
        // Check for image attachments
        const imageUrls = [];
        if (message.attachments.size > 0) {
          message.attachments.forEach(attachment => {
            // Check if the attachment is an image
            if (attachment.contentType && attachment.contentType.startsWith('image/')) {
              imageUrls.push(attachment.url);
            }
          });
        }
        
        // Generate AI response with images if present
        const aiResponse = await generateAiResponse(
          prompt || "What do you see in this image?", // Default prompt if only image is sent
          message.author.username,
          message.client.user.username,
          imageUrls
        );
        
        // Reply with the AI-generated response
        await message.reply(aiResponse);
      } catch (error) {
        console.error('Error responding to mention:', error);
        await message.reply("I'm sorry, I encountered an error while processing your request. Please try again later.");
      }
    }
  },
};
