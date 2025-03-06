const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { generateAiResponse } = require('./openAiHelper');

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const docClient = DynamoDBDocumentClient.from(client);

/**
 * Scan and log all data in the DynamoDB tables
 * @returns {Promise<Object>} - Object containing all table data
 */
async function scanTables() {
  console.log('========== SCANNING ALL DYNAMODB TABLES ==========');
  const result = {
    logs: [],
    sessions: []
  };
  
  try {
    // Scan logs table
    console.log(`Scanning logs table: ${process.env.DYNAMODB_LOGS_TABLE}`);
    const logsParams = {
      TableName: process.env.DYNAMODB_LOGS_TABLE
    };
    
    const logsCommand = new ScanCommand(logsParams);
    const logsResponse = await docClient.send(logsCommand);
    
    result.logs = logsResponse.Items || [];
    console.log(`Found ${result.logs.length} items in logs table`);
    
    if (result.logs.length > 0) {
      console.log('Sample log item structure:');
      console.log(JSON.stringify(result.logs[0], null, 2));
      
      console.log('All log items:');
      console.log(JSON.stringify(result.logs, null, 2));
    }
    
    // Scan sessions table
    console.log(`Scanning sessions table: ${process.env.DYNAMODB_SESSIONS_TABLE}`);
    const sessionsParams = {
      TableName: process.env.DYNAMODB_SESSIONS_TABLE
    };
    
    const sessionsCommand = new ScanCommand(sessionsParams);
    const sessionsResponse = await docClient.send(sessionsCommand);
    
    result.sessions = sessionsResponse.Items || [];
    console.log(`Found ${result.sessions.length} items in sessions table`);
    
    if (result.sessions.length > 0) {
      console.log('Sample session item structure:');
      console.log(JSON.stringify(result.sessions[0], null, 2));
      
      console.log('All session items:');
      console.log(JSON.stringify(result.sessions, null, 2));
    }
    
    console.log('========== SCAN COMPLETE ==========');
    return result;
  } catch (error) {
    console.error('Error scanning tables:', error);
    return result;
  }
}

/**
 * Parse a date string into a standardized YYYY-MM-DD format
 * @param {string} dateStr - Date string to parse
 * @returns {string} - Standardized date string in YYYY-MM-DD format
 */
function parseDate(dateStr) {
  // Default to 2025 if year is not specified
  const defaultYear = 2025;
  let date;

  console.log(`Attempting to parse date: "${dateStr}"`);

  // Check for MM-DD-YYYY format (e.g., 03-05-2025)
  const mmddyyyyRegex = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
  const mmddyyyyMatch = dateStr.match(mmddyyyyRegex);
  
  if (mmddyyyyMatch) {
    const month = parseInt(mmddyyyyMatch[1], 10);
    const day = parseInt(mmddyyyyMatch[2], 10);
    const year = parseInt(mmddyyyyMatch[3], 10);
    
    console.log(`Detected MM-DD-YYYY format: month=${month}, day=${day}, year=${year}`);
    
    // Create date in YYYY-MM-DD format
    const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    console.log(`Parsed date "${dateStr}" to "${formattedDate}"`);
    return formattedDate;
  }

  // Try different date formats
  try {
    // Handle formats like "March 4", "March 4 2024", etc.
    date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      // Try adding the default year if it's not a valid date
      date = new Date(`${dateStr} ${defaultYear}`);
    } else {
      // If the date is valid but doesn't include a year, it defaults to the current year
      // Check if we need to set it to our default year instead
      const yearSpecified = /\b(20\d{2})\b/.test(dateStr); // Check if a year like "2023", "2024", etc. is specified
      if (!yearSpecified) {
        // Set the year to our default
        date.setFullYear(defaultYear);
      }
    }
  } catch (error) {
    // If still not valid, use today's date but with the default year
    console.error('Error parsing date:', error);
    date = new Date();
    date.setFullYear(defaultYear);
  }

  // Format as YYYY-MM-DD
  const formattedDate = date.toISOString().split('T')[0];
  console.log(`Parsed date "${dateStr}" to "${formattedDate}" (using default year: ${defaultYear})`);
  return formattedDate;
}

/**
 * Fetch user activity data for a specific date
 * @param {string} userId - Discord user ID
 * @param {string} dateStr - Date string to fetch activity for
 * @returns {Promise<Array>} - Array of activity records
 */
