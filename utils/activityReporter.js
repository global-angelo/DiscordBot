const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

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
 * @param {string} displayName - Display name (nickname) of the target user
 * @returns {Promise<string>} - The generated report
 */
async function generateUserActivityReport(targetUser, dateStr, requestingUsername, displayName = null) {
  // Use display name if provided, otherwise fall back to username
  const userDisplayName = displayName || targetUser.username;
  
  console.log(`Generating activity report for ${userDisplayName} (${targetUser.id}) on ${dateStr}, requested by ${requestingUsername}`);
  
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
      console.log(`No activity data found for ${userDisplayName} on ${dateStr}`);
      return `No activity data found for ${userDisplayName} on ${dateStr}.`;
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
      user: userDisplayName,
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
    
    // Generate the report using our formatting function
    const report = formatActivityReport(activityData, userDisplayName, dateStr);
    
    console.log('Report generated successfully');
    return report;
  } catch (error) {
    console.error('Error generating user activity report:', error);
    return `I'm sorry, I encountered an error while generating the activity report for ${userDisplayName} on ${dateStr}.`;
  }
}

/**
 * Generate a formatted report from activity data
 * @param {Object} activityData - The activity data to format
 * @param {string} userDisplayName - The user's display name
 * @param {string} dateStr - The date string
 * @returns {string} - The formatted report
 */
function formatActivityReport(activityData, userDisplayName, dateStr) {
  // Extract data
  const sessions = activityData.sessions || [];
  const activities = activityData.activities || [];
  
  console.log("DEBUG - Sessions data:", JSON.stringify(sessions, null, 2));
  console.log("DEBUG - Activities data:", JSON.stringify(activities, null, 2));
  
  // Get start time from the first session or activity
  let startTime = "Unknown";
  let startTimestamp = null;
  if (sessions.length > 0 && sessions[0].startTime) {
    startTime = sessions[0].startTime;
    startTimestamp = new Date(sessions[0].originalStartTime);
    console.log("DEBUG - Start timestamp:", startTimestamp, "from", sessions[0].originalStartTime);
  } else if (activities.length > 0) {
    // Find the first SignIn activity
    const signInActivity = activities.find(a => (a.type === 'SignIn' || a.ActivityType === 'SignIn'));
    if (signInActivity) {
      startTime = signInActivity.timestamp;
      startTimestamp = new Date(signInActivity.originalTimestamp);
      console.log("DEBUG - Start timestamp from SignIn activity:", startTimestamp, "from", signInActivity.originalTimestamp);
    }
  }
  
  // Get end time (if available)
  let endTime = "No recorded end time, indicating the session was still active as of the last update.";
  let endTimestamp = null;
  if (sessions.length > 0 && sessions[0].endTime) {
    endTime = sessions[0].endTime;
    endTimestamp = new Date(sessions[0].originalEndTime);
    console.log("DEBUG - End timestamp from session:", endTimestamp, "from", sessions[0].originalEndTime);
  } else if (activities.length > 0) {
    // Find the last SignOut activity
    const signOutActivity = activities.find(a => (a.type === 'SignOut' || a.ActivityType === 'SignOut'));
    if (signOutActivity) {
      endTime = signOutActivity.timestamp;
      endTimestamp = new Date(signOutActivity.originalTimestamp);
      console.log("DEBUG - End timestamp from SignOut activity:", endTimestamp, "from", signOutActivity.originalTimestamp);
    }
  }
  
  // Calculate work duration (if possible)
  let workDuration = "Unable to calculate, as the session is ongoing.";
  let totalHours = 0;
  
  if (startTimestamp && endTimestamp) {
    console.log("DEBUG - Calculating duration between:", startTimestamp, "and", endTimestamp);
    
    // Check if end time is earlier than start time (next day)
    let durationMs = endTimestamp - startTimestamp;
    
    // If duration is negative, it means the end time is on the next day
    if (durationMs < 0) {
      console.log("DEBUG - Negative duration detected, assuming end time is on the next day");
      // Add 24 hours to account for crossing midnight
      durationMs += 24 * 60 * 60 * 1000;
    }
    
    // Convert to hours and minutes
    totalHours = durationMs / (1000 * 60 * 60);
    const hours = Math.floor(totalHours);
    const minutes = Math.floor((totalHours - hours) * 60);
    workDuration = `${hours} hour${hours !== 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    console.log("DEBUG - Calculated duration:", workDuration, "Total hours:", totalHours);
  } else if (startTimestamp) {
    // Calculate duration from start time to now
    const now = new Date();
    const durationMs = now - startTimestamp;
    // Convert to hours and minutes
    totalHours = durationMs / (1000 * 60 * 60);
    const hours = Math.floor(totalHours);
    const minutes = Math.floor((totalHours - hours) * 60);
    workDuration = `${hours} hour${hours !== 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''} (ongoing)`;
    console.log("DEBUG - Calculated ongoing duration:", workDuration, "Total hours:", totalHours);
  }
  
  // Format activities
  const formattedActivities = activities.map(activity => {
    const time = activity.timestamp || "Unknown time";
    const type = activity.type || activity.ActivityType || "Unknown activity";
    const details = typeof activity.details === 'string' ? activity.details : 
                   (activity.details && activity.details.message) ? activity.details.message : 
                   activity.Details || "No details available";
    
    return `• ${time}: ${type === 'SignIn' ? 'Started work session' : 
                         type === 'SignOut' ? 'Ended work session' :
                         type === 'Update' ? `Worked on "${details}"` : 
                         `${type} - ${details}`}`;
  }).join('\n');
  
  // Check for breaks
  const hasBreaks = activities.some(activity => activity.type === 'Break' || activity.ActivityType === 'Break' || 
                                              activity.type === 'BackFromBreak' || activity.ActivityType === 'BackFromBreak');
  const breaksSection = hasBreaks ? 
    activities.filter(activity => activity.type === 'Break' || activity.ActivityType === 'Break' || 
                                 activity.type === 'BackFromBreak' || activity.ActivityType === 'BackFromBreak')
      .map(activity => {
        const type = activity.type || activity.ActivityType;
        return `• ${activity.timestamp}: ${type === 'Break' ? 'Started break' : 'Returned from break'}`;
      })
      .join('\n') : 
    "• No breaks or time off were recorded during the session.";
  
  // Build the report
  return `**Activity Summary for ${userDisplayName} (${dateStr})**

**1. Total Work Time**
• Start Time: ${startTime} (Manila time, UTC+8)
• End Time: ${endTime}
• Work Duration: ${workDuration}
• Total Hours: ${totalHours.toFixed(2)} hours

**2. Key Activities**
${formattedActivities || "• No specific activities recorded."}

**3. Breaks or Time Off**
${breaksSection}
`;
}

/**
 * Determine the time of day based on the timestamp
 * @param {string} timeStr - The time string (e.g., "1:19 PM")
 * @returns {string} - The time of day (morning, afternoon, evening, night)
 */
function getTimeOfDay(timeStr) {
  if (!timeStr || timeStr === "Unknown") return "day";
  
  try {
    // Extract hour from time string (e.g., "1:19 PM")
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return "day";
    
    let hour = parseInt(match[1], 10);
    const period = match[3].toUpperCase();
    
    // Convert to 24-hour format
    if (period === "PM" && hour < 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    
    // Determine time of day
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  } catch (error) {
    console.error('Error determining time of day:', error);
    return "day";
  }
}

module.exports = {
  generateUserActivityReport,
  parseDate,
  scanTables,
  formatActivityReport,
  getTimeOfDay
}; 