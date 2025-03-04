const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a response using OpenAI's API
 * @param {string} prompt - The user's message/prompt
 * @param {string} username - The username of the person who sent the message
 * @param {string} botName - The name of the bot
 * @param {Array} imageUrls - Optional array of image URLs to process
 * @returns {Promise<string>} - The AI-generated response
 */
async function generateAiResponse(prompt, username, botName = 'Ferret9', imageUrls = []) {
  try {
    // Create a system message that defines the bot's personality and behavior
    const systemMessage = `You are ${botName}, a helpful and friendly Discord bot. 
    You provide concise, accurate, and helpful responses. 
    Be conversational but professional. 
    If you don't know something, admit it rather than making up information.
    Keep responses under 2000 characters to fit in Discord messages.
    Format your responses in a clean, readable way using Markdown when appropriate.
    When analyzing images, be detailed but concise.`;

    // Prepare messages array
    const messages = [
      { role: "system", content: systemMessage },
    ];

    // If there are images, use the vision model and add image content
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
      
      messages.push({ role: "user", content });
    } else {
      // Text-only message
      messages.push({ role: "user", content: `${username}: ${prompt}` });
    }

    // Choose the appropriate model based on whether images are included
    const model = imageUrls && imageUrls.length > 0 ? "gpt-4-vision-preview" : "gpt-3.5-turbo";

    const response = await openai.chat.completions.create({
      model: model,
      messages: messages,
      max_tokens: 500, // Adjust as needed
      temperature: 0.7, // Adjust for creativity vs determinism
    });

    // Return the generated text
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating AI response:', error);
    return "I'm sorry, I encountered an error while processing your request. Please try again later.";
  }
}

module.exports = {
  generateAiResponse
}; 