async function fetchUserActivity(userId, dateStr) {
  const date = parseDate(dateStr);
  console.log(`Fetching activity for user ${userId} on date ${date}`);
  
  try {
    // Use a simple scan operation with no filter expressions
    const params = {
      TableName: process.env.DYNAMODB_LOGS_TABLE
    };

    console.log(`Scanning table: ${process.env.DYNAMODB_LOGS_TABLE}`);
    const command = new ScanCommand(params);
    const response = await docClient.send(command);
    
    console.log(`Retrieved ${response.Items ? response.Items.length : 0} total items from logs table`);
    
    // Filter the results manually in JavaScript
    const filteredItems = (response.Items || []).filter(item => {
      // Log each item to see its structure
      console.log(`Examining log item: ${JSON.stringify(item)}`);
      
      // Check if the item belongs to this user
      const userIdMatch = item.UserId === userId;
      if (!userIdMatch) {
        console.log(`  - UserId doesn't match: ${item.UserId} !== ${userId}`);
        return false;
      }
      
      // Check if the item's timestamp contains the date
      let timestampField = item.Timestamp || item.timestamp;
      const itemDate = timestampField ? timestampField.substring(0, 10) : '';
      const dateMatch = itemDate === date;
      
      if (!dateMatch) {
        console.log(`  - Date doesn't match: ${itemDate} !== ${date}`);
      }
      
      return dateMatch;
    });
    
    console.log(`After filtering, found ${filteredItems.length} activity records for user ${userId} on ${date}`);
    
    // Log the structure of the first item to help with debugging
    if (filteredItems.length > 0) {
      console.log('Sample activity record structure:');
      console.log(JSON.stringify(filteredItems[0], null, 2));
    }
    
    return filteredItems;
  } catch (error) {
    console.error('Error fetching user activity:', error);
    return [];
  }
}

/**
 * Fetch user session data for a specific date
 * @param {string} userId - Discord user ID
 * @param {string} dateStr - Date string to fetch sessions for
 * @returns {Promise<Array>} - Array of session records
 */
async function fetchUserSessions(userId, dateStr) {
  const date = parseDate(dateStr);
  console.log(`Fetching sessions for user ${userId} on date ${date}`);
  
  try {
    // Use a simple scan operation with no filter expressions
    const params = {
      TableName: process.env.DYNAMODB_SESSIONS_TABLE
    };

    console.log(`Scanning table: ${process.env.DYNAMODB_SESSIONS_TABLE}`);
    const command = new ScanCommand(params);
    const response = await docClient.send(command);
    
    console.log(`Retrieved ${response.Items ? response.Items.length : 0} total items from sessions table`);
    
    // Filter the results manually in JavaScript
    const filteredItems = (response.Items || []).filter(item => {
      // Log each item to see its structure
      console.log(`Examining session item: ${JSON.stringify(item)}`);
      
      // Check if the item belongs to this user
      const userIdMatch = item.UserId === userId;
      if (!userIdMatch) {
        console.log(`  - UserId doesn't match: ${item.UserId} !== ${userId}`);
        return false;
      }
      
      // Check if the item's start time contains the date
      let startTimeField = item.StartTime || item.startTime;
      const itemDate = startTimeField ? startTimeField.substring(0, 10) : '';
      const dateMatch = itemDate === date;
      
      if (!dateMatch) {
        console.log(`  - Date doesn't match: ${itemDate} !== ${date}`);
      }
      
      return dateMatch;
    });
    
    console.log(`After filtering, found ${filteredItems.length} session records for user ${userId} on ${date}`);
    
    // Log the structure of the first item to help with debugging
    if (filteredItems.length > 0) {
      console.log('Sample session record structure:');
      console.log(JSON.stringify(filteredItems[0], null, 2));
    }
    
    return filteredItems;
  } catch (error) {
    console.error('Error fetching user sessions:', error);
    return [];
  }
}

/**
 * Generate a report of user activity for a specific date
 * @param {Object} targetUser - The Discord user object for whom to generate the report
 * @param {string} dateStr - Date string to generate report for
 * @param {string} requestingUsername - Username of the person requesting the report
 * @returns {Promise<string>} - The generated report
 */
