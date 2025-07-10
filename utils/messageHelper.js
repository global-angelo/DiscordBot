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
 * Truncate a message to fit within Discord's character limit
 * @param {string} message - The message to truncate
 * @param {number} maxLength - Maximum allowed length (default: 2000 for Discord's limit)
 * @returns {string} - Truncated message
 */
function truncateMessage(message, maxLength = 2000) {
  if (!message) {
    return '';
  }
  
  if (message.length <= maxLength) {
    return message;
  }
  
  // Truncate and add indicator
  return message.substring(0, maxLength - 3) + '...';
}

module.exports = {
  splitMessage,
  truncateMessage
}; 