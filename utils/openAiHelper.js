const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Split a message into multiple parts to fit within Discord's character limit
 * @param {string} message - The message to split
 * @param {number} maxLength - Maximum allowed length per part (default: 1950 to leave room for part indicators)
 * @returns {Array<string>} - Array of message parts
 */
function splitMessage(message, maxLength = 1950) {
  if (!message) {
    return [''];
  }
  
  // If message is already within limits, return it as a single part
  if (message.length <= maxLength) {
    return [message];
  }

  const parts = [];
  let remainingText = message;
  
  while (remainingText.length > 0) {
    if (remainingText.length <= maxLength) {
      // Add the last part and exit
      parts.push(remainingText);
      break;
    }
    
    // Try to find a good breaking point (end of a paragraph or sentence)
    let breakPoint = remainingText.lastIndexOf('\n\n', maxLength);
    
    if (breakPoint > maxLength * 0.75) {
      // Break at paragraph
      parts.push(remainingText.substring(0, breakPoint));
      remainingText = remainingText.substring(breakPoint + 2); // +2 to skip the newlines
      continue;
    }
    
    breakPoint = remainingText.lastIndexOf('. ', maxLength);
    if (breakPoint > maxLength * 0.75) {
      // Break at sentence
      parts.push(remainingText.substring(0, breakPoint + 1)); // +1 to include the period
      remainingText = remainingText.substring(breakPoint + 2); // +2 to skip the period and space
      continue;
    }
    
    // If no good breaking point, just cut at the max length
    breakPoint = remainingText.lastIndexOf(' ', maxLength);
    if (breakPoint > maxLength * 0.5) {
      // Break at word
      parts.push(remainingText.substring(0, breakPoint));
      remainingText = remainingText.substring(breakPoint + 1);
    } else {
      // Hard break if no good word boundary
      parts.push(remainingText.substring(0, maxLength));
      remainingText = remainingText.substring(maxLength);
    }
  }
  
  // Add part indicators if there are multiple parts
  if (parts.length > 1) {
    return parts.map((part, index) => `[Part ${index + 1}/${parts.length}] ${part}`);
  }
  
  return parts;
}

/**
 * Generate a response using OpenAI's API
 * @param {string} prompt - The user's message/prompt
 * @param {string} username - The username of the person who sent the message
 * @param {string} botName - The name of the bot
 * @param {Array} imageUrls - Optional array of image URLs to process
 * @param {Array} conversationHistory - Optional conversation history
 * @returns {Promise<string>} - The AI-generated response
 */
async function generateAiResponse(prompt, username, botName = 'Ferret9', imageUrls = [], conversationHistory = []) {
  try {
    // Create a system message that defines the bot's personality and behavior
    const systemMessage = `You are ${botName}, an AI assistant for developers at F9 Global.

    PRIMARY ROLE: Help developers with coding questions, debugging, and technical explanations.
    
    TONE ADAPTABILITY:
    - Default to a professional, helpful tone for technical discussions
    - If the conversation becomes casual or playful, match that tone appropriately
    - Be willing to be humorous or goofy if the user initiates that style of interaction
    
    TECHNICAL CAPABILITIES:
    - Provide code examples, explanations, and debugging help
    - Analyze code for potential issues and suggest improvements
    - Explain technical concepts clearly with appropriate examples
    
    COMMUNICATION GUIDELINES:
    - Respond in English, but understand questions in other languages
    - Use Markdown for code formatting and structured responses
    - Keep responses under 3800 characters total (will be split into multiple messages if needed)
    - For image analysis, identify code, diagrams, or technical content
    - Be concise and prioritize the most important information
    
    CONVERSATION APPROACH:
    - Maintain context from previous messages
    - Ask clarifying questions when needed
    - Admit when you don't know something rather than guessing`;

    // Prepare messages array
    let messages = [];
    
    // If we have conversation history, use it
    if (conversationHistory && conversationHistory.length > 0) {
      messages = [...conversationHistory];
    } else {
      // Otherwise, just use the system message
      messages.push({ role: "system", content: systemMessage });
    }

    // If there are images, add image content to the current user message
    if (imageUrls && imageUrls.length > 0) {
      const content = [
        { type: "text", text: `${username}: ${prompt}` }
      ];
      
      // Add each image to the content array
      for (const imageUrl of imageUrls) {
        content.push({
          type: "image_url",
          image_url: { url: imageUrl }
        });
      }
      
      // Add the multimodal message
      messages.push({ role: "user", content });
    } else if (!conversationHistory.length || conversationHistory[conversationHistory.length - 1].role !== 'user') {
      // Only add a new user message if we don't have history or the last message wasn't from the user
      messages.push({ role: "user", content: `${username}: ${prompt}` });
    }

    // Use the latest GPT-4o model
    const model = "gpt-4o-2024-11-20";

    const response = await openai.chat.completions.create({
      model: model,
      messages: messages,
      max_tokens: 1500, // Increased to allow for longer responses that will be split
      temperature: 0.7, // Adjust for creativity vs determinism
    });

    // Get the generated text
    const responseText = response.choices[0].message.content.trim();
    
    // Return the full response (will be split later if needed)
    return responseText;
  } catch (error) {
    console.error('Error generating AI response:', error);
    return "I'm sorry, I encountered an error while processing your request. Please try again later.";
  }
}

module.exports = {
  generateAiResponse,
  splitMessage
}; 