async function generateUserActivityReport(targetUser, dateStr, requestingUsername) {
  console.log(`Generating activity report for user ${targetUser.username} (${targetUser.id}) on ${dateStr}, requested by ${requestingUsername}`);
  
  // Use nickname if available, otherwise fall back to username
  const displayName = targetUser.nickname || targetUser.username;
  
  try {
    // First, scan all tables to understand the data structure
    console.log('Scanning all tables to understand data structure...');
    await scanTables();
    
    // Fetch activity and session data
    const activities = await fetchUserActivity(targetUser.id, dateStr);
    const sessions = await fetchUserSessions(targetUser.id, dateStr);
    
    console.log(`Retrieved ${activities.length} activities and ${sessions.length} sessions`);
    
    // If no data found, return a message indicating that
    if (activities.length === 0 && sessions.length === 0) {
      console.log(`No activity data found for ${displayName} on ${dateStr}`);
      return `No activity data found for ${displayName} on ${dateStr}.`;
    }
    
    // Function to convert UTC timestamp to Manila time (UTC+8)
    const convertToManilaTime = (timestamp) => {
      console.log(`Converting timestamp: ${timestamp}`);
      
      if (!timestamp) return null;
      
      // If timestamp is just a string like "SignIn" or "SignOut", return it as is
      if (timestamp === "SignIn" || timestamp === "SignOut") return timestamp;
      
      try {
        // Parse the timestamp
        const date = new Date(timestamp);
        
        // Check if the date is valid
        if (isNaN(date.getTime())) return timestamp;
        
        // Get UTC hours and minutes for debugging
        const utcHours = date.getUTCHours();
        const utcMinutes = date.getUTCMinutes();
        console.log(`Original UTC time: ${utcHours}:${utcMinutes.toString().padStart(2, '0')}`);
        
        // Calculate Manila time manually (UTC+8)
        let manilaHours = (utcHours + 8) % 24;
        const manilaMinutes = utcMinutes;
        
        // Format the time with AM/PM
        const period = manilaHours >= 12 ? 'PM' : 'AM';
        manilaHours = manilaHours % 12 || 12; // Convert to 12-hour format
        
        // Format with leading zeros for minutes and ensure consistent format
        const manilaTimeFormatted = `${manilaHours}:${manilaMinutes.toString().padStart(2, '0')} ${period}`;
        console.log(`Converted to Manila time: ${manilaTimeFormatted}`);
        
        return manilaTimeFormatted;
      } catch (error) {
        console.error('Error converting timestamp to Manila time:', error);
        return timestamp;
      }
    };
    
    // Prepare data for AI processing with Manila time conversion
    const activityData = {
      user: displayName,
      date: dateStr,
      activities: activities.map(a => {
        const originalTimestamp = a.Timestamp || a.timestamp;
        const manilaTimestamp = convertToManilaTime(originalTimestamp);
        
        return {
          type: a.ActivityType || a.activityType,
          timestamp: manilaTimestamp,
          originalTimestamp: originalTimestamp,
          details: a.Details || a.details || {},
          duration: a.Duration || a.duration,
          note: `This timestamp was converted from ${originalTimestamp} (UTC) to ${manilaTimestamp} (Manila time / UTC+8)`
        };
      }),
      sessions: sessions.map(s => {
        const originalStartTime = s.StartTime || s.startTime;
        const originalEndTime = s.EndTime || s.endTime;
        const manilaStartTime = convertToManilaTime(originalStartTime);
        const manilaEndTime = convertToManilaTime(originalEndTime);
        
        return {
          id: s.id,
          startTime: manilaStartTime,
          originalStartTime: originalStartTime,
          endTime: manilaEndTime,
          originalEndTime: originalEndTime,
          totalWorkDuration: s.TotalWorkDuration || s.totalWorkDuration,
          breakDuration: s.BreakDuration || s.breakDuration,
          status: s.Status || s.status,
          note: `Start time was converted from ${originalStartTime} (UTC) to ${manilaStartTime} (Manila time / UTC+8)`
        };
      })
    };
    
    console.log('Prepared activity data for AI processing:');
    console.log(JSON.stringify(activityData, null, 2));
    
    // Generate prompt for AI
    const prompt = `Please generate a concise summary of ${displayName}'s activity on ${dateStr}. 

Here is their activity data:
${JSON.stringify(activityData, null, 2)}

IMPORTANT: All timestamps have been manually converted from UTC to Manila time (UTC+8). For example, 5:20 AM UTC has been converted to 1:20 PM Manila time. Please use these Manila time timestamps in your report.

Please format the report using Discord-friendly formatting:

---

**Activity Summary for ${displayName} (${dateStr})**

**1. Total Work Time**
• Start Time: [time] (Manila time, UTC+8)
• End Time: [time or "No recorded end time, indicating the session was still active as of the last update."]
• Work Duration: [duration or explanation if it cannot be calculated]

**2. Key Activities**
• [time]: [activity description]
• [time]: [activity description]
• [additional activities as needed]

**3. Breaks or Time Off**
• [List any breaks or indicate "No breaks or time off were recorded during the session."]

**4. Productivity Assessment**
• Observations:
  ◦ [observation 1]
  ◦ [observation 2]
• Assessment: [overall productivity assessment]

---

Keep the summary professional but conversational. Use Discord's formatting: **bold** for headers, • for bullet points, and ◦ for sub-bullet points. Make sure to use proper spacing for readability in Discord.`;

    console.log('Sending prompt to AI for report generation');
    
    // Generate AI response
    const aiResponse = await generateAiResponse(
      prompt,
      requestingUsername,
      'Ferret9',
      [],
      [] // No conversation history needed for reports
    );
    
    console.log('AI response generated successfully');
    return aiResponse;
  } catch (error) {
    console.error('Error generating user activity report:', error);
    return `I'm sorry, I encountered an error while generating the activity report for ${targetUser.username} on ${dateStr}.`;
  }
}

module.exports = {
  generateUserActivityReport,
  parseDate,
  scanTables
}; 