/**
 * Conversation Manager
 * Manages conversation history for each channel to maintain context across messages
 */

// Store conversations by channelId
// Format: { channelId: [{ role: 'user|assistant|system', content: 'message' }] }
const conversations = new Map();

// Maximum number of messages to keep in history per channel
const MAX_HISTORY_LENGTH = 10;

// Maximum age of conversation in milliseconds (30 minutes)
const MAX_CONVERSATION_AGE = 30 * 60 * 1000;

// Track last activity time for each channel
const lastActivityTime = new Map();

/**
 * Add a message to the conversation history
 * @param {string} channelId - The channel ID
 * @param {string} role - The role (user, assistant, system)
 * @param {string} content - The message content
 * @param {string} username - The username (for user messages)
 */
function addMessage(channelId, role, content, username = null) {
  // Initialize conversation array if it doesn't exist
  if (!conversations.has(channelId)) {
    conversations.set(channelId, []);
  }

  // Format the message
  const message = { 
    role, 
    content: role === 'user' && username ? `${username}: ${content}` : content 
  };

  // Add message to history
  const history = conversations.get(channelId);
  history.push(message);

  // Trim history if it exceeds maximum length
  if (history.length > MAX_HISTORY_LENGTH) {
    // Always keep the system message if it exists
    const systemMessage = history.find(msg => msg.role === 'system');
    
    // Remove oldest messages but keep system message
    const newHistory = history.slice(history.length - MAX_HISTORY_LENGTH);
    
    // If we had a system message but it was removed, add it back at the beginning
    if (systemMessage && !newHistory.some(msg => msg.role === 'system')) {
      newHistory.unshift(systemMessage);
    }
    
    conversations.set(channelId, newHistory);
  }

  // Update last activity time
  lastActivityTime.set(channelId, Date.now());
}

/**
 * Get the conversation history for a channel
 * @param {string} channelId - The channel ID
 * @returns {Array} - The conversation history
 */
function getConversation(channelId) {
  // Check if conversation exists and is not expired
  if (conversations.has(channelId)) {
    const lastActivity = lastActivityTime.get(channelId) || 0;
    const now = Date.now();
    
    // If conversation has expired, clear it
    if (now - lastActivity > MAX_CONVERSATION_AGE) {
      clearConversation(channelId);
      return [];
    }
    
    // Update last activity time
    lastActivityTime.set(channelId, now);
    
    return conversations.get(channelId);
  }
  
  return [];
}

/**
 * Clear the conversation history for a channel
 * @param {string} channelId - The channel ID
 */
function clearConversation(channelId) {
  conversations.delete(channelId);
  lastActivityTime.delete(channelId);
}

/**
 * Initialize a new conversation with a system message
 * @param {string} channelId - The channel ID
 * @param {string} botName - The name of the bot
 */
function initializeConversation(channelId, botName = 'Ferret9') {
  clearConversation(channelId);
  
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
  - Keep responses under 2000 characters to fit Discord message limitations
  - For image analysis, identify code, diagrams, or technical content
  
  CONVERSATION APPROACH:
  - Maintain context from previous messages
  - Ask clarifying questions when needed
  - Admit when you don't know something rather than guessing`;
  
  addMessage(channelId, 'system', systemMessage);
}

/**
 * Clean up expired conversations
 */
function cleanupExpiredConversations() {
  const now = Date.now();
  
  for (const [channelId, lastActivity] of lastActivityTime.entries()) {
    if (now - lastActivity > MAX_CONVERSATION_AGE) {
      clearConversation(channelId);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupExpiredConversations, 10 * 60 * 1000);

module.exports = {
  addMessage,
  getConversation,
  clearConversation,
  initializeConversation
}; 