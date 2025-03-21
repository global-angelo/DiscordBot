const { Events } = require('discord.js');
const { logUserActivity } = require('../utils/activityLogger');
const { generateUserActivityReport, scanTables } = require('../utils/activityReporter');
const { 
  addMessage, 
  getConversation, 
  initializeConversation 
} = require('../utils/conversationManager');
const { generateAiResponse, splitMessage, truncateMessage } = require('../utils/openAiHelper');
const { getAllActiveSessions } = require('../utils/dynamoDbManager');
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
        
        // Check for questions about who is working or signed in
        const workingPatterns = [
          /who.*\b(working|work|active|signed in|on duty|available)\b/i,
          /\b(working|signed in|active)\b.*who/i,
          /\b(who's|whos)\b.*\b(in|on|working)\b/i,
          /\b(active users|current workers)\b/i,
          /\b(show|list|tell).*\b(users|people|staff|team|workers)\b/i,
          /who.*\bsigned\b/i,
          /\bnobody\b.*\b(working|work|signed in)\b/i,
          /\bstatus\b/i,
          /who.*\bstatus\b/i
        ];
        
        const isAskingWhoIsWorking = workingPatterns.some(pattern => pattern.test(prompt));
        console.log(`Checking if message "${prompt}" is asking about active users: ${isAskingWhoIsWorking}`);
        
        if (isAskingWhoIsWorking) {
          // Show typing indicator
          await message.channel.sendTyping();
          
          console.log('User is asking about active users, fetching active sessions...');
          // Get all active sessions
          const activeSessions = await getAllActiveSessions();
          
          console.log(`Retrieved ${activeSessions.length} active sessions from database`);
          
          if (activeSessions.length === 0) {
            await message.reply("Nobody is currently signed in or working.");
            return;
          }
          
          // Create an embed to show active users
          const { EmbedBuilder } = require('discord.js');
          const activeUsersEmbed = new EmbedBuilder()
            .setColor('#4CAF50')
            .setTitle('👥 Currently Active Users')
            .setDescription(`There are **${activeSessions.length}** users currently signed in.`)
            .setTimestamp()
            .setFooter({ text: 'Ferret9 Bot', iconURL: message.client.user.displayAvatarURL() });
          
          // Group users by status
          const workingUsers = [];
          const onBreakUsers = [];
          
          const now = new Date();
          
          for (const session of activeSessions) {
            // Get the guild member to display their nickname if available
            let displayName = session.Username;
            try {
              const member = await message.guild.members.fetch(session.UserId);
              displayName = member.nickname || member.displayName || session.Username;
            } catch (error) {
              console.log(`Could not fetch member for user ID ${session.UserId}: ${error.message}`);
            }
            
            // Calculate duration
            const startTime = new Date(session.StartTime);
            const durationMinutes = Math.round((now - startTime) / 60000);
            const hours = Math.floor(durationMinutes / 60);
            const minutes = durationMinutes % 60;
            const durationText = hours > 0 
              ? `${hours}h ${minutes}m` 
              : `${minutes}m`;
            
            // Format the session info
            const sessionInfo = `**${displayName}** - Signed in for ${durationText}`;
            
            // Add to appropriate list
            if (session.Status === 'Working') {
              workingUsers.push(sessionInfo);
            } else if (session.Status === 'Break') {
              // For users on break, calculate break duration
              let breakText = '';
              if (session.LastBreakStart) {
                const breakStart = new Date(session.LastBreakStart);
                const breakMinutes = Math.round((now - breakStart) / 60000);
                breakText = ` (on break for ${breakMinutes}m)`;
              }
              onBreakUsers.push(`${sessionInfo}${breakText}`);
            }
          }
          
          // Add fields to the embed
          if (workingUsers.length > 0) {
            activeUsersEmbed.addFields({
              name: `🟢 Working (${workingUsers.length})`,
              value: workingUsers.join('\n') || 'None',
              inline: false
            });
          }
          
          if (onBreakUsers.length > 0) {
            activeUsersEmbed.addFields({
              name: `🟠 On Break (${onBreakUsers.length})`,
              value: onBreakUsers.join('\n') || 'None',
              inline: false
            });
          }
          
          // Send the embed
          await message.reply({ embeds: [activeUsersEmbed] });
          return;
        }
        
        // Check for special commands
        if (prompt.toLowerCase() === 'help') {
          await message.reply(
            "Here are the commands you can use:\n" +
            "- `help` - Show this help message\n" +
            "- `reset` - Reset our conversation\n" +
            "- `scan tables` - Scan DynamoDB tables and log the results\n" +
            "- `/report @user MM-DD-YYYY` - Generate an activity report for a user on a specific date (timestamps in Manila time / UTC+8)\n" +
            "  Example: `/report @username 03-05-2025`\n" +
            "\nYou can also just chat with me normally!"
          );
          return;
        }
        
        if (prompt.toLowerCase() === 'reset' || prompt.toLowerCase() === 'forget') {
          // Reset the conversation
          initializeConversation(message.channel.id, message.client.user.username);
          await message.reply("I've reset our conversation. What would you like to talk about?");
          return;
        }
        
        // Check for scan tables command
        if (prompt.toLowerCase() === 'scan tables') {
          await message.reply("Scanning DynamoDB tables... Check the console for detailed output.");
          
          try {
            await scanTables();
            await message.reply("Scan complete. Check the console for results.");
          } catch (error) {
            console.error('Error scanning tables:', error);
            await message.reply(`Error scanning tables: ${error.message}`);
          }
          
          return;
        }
        
        // Check for debug sessions command
        if (prompt.toLowerCase() === 'debug sessions' || prompt.toLowerCase() === 'check sessions') {
          await message.reply("Checking active sessions... This might take a moment.");
          
          try {
            console.log('Debugging sessions - requested by user');
            const activeSessions = await getAllActiveSessions();
            
            if (activeSessions.length === 0) {
              await message.reply("No active sessions found in the database.");
            } else {
              let debugInfo = `Found ${activeSessions.length} active sessions:\n\n`;
              
              for (let i = 0; i < Math.min(activeSessions.length, 10); i++) {
                const session = activeSessions[i];
                debugInfo += `**Session ${i+1}**\n`;
                debugInfo += `- **User**: ${session.Username || 'Unknown'} (${session.UserId})\n`;
                debugInfo += `- **Status**: ${session.Status}\n`;
                debugInfo += `- **Start Time**: ${session.StartTime}\n`;
                debugInfo += `- **End Time**: ${session.EndTime || 'Not ended'}\n`;
                debugInfo += `- **Work Duration**: ${session.TotalWorkDuration || 0} minutes\n\n`;
              }
              
              if (activeSessions.length > 10) {
                debugInfo += `...and ${activeSessions.length - 10} more sessions.`;
              }
              
              await message.reply(debugInfo);
            }
          } catch (error) {
            console.error('Error debugging sessions:', error);
            await message.reply(`Error checking sessions: ${error.message}`);
          }
          
          return;
        }
        
        // Check for report command
        const reportRegex = /^\/report\s+<@!?(\d+)>\s+(.+?)$/i;
        const reportMatch = prompt.match(reportRegex);
        
        console.log('Report command check:');
        console.log('- Prompt:', prompt);
        console.log('- Regex match result:', reportMatch);
        
        // Try an alternative regex if the first one didn't match
        let alternativeMatch = null;
        if (!reportMatch) {
            const altRegex = /^\/report\s+<@(\d+)>\s+(.+?)$/i;
            alternativeMatch = prompt.match(altRegex);
            console.log('- Alternative regex match result:', alternativeMatch);
            
            // Another alternative without the @ symbol
            if (!alternativeMatch) {
                const simpleRegex = /^\/report\s+(\d+)\s+(.+?)$/i;
                alternativeMatch = prompt.match(simpleRegex);
                console.log('- Simple regex match result:', alternativeMatch);
            }
        }
        
        if (reportMatch || alternativeMatch) {
            const match = reportMatch || alternativeMatch;
            // This is a report request
            const targetUserId = match[1]; // The user ID
            const dateStr = match[2]; // The date part
            
            console.log('- Extracted user ID:', targetUserId);
            console.log('- Extracted date:', dateStr);
            
            // Show typing indicator
            await message.channel.sendTyping();
            
            // Get the target user
            const targetUser = await message.client.users.fetch(targetUserId).catch(err => null);
            
            if (!targetUser) {
              await message.reply("I couldn't find that user. Please make sure you've mentioned a valid user.");
              return;
            }
            
            // Get the member object to access nickname
            const targetMember = await message.guild.members.fetch(targetUserId).catch(err => {
              console.error('Error fetching member:', err);
              return null;
            });
            
            // Log member information for debugging
            if (targetMember) {
              console.log('- Member found:', targetMember.id);
              console.log('- Username:', targetUser.username);
              console.log('- Display name:', targetMember.displayName);
              console.log('- Nickname:', targetMember.nickname);
            } else {
              console.log('- Member not found, using username:', targetUser.username);
            }
            
            // Use nickname if available, otherwise fall back to displayName, then username
            const displayName = targetMember ? 
                               (targetMember.nickname || targetMember.displayName) : 
                               targetUser.username;
            
            console.log('- Final display name used:', displayName);
            
            // Generate the report
            await message.reply(`Generating activity report for ${displayName} on ${dateStr}... This may take a moment.`);
            
            try {
              // Get the report
              const report = await generateUserActivityReport(targetUser, dateStr, message.author.username, displayName);
              
              console.log('\n=== AI RESPONSE RECEIVED ===');
              console.log(report);
              console.log('=== END OF AI RESPONSE ===\n');
              
              if (report) {
                // Create an embed for the report
                const { EmbedBuilder } = require('discord.js');
                const reportEmbed = new EmbedBuilder()
                  .setColor('#0099ff')
                  .setTitle(`Activity Report: ${displayName}`)
                  .setDescription(`Report for ${dateStr} (All timestamps in Manila Time / UTC+8)`)
                  .setThumbnail(targetUser.displayAvatarURL())
                  .setTimestamp()
                  .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() });
                
                // Split the report into sections based on markdown headers
                const sections = report.split(/\*\*\d+\.\s+[^*]+\*\*/).filter(section => section.trim().length > 0);
                
                // Get the header titles
                const headerMatches = report.match(/\*\*\d+\.\s+[^*]+\*\*/g) || [];
                
                // Process each section with its corresponding header
                headerMatches.forEach((header, index) => {
                  if (index < sections.length) {
                    const content = sections[index].trim();
                    
                    // Add the section as a field
                    reportEmbed.addFields({ 
                      name: header.replace(/\*\*/g, ''), 
                      value: content.length > 1024 ? content.substring(0, 1021) + '...' : content 
                    });
                  }
                });
                
                // If no sections were found or the report is too long, fall back to the original approach
                if (reportEmbed.fields.length === 0) {
                  // Try to extract the main sections manually
                  const totalWorkTimeMatch = report.match(/\*\*1\.\s+Total\s+Work\s+Time\*\*([\s\S]*?)(?=\*\*2\.|\*\*3\.|\*\*4\.|\*\*5\.|$)/i);
                  const keyActivitiesMatch = report.match(/\*\*2\.\s+Key\s+Activities\*\*([\s\S]*?)(?=\*\*3\.|\*\*4\.|\*\*5\.|$)/i);
                  const breaksMatch = report.match(/\*\*3\.\s+Breaks\s+or\s+Time\s+Off\*\*([\s\S]*?)(?=\*\*4\.|\*\*5\.|$)/i);
                  const productivityMatch = report.match(/\*\*4\.\s+Productivity\s+Assessment\*\*([\s\S]*?)(?=\*\*5\.|$)/i);
                  
                  if (totalWorkTimeMatch) {
                    reportEmbed.addFields({ 
                      name: '1. Total Work Time', 
                      value: totalWorkTimeMatch[1].trim().length > 1024 ? 
                        totalWorkTimeMatch[1].trim().substring(0, 1021) + '...' : 
                        totalWorkTimeMatch[1].trim() 
                    });
                  }
                  
                  if (keyActivitiesMatch) {
                    reportEmbed.addFields({ 
                      name: '2. Key Activities', 
                      value: keyActivitiesMatch[1].trim().length > 1024 ? 
                        keyActivitiesMatch[1].trim().substring(0, 1021) + '...' : 
                        keyActivitiesMatch[1].trim() 
                    });
                  }
                  
                  if (breaksMatch) {
                    reportEmbed.addFields({ 
                      name: '3. Breaks or Time Off', 
                      value: breaksMatch[1].trim().length > 1024 ? 
                        breaksMatch[1].trim().substring(0, 1021) + '...' : 
                        breaksMatch[1].trim() 
                    });
                  }
                  
                  if (productivityMatch) {
                    reportEmbed.addFields({ 
                      name: '4. Productivity Assessment', 
                      value: productivityMatch[1].trim().length > 1024 ? 
                        productivityMatch[1].trim().substring(0, 1021) + '...' : 
                        productivityMatch[1].trim() 
                    });
                  }
                  
                  // If still no fields, use the original chunking approach
                  if (reportEmbed.fields.length === 0) {
                    // Split the report into chunks of 1024 characters
                    const chunks = [];
                    for (let i = 0; i < report.length; i += 1024) {
                      chunks.push(report.substring(i, Math.min(i + 1024, report.length)));
                    }
                    
                    // Add each chunk as a field
                    chunks.forEach((chunk, index) => {
                      reportEmbed.addFields({ 
                        name: index === 0 ? 'Report' : `Continued (${index + 1}/${chunks.length})`, 
                        value: chunk 
                      });
                    });
                  }
                }
                
                await message.reply({ embeds: [reportEmbed] });
              } else {
                await message.reply(`No activity data found for ${displayName} on ${dateStr}.`);
              }
            } catch (error) {
              console.error('Error generating report:', error);
              await message.reply(`Error generating report: ${error.message}`);
            }
            
            return;
        }
        
        // If there's no actual message after removing the mention, provide a help message
        if (!prompt && message.attachments.size === 0) {
          await message.reply("Hello! I'm Ferret9, powered by Claude 3.7 Sonnet. You can ask me questions or chat with me by mentioning me followed by your message. You can also send images for me to analyze. Our conversation will maintain context until it's reset or expires after 30 minutes of inactivity.\n\nYou can also ask me to generate reports by using the format: `/report @user MM-DD-YYYY` (timestamps will be displayed in Manila time / UTC+8)\n\nOr scan the database tables with: `@Ferret9 scan tables`");
          return;
        }
        
        // Show typing indicator to indicate the bot is processing
        await message.channel.sendTyping();
        
        // Check if this is the special channel that requires direct replies
        const isSpecialChannel = message.channel.id === '1346800900630642740';
        
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
          isSpecialChannel ? [] : getConversation(message.channel.id) // Don't use conversation history for special channel
        );
        
        // Ensure the response is within Discord's character limit
        const safeResponse = truncateMessage(aiResponse);
        
        // Add AI response to conversation history (truncated response)
        addMessage(message.channel.id, 'assistant', safeResponse);
        
        try {
          // Send the response
          if (safeResponse.length <= 2000) {
            await message.reply(safeResponse);
          } else {
            // Split the response into parts if it's too long for a single message
            const responseParts = splitMessage(safeResponse);
            
            // Send each part as a separate message
            const replyToFirstMessage = await message.reply(responseParts[0]);
            
            // Send any additional parts as follow-up messages
            for (let i = 1; i < responseParts.length; i++) {
              await message.channel.send(responseParts[i]);
            }
          }
        } catch (error) {
          console.error('Error sending message:', error);
          
          // Check if the error is due to message length
          if (error.code === 50035) {
            try {
              // Try to send a truncated version
              const truncatedResponse = truncateMessage(safeResponse, 1500);
              await message.reply(truncatedResponse);
            } catch (truncateError) {
              console.error('Error sending truncated message:', truncateError);
              await message.reply("I apologize, but my response was too long for Discord. Please ask a more specific question.");
            }
          } else {
            await message.reply("I apologize, but I encountered an error while sending my response. Please try again.");
          }
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
            console.error('Error sending split messages:', splitError);
            await message.reply("I apologize, but I encountered an error while sending my response. Please try again with a more specific question.");
          }
        } else {
          await message.reply("I apologize, but I encountered an error while processing your request. Please try again.");
        }
      }
    }
  },
};
