const { Events, EmbedBuilder } = require('discord.js');
const { logUserActivity } = require('../utils/activityLogger');
const { generateUserActivityReport, scanTables } = require('../utils/activityReporter');
const { 
  addMessage, 
  getConversation, 
  initializeConversation 
} = require('../utils/conversationManager');
const { generateAiResponse, splitMessage, truncateMessage } = require('../utils/openAiHelper');
const { getAllActiveSessions, getActiveSession } = require('../utils/dynamoDbManager');
const config = require('../config/config');
const axios = require('axios');

// Helper function to format duration (copied from whosworking.js)
function formatDurationWithSeconds(totalSeconds) {
  if (totalSeconds < 0) totalSeconds = 0; // Ensure duration is not negative
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60); // Use floor to avoid fractional seconds

  let parts = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  // Only show seconds if duration is less than a minute
  if (hours === 0 && minutes === 0) {
     parts.push(`${seconds}s`);
  } 
  // Optionally show seconds if needed, but default is h/m for brevity
  // else if (seconds > 0) { parts.push(`${seconds}s`); }

  return parts.length > 0 ? parts.join(' ') : '0s';
}

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
          // Get all active sessions using the existing function
          // Note: getAllActiveSessions might not contain LastBreakStart or detailed BreakDuration needed for precise calculation.
          // If precision matching /whosworking is needed, we might need to fetch each session individually using getActiveSession.
          // For now, we'll use the data from getAllActiveSessions as available.
          const activeSessions = await getAllActiveSessions(); 
          
          console.log(`Retrieved ${activeSessions.length} active sessions from database`);
          
          if (activeSessions.length === 0) {
            await message.reply("🍃 Nobody is currently signed in or working.");
            return;
          }

          const userStatuses = [];
          const now = new Date();

          // Process sessions to calculate detailed times
          await Promise.all(activeSessions.map(async (session) => {
            // Fetch member data for display name
            let member = null;
            try {
              member = await message.guild.members.fetch(session.UserId);
            } catch (error) { /* User might not be in the guild anymore */ }

            const displayName = member?.displayName || member?.user?.username || session.Username || 'Unknown User';
            
            // Calculate times based on session data
            const startTime = new Date(session.StartTime);
            const totalSeconds = Math.floor((now - startTime) / 1000);

            // Use BreakDuration (assuming minutes from DB) and LastBreakStart if available
            let breakDurationSeconds = (session.BreakDuration || 0) * 60; 
            let currentBreakSeconds = 0;
            let status = 'Working';
            let statusEmoji = '🟢';

            if (session.Status === 'Break') {
                status = 'On Break';
                statusEmoji = '🔴';
                // Calculate current break duration IF LastBreakStart is available
                if (session.LastBreakStart) { 
                    try {
                        const breakStartTime = new Date(session.LastBreakStart);
                        if (!isNaN(breakStartTime)) { // Check if date is valid
                           currentBreakSeconds = Math.floor((now - breakStartTime) / 1000);
                           breakDurationSeconds += currentBreakSeconds;
                        } else {
                            console.warn(`Invalid LastBreakStart date for user ${session.UserId}: ${session.LastBreakStart}`);
                        }
                    } catch(dateError) {
                        console.error(`Error parsing LastBreakStart date for user ${session.UserId}: ${session.LastBreakStart}`, dateError);
                    }
                }
            }

            const workDurationSeconds = totalSeconds - breakDurationSeconds;
            
            userStatuses.push({
                name: displayName,
                status: status,
                statusEmoji: statusEmoji,
                workTime: formatDurationWithSeconds(workDurationSeconds),
                breakTime: formatDurationWithSeconds(breakDurationSeconds)
            });
          }));

          // Sort users alphabetically by name
          userStatuses.sort((a, b) => a.name.localeCompare(b.name));

          // --- Build the response embed --- 
          let description = `**${userStatuses.length} user(s) currently signed in:**\n\n`;
          let workingCount = 0;
          let breakCount = 0;
          let userCounter = 1; // Initialize counter for numbering

          if (userStatuses.length > 0) {
              userStatuses.forEach(user => {
                  // Added numbering (userCounter.)
                  description += `${userCounter}. **${user.name}** - ${user.status}\n`;
                  description += `   Work: \`${user.workTime}\` | Break: \`${user.breakTime}\`\n\n`; 
                  if(user.status === 'Working') workingCount++;
                  if(user.status === 'On Break') breakCount++;
                  userCounter++; // Increment counter
              });
          } else {
              description = '🍃 No users found with active sessions.'; // Fallback if sessions were invalid
          }

          // Check if description exceeds limit, truncate if necessary
          const MAX_LENGTH = 4000; 
          if (description.length > MAX_LENGTH) {
              description = description.substring(0, MAX_LENGTH - 20) + '\n... (list truncated)';
          }
          
          // Removed emojis from the title
          const title = `Current User Status (${workingCount} Working | ${breakCount} On Break)`;

          const embed = new EmbedBuilder()
            .setColor('#0099ff') 
            .setTitle(title)
            .setDescription(description)
            .setFooter({ text: `As of ${now.toLocaleTimeString()}` })
            .setTimestamp();
          
          // Send the embed as a reply
          await message.reply({ embeds: [embed] });
          return; // Stop further processing in messageCreate
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
