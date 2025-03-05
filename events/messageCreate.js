const { Events } = require('discord.js');
const { logUserActivity } = require('../utils/activityLogger');
const { generateAiResponse, splitMessage } = require('../utils/openAiHelper');
const { 
  addMessage, 
  getConversation, 
  initializeConversation 
} = require('../utils/conversationManager');
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
        
        // Check for special commands
        if (prompt.toLowerCase() === 'reset' || prompt.toLowerCase() === 'forget') {
          // Reset the conversation
          initializeConversation(message.channel.id, message.client.user.username);
          await message.reply("I've reset our conversation. What would you like to talk about?");
          return;
        }
        
        // If there's no actual message after removing the mention, provide a help message
        if (!prompt && message.attachments.size === 0) {
          await message.reply("Hello! I'm Ferret9, powered by GPT-4o. You can ask me questions or chat with me by mentioning me followed by your message. You can also send images for me to analyze. Our conversation will maintain context until it's reset or expires after 30 minutes of inactivity.");
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
        
        // Get or initialize conversation history
        let conversationHistory = getConversation(message.channel.id);
        if (conversationHistory.length === 0) {
          initializeConversation(message.channel.id, message.client.user.username);
          conversationHistory = getConversation(message.channel.id);
        }
        
        // Add user message to conversation history
        addMessage(message.channel.id, 'user', prompt, message.author.username);
        
        // Generate AI response with conversation history
        const aiResponse = await generateAiResponse(
          prompt || "What do you see in this image?", // Default prompt if only image is sent
          message.author.username,
          message.client.user.username,
          imageUrls,
          getConversation(message.channel.id) // Get updated conversation history
        );
        
        // Split the response into parts if it's too long for a single message
        const responseParts = splitMessage(aiResponse);
        
        // Add AI response to conversation history (full response)
        addMessage(message.channel.id, 'assistant', aiResponse);
        
        // Send each part as a separate message
        const replyToFirstMessage = await message.reply(responseParts[0]);
        
        // Send any additional parts as follow-up messages
        for (let i = 1; i < responseParts.length; i++) {
          await message.channel.send(responseParts[i]);
        }
      } catch (error) {
        console.error('Error responding to mention:', error);
        
        // Check if the error is related to message length
        if (error.code === 50035 && error.message.includes('2000 or fewer in length')) {
          // Try to send a split version of the response
          try {
            const errorMessage = "I apologize, but my response was too long for Discord. Here it is split into multiple messages:";
            await message.reply(errorMessage);
            
            const responseParts = splitMessage(error.requestBody?.json?.content || "My response was too long. Please ask for a more specific or concise answer.");
            for (const part of responseParts) {
              await message.channel.send(part);
            }
          } catch (splitError) {
            await message.reply("I apologize, but my response was too long for Discord. Please ask for a more specific or concise answer.");
          }
        } else {
          await message.reply("I'm sorry, I encountered an error while processing your request. Please try again later.");
        }
      }
    }
  },
};
