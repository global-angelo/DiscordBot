const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  UpdateCommand, 
  QueryCommand,
  ScanCommand
} = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const docClient = DynamoDBDocumentClient.from(client);

// Table names
const SESSIONS_TABLE = process.env.DYNAMODB_SESSIONS_TABLE;
const LOGS_TABLE = process.env.DYNAMODB_LOGS_TABLE;

/**
 * Start a new user session
 * @param {string} userId - Discord user ID
 * @param {string} username - Discord username
 * @returns {Promise<string>} - Session ID
 */
async function startUserSession(userId, username) {
  const now = new Date();
  const sessionId = now.toISOString();
  
  const params = {
    TableName: SESSIONS_TABLE,
    Item: {
      id: `${userId}:${sessionId}`,
      UserId: userId,
      SessionId: sessionId,
      StartTime: sessionId,
      EndTime: null,
      TotalWorkDuration: 0,
      BreakDuration: 0,
      Status: 'Working',
      Username: username
    }
  };
  
  try {
    await docClient.send(new PutCommand(params));
    console.log(`Started session for user ${userId}`);
    
    // Log the activity
    await logActivity(userId, sessionId, 'SignIn', 'Started work session');
    
    return sessionId;
  } catch (error) {
    console.error('Error starting user session:', error);
    throw error;
  }
}

/**
 * Log user activity
 * @param {string} userId - Discord user ID
 * @param {string} timestamp - ISO timestamp
 * @param {string} activityType - Type of activity (SignIn, Break, BackFromBreak, SignOut, Update)
 * @param {string} details - Additional details
 * @param {number} duration - Duration in minutes (if applicable)
 */
async function logActivity(userId, timestamp, activityType, details, duration = null) {
  const now = timestamp || new Date().toISOString();
  
  const params = {
    TableName: LOGS_TABLE,
    Item: {
      id: `${userId}:${now}`,
      UserId: userId,
      Timestamp: now,
      ActivityType: activityType,
      Details: details,
      Duration: duration
    }
  };
  
  try {
    await docClient.send(new PutCommand(params));
    console.log(`Logged ${activityType} activity for user ${userId}`);
  } catch (error) {
    console.error('Error logging activity:', error);
    throw error;
  }
}

/**
 * Get active session for a user
 * @param {string} userId - Discord user ID
 * @returns {Promise<Object|null>} - Session object or null if not found
 */
async function getActiveSession(userId) {
  const params = {
    TableName: SESSIONS_TABLE,
    FilterExpression: 'UserId = :userId AND (attribute_not_exists(EndTime) OR EndTime = :null)',
    ExpressionAttributeValues: {
      ':userId': userId,
      ':null': null
    }
  };
  
  try {
    const response = await docClient.send(new ScanCommand(params));
    return response.Items && response.Items.length > 0 ? response.Items[0] : null;
  } catch (error) {
    console.error('Error getting active session:', error);
    throw error;
  }
}

/**
 * Update user session status
 * @param {string} userId - Discord user ID
 * @param {string} sessionId - Session ID
 * @param {string} status - New status (Working, Break, Offline)
 */
async function updateSessionStatus(userId, sessionId, status) {
  const params = {
    TableName: SESSIONS_TABLE,
    Key: {
      id: `${userId}:${sessionId}`
    },
    UpdateExpression: 'set #status = :status',
    ExpressionAttributeNames: {
      '#status': 'Status'
    },
    ExpressionAttributeValues: {
      ':status': status
    }
  };
  
  try {
    await docClient.send(new UpdateCommand(params));
    console.log(`Updated session status to ${status} for user ${userId}`);
  } catch (error) {
    console.error('Error updating session status:', error);
    throw error;
  }
}

/**
 * Record break
 * @param {string} userId - Discord user ID
 * @param {string} reason - Reason for break (optional)
 * @returns {Promise<string>} - Break start time (ISO string)
 */
async function recordBreak(userId, reason = null) {
  try {
    // Get the active session
    const session = await getActiveSession(userId);
    if (!session) {
      throw new Error('No active session found');
    }
    
    // Get the session ID
    const sessionId = session.SessionId;
    const now = new Date().toISOString();
    
    // Update session status and store break start time
    const params = {
      TableName: SESSIONS_TABLE,
      Key: {
        id: `${userId}:${sessionId}`
      },
      UpdateExpression: 'set #userStatus = :status, LastBreakStart = :breakStart',
      ExpressionAttributeNames: {
        '#userStatus': 'Status'
      },
      ExpressionAttributeValues: {
        ':status': 'Break',
        ':breakStart': now
      }
    };
    
    await docClient.send(new UpdateCommand(params));
    console.log(`Updated session status to Break for user ${userId}`);
    
    // Log the activity
    await logActivity(userId, now, 'Break', reason || 'No reason provided');
    
    return now; // Return break start time
  } catch (error) {
    console.error('Error recording break:', error);
    throw error;
  }
}

/**
 * Record return from break
 * @param {string} userId - Discord user ID
 * @param {string} sessionId - Session ID
 * @param {string} breakStartTime - Break start time (ISO string)
 */
async function recordReturnFromBreak(userId, sessionId, breakStartTime) {
  const now = new Date();
  const breakStart = new Date(breakStartTime);
  const breakDurationMinutes = Math.round((now - breakStart) / 60000);
  
  // Update session status
  await updateSessionStatus(userId, sessionId, 'Working');
  
  // Update break duration
  const params = {
    TableName: SESSIONS_TABLE,
    Key: {
      id: `${userId}:${sessionId}`
    },
    UpdateExpression: 'set BreakDuration = BreakDuration + :duration',
    ExpressionAttributeValues: {
      ':duration': breakDurationMinutes
    }
  };
  
  try {
    await docClient.send(new UpdateCommand(params));
    
    // Log the activity
    await logActivity(
      userId, 
      now.toISOString(), 
      'BackFromBreak', 
      `Returned from break (${breakDurationMinutes} minutes)`,
      breakDurationMinutes
    );
    
    return breakDurationMinutes;
  } catch (error) {
    console.error('Error recording return from break:', error);
    throw error;
  }
}

/**
 * Record return from break using just the user ID
 * @param {string} userId - Discord user ID
 * @returns {Promise<Object>} - Break duration in minutes and seconds
 */
async function recordBackFromBreak(userId) {
  try {
    // Get the active session
    const session = await getActiveSession(userId);
    if (!session) {
      throw new Error('No active session found');
    }
    
    // Get the session ID and break start time
    const sessionId = session.SessionId;
    const breakStartTime = session.LastBreakStart;
    
    if (!breakStartTime) {
      throw new Error('No break start time found');
    }
    
    // Calculate break duration in seconds
    const now = new Date();
    const breakStart = new Date(breakStartTime);
    
    // Ensure we have valid date objects before calculation
    if (isNaN(breakStart.getTime())) {
      console.error('Invalid break start time:', breakStartTime);
      throw new Error('Invalid break start time');
    }
    
    const breakDurationSeconds = Math.round((now - breakStart) / 1000);
    const breakDurationMinutes = Math.round(breakDurationSeconds / 60);
    
    console.log(`Break duration calculation: ${now} - ${breakStart} = ${breakDurationSeconds}s (${breakDurationMinutes}m)`);
    
    // Update session status
    await updateSessionStatus(userId, sessionId, 'Working');
    
    // Update break duration
    const params = {
      TableName: SESSIONS_TABLE,
      Key: {
        id: `${userId}:${sessionId}`
      },
      UpdateExpression: 'set BreakDuration = BreakDuration + :duration',
      ExpressionAttributeValues: {
        ':duration': breakDurationMinutes
      }
    };
    
    await docClient.send(new UpdateCommand(params));
    
    // Log the activity
    await logActivity(
      userId, 
      now.toISOString(), 
      'BackFromBreak', 
      `Returned from break (${breakDurationMinutes} minutes)`,
      breakDurationMinutes
    );
    
    return { 
      durationMinutes: breakDurationMinutes, 
      durationSeconds: breakDurationSeconds 
    };
  } catch (error) {
    console.error('Error recording return from break:', error);
    throw error;
  }
}

/**
 * End user session
 * @param {string} userId - Discord user ID
 * @param {string} sessionId - Session ID
 * @param {string} workSummary - Summary of work done during the session (optional)
 * @returns {Promise<Object>} - Session data including duration
 */
async function endUserSession(userId, sessionId, workSummary = null) {
  const now = new Date();
  const session = await getActiveSession(userId);
  
  if (!session) return null;
  
  // Calculate duration
  const startTime = new Date(session.StartTime);
  const endTime = now;
  const totalTimeMinutes = Math.round((endTime - startTime) / 60000);
  const workDurationMinutes = totalTimeMinutes - (session.BreakDuration || 0);
  
  // Build update expression
  let updateExpression = 'set EndTime = :endTime, TotalWorkDuration = :duration, #userStatus = :status';
  const expressionAttributeNames = {
    '#userStatus': 'Status'
  };
  const expressionAttributeValues = {
    ':endTime': now.toISOString(),
    ':duration': workDurationMinutes,
    ':status': 'SignedOut'
  };
  
  // Add work summary if provided
  if (workSummary) {
    updateExpression += ', WorkSummary = :summary';
    expressionAttributeValues[':summary'] = workSummary;
  }
  
  const params = {
    TableName: SESSIONS_TABLE,
    Key: {
      id: `${userId}:${sessionId}`
    },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  };
  
  try {
    const result = await docClient.send(new UpdateCommand(params));
    const updatedSession = result.Attributes;
    
    // Log the activity
    await logActivity(
      userId, 
      now.toISOString(), 
      'SignOut', 
      `Ended work session (${workDurationMinutes} minutes)${workSummary ? ' with summary' : ''}`,
      workDurationMinutes
    );
    
    return {
      TotalWorkDuration: workDurationMinutes,
      TotalBreakDuration: session.BreakDuration || 0,
      StartTime: session.StartTime,
      EndTime: now.toISOString(),
      WorkSummary: workSummary
    };
  } catch (error) {
    console.error('Error ending user session:', error);
    throw error;
  }
}

/**
 * Record an update
 * @param {string} userId - Discord user ID
 * @param {string} updateText - Update content
 */
async function recordUpdate(userId, updateText) {
  const now = new Date().toISOString();
  
  // Log the activity
  await logActivity(userId, now, 'Update', updateText);
  
  return now;
}

/**
 * Get user's current work duration
 * @param {string} userId - Discord user ID
 * @returns {Promise<Object>} - Duration information
 */
async function getCurrentWorkDuration(userId) {
  const session = await getActiveSession(userId);
  
  if (!session) return null;
  
  const startTime = new Date(session.StartTime);
  const now = new Date();
  const totalMinutes = Math.round((now - startTime) / 60000);
  const breakDuration = session.BreakDuration || 0;
  const workDuration = totalMinutes - breakDuration;
  
  return {
    workDuration,
    breakDuration,
    totalDuration: totalMinutes,
    status: session.Status
  };
}

/**
 * Get weekly report data
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} - Report data
 */
async function getWeeklyReport(startDate, endDate) {
  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();
  
  // Get all completed sessions in the date range
  const sessionsParams = {
    TableName: SESSIONS_TABLE,
    FilterExpression: 'StartTime BETWEEN :start AND :end AND attribute_exists(EndTime)',
    ExpressionAttributeValues: {
      ':start': startISO,
      ':end': endISO
    }
  };
  
  try {
    const sessionsResponse = await docClient.send(new ScanCommand(sessionsParams));
    const sessions = sessionsResponse.Items || [];
    
    // Get all activities in the date range
    const logsParams = {
      TableName: LOGS_TABLE,
      FilterExpression: 'Timestamp BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':start': startISO,
        ':end': endISO
      }
    };
    
    const logsResponse = await docClient.send(new ScanCommand(logsParams));
    const activities = logsResponse.Items || [];
    
    // Process data for report
    const userStats = {};
    
    // Process sessions
    sessions.forEach(session => {
      if (!userStats[session.UserId]) {
        userStats[session.UserId] = {
          userId: session.UserId,
          username: session.Username || session.UserId,
          totalWorkMinutes: 0,
          totalBreakMinutes: 0,
          sessionCount: 0,
          activities: {
            updates: 0,
            breaks: 0
          }
        };
      }
      
      userStats[session.UserId].totalWorkMinutes += session.TotalWorkDuration || 0;
      userStats[session.UserId].totalBreakMinutes += session.BreakDuration || 0;
      userStats[session.UserId].sessionCount++;
    });
    
    // Process activities
    activities.forEach(activity => {
      if (!userStats[activity.UserId]) {
        userStats[activity.UserId] = {
          userId: activity.UserId,
          username: activity.UserId,
          totalWorkMinutes: 0,
          totalBreakMinutes: 0,
          sessionCount: 0,
          activities: {
            updates: 0,
            breaks: 0
          }
        };
      }
      
      if (activity.ActivityType === 'Update') {
        userStats[activity.UserId].activities.updates++;
      } else if (activity.ActivityType === 'Break') {
        userStats[activity.UserId].activities.breaks++;
      }
    });
    
    return {
      startDate: startISO,
      endDate: endISO,
      userStats: Object.values(userStats)
    };
  } catch (error) {
    console.error('Error generating weekly report:', error);
    throw error;
  }
}

/**
 * Get daily breakdown of activities for a user
 * @param {string} userId - Discord user ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} - Array of daily activity data
 */
async function getDailyActivityBreakdown(userId, startDate, endDate) {
  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();
  
  try {
    // Get all sessions in the date range
    const sessionsParams = {
      TableName: SESSIONS_TABLE,
      FilterExpression: 'UserId = :userId AND StartTime BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':start': startISO,
        ':end': endISO
      }
    };
    
    const sessionsResponse = await docClient.send(new ScanCommand(sessionsParams));
    const sessions = sessionsResponse.Items || [];
    
    // Get all activities in the date range
    const logsParams = {
      TableName: LOGS_TABLE,
      FilterExpression: 'UserId = :userId AND Timestamp BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':start': startISO,
        ':end': endISO
      }
    };
    
    const logsResponse = await docClient.send(new ScanCommand(logsParams));
    const activities = logsResponse.Items || [];
    
    // Organize data by day
    const dailyData = {};
    
    // Process sessions to get work minutes per day
    sessions.forEach(session => {
      const startTime = new Date(session.StartTime);
      const endTime = session.EndTime ? new Date(session.EndTime) : new Date();
      const workDuration = session.TotalWorkDuration || 0;
      
      // Get the date string (YYYY-MM-DD) to use as key
      const dateStr = startTime.toISOString().split('T')[0];
      
      if (!dailyData[dateStr]) {
        dailyData[dateStr] = {
          date: new Date(dateStr),
          workMinutes: 0,
          activities: []
        };
      }
      
      dailyData[dateStr].workMinutes += workDuration;
    });
    
    // Process activities to add to each day
    activities.forEach(activity => {
      const timestamp = new Date(activity.Timestamp);
      const dateStr = timestamp.toISOString().split('T')[0];
      
      if (!dailyData[dateStr]) {
        dailyData[dateStr] = {
          date: new Date(dateStr),
          workMinutes: 0,
          activities: []
        };
      }
      
      dailyData[dateStr].activities.push({
        type: activity.ActivityType,
        timestamp: timestamp,
        details: activity.Details,
        duration: activity.Duration
      });
    });
    
    // Convert to array and sort by date
    return Object.values(dailyData).sort((a, b) => a.date - b.date);
  } catch (error) {
    console.error('Error getting daily activity breakdown:', error);
    throw error;
  }
}

/**
 * Get daily report with work summaries
 * @param {Date} date - The date to get the report for
 * @returns {Promise<Array>} - Array of user activities with work summaries
 */
async function getDailyReport(date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const params = {
    TableName: SESSIONS_TABLE,
    FilterExpression: 'StartTime BETWEEN :start AND :end',
    ExpressionAttributeValues: {
      ':start': startOfDay.toISOString(),
      ':end': endOfDay.toISOString()
    }
  };
  
  try {
    const response = await docClient.send(new ScanCommand(params));
    const sessions = response.Items || [];
    
    // Group sessions by user
    const userSessions = {};
    for (const session of sessions) {
      if (!userSessions[session.UserId]) {
        userSessions[session.UserId] = {
          userId: session.UserId,
          username: session.Username,
          workMinutes: 0,
          breakMinutes: 0,
          sessions: []
        };
      }
      
      const user = userSessions[session.UserId];
      const workMinutes = session.TotalWorkDuration || 0;
      const breakMinutes = session.BreakDuration || 0;
      
      user.workMinutes += workMinutes;
      user.breakMinutes += breakMinutes;
      user.sessions.push({
        startTime: session.StartTime,
        endTime: session.EndTime,
        workMinutes,
        breakMinutes,
        workSummary: session.WorkSummary || null
      });
    }
    
    return Object.values(userSessions);
  } catch (error) {
    console.error('Error getting daily report:', error);
    throw error;
  }
}

/**
 * Get weekly report by user with work summaries
 * @param {Date} startDate - Start of the week
 * @param {Date} endDate - End of the week
 * @returns {Promise<Object>} - Object containing user activities grouped by day
 */
async function getWeeklyReportByUser(startDate, endDate) {
  const params = {
    TableName: SESSIONS_TABLE,
    FilterExpression: 'StartTime BETWEEN :start AND :end',
    ExpressionAttributeValues: {
      ':start': startDate.toISOString(),
      ':end': endDate.toISOString()
    }
  };
  
  try {
    const response = await docClient.send(new ScanCommand(params));
    const sessions = response.Items || [];
    
    // Group sessions by user and day
    const userReports = {};
    
    for (const session of sessions) {
      if (!userReports[session.UserId]) {
        userReports[session.UserId] = {
          username: session.Username,
          totalWorkMinutes: 0,
          totalBreakMinutes: 0,
          days: {}
        };
      }
      
      const user = userReports[session.UserId];
      const sessionDate = new Date(session.StartTime).toISOString().split('T')[0];
      
      if (!user.days[sessionDate]) {
        user.days[sessionDate] = {
          date: session.StartTime,
          workMinutes: 0,
          breakMinutes: 0,
          summaries: []
        };
      }
      
      const dayData = user.days[sessionDate];
      const workMinutes = session.TotalWorkDuration || 0;
      const breakMinutes = session.BreakDuration || 0;
      
      dayData.workMinutes += workMinutes;
      dayData.breakMinutes += breakMinutes;
      user.totalWorkMinutes += workMinutes;
      user.totalBreakMinutes += breakMinutes;
      
      if (session.WorkSummary) {
        dayData.summaries.push({
          startTime: session.StartTime,
          endTime: session.EndTime,
          summary: session.WorkSummary
        });
      }
    }
    
    return userReports;
  } catch (error) {
    console.error('Error getting weekly report:', error);
    throw error;
  }
}

/**
 * Store a user's channel mapping in DynamoDB
 * @param {string} userId - Discord user ID
 * @param {string} channelId - Discord channel ID
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<boolean>} - Success status
 */
async function storeUserChannelMapping(userId, channelId, guildId) {
  try {
    const now = new Date().toISOString();
    
    const params = {
      TableName: LOGS_TABLE,
      Item: {
        id: `CHANNEL:${userId}:${guildId}`,
        UserId: userId,
        ChannelId: channelId,
        GuildId: guildId,
        Type: 'ChannelMapping',
        Timestamp: now,
        UpdatedAt: now
      }
    };
    
    await docClient.send(new PutCommand(params));
    console.log(`Stored channel mapping for user ${userId}: ${channelId}`);
    return true;
  } catch (error) {
    console.error('Error storing user channel mapping:', error);
    return false;
  }
}

/**
 * Get a user's channel mapping from DynamoDB
 * @param {string} userId - Discord user ID
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string|null>} - Channel ID or null if not found
 */
async function getUserChannelMapping(userId, guildId) {
  try {
    const params = {
      TableName: LOGS_TABLE,
      Key: {
        id: `CHANNEL:${userId}:${guildId}`
      }
    };
    
    const response = await docClient.send(new GetCommand(params));
    
    if (response.Item && response.Item.ChannelId) {
      console.log(`Retrieved channel mapping for user ${userId}: ${response.Item.ChannelId}`);
      return response.Item.ChannelId;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting user channel mapping:', error);
    return null;
  }
}

/**
 * Get all user channel mappings for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Object>} - Object mapping user IDs to channel IDs
 */
async function getAllUserChannelMappings(guildId) {
  try {
    const params = {
      TableName: LOGS_TABLE,
      FilterExpression: 'begins_with(id, :prefix) AND GuildId = :guildId AND #type = :type',
      ExpressionAttributeNames: {
        '#type': 'Type'
      },
      ExpressionAttributeValues: {
        ':prefix': 'CHANNEL:',
        ':guildId': guildId,
        ':type': 'ChannelMapping'
      }
    };
    
    const response = await docClient.send(new ScanCommand(params));
    
    const mappings = {};
    for (const item of response.Items || []) {
      mappings[item.UserId] = item.ChannelId;
    }
    
    console.log(`Retrieved ${Object.keys(mappings).length} channel mappings for guild ${guildId}`);
    return mappings;
  } catch (error) {
    console.error('Error getting all user channel mappings:', error);
    return {};
  }
}

/**
 * Get all active sessions (Working or Break)
 * @returns {Promise<Array>} - Array of active session objects
 */
async function getAllActiveSessions() {
  console.log('Getting all active sessions from DynamoDB...');
  
  // First try with the standard query
  const params = {
    TableName: SESSIONS_TABLE,
    FilterExpression: '(#status = :working OR #status = :break) AND (attribute_not_exists(EndTime) OR EndTime = :null)',
    ExpressionAttributeNames: {
      '#status': 'Status'
    },
    ExpressionAttributeValues: {
      ':working': 'Working',
      ':break': 'Break',
      ':null': null
    }
  };
  
  try {
    console.log('Executing query:', JSON.stringify(params, null, 2));
    const response = await docClient.send(new ScanCommand(params));
    console.log(`Found ${response.Items?.length || 0} active sessions with standard query`);
    
    // If no results, try a broader query that just checks status
    if (!response.Items || response.Items.length === 0) {
      console.log('No active sessions found with standard query, trying broader query...');
      
      const broadParams = {
        TableName: SESSIONS_TABLE,
        FilterExpression: '#status = :working OR #status = :break',
        ExpressionAttributeNames: {
          '#status': 'Status'
        },
        ExpressionAttributeValues: {
          ':working': 'Working',
          ':break': 'Break'
        }
      };
      
      console.log('Executing broader query:', JSON.stringify(broadParams, null, 2));
      const broadResponse = await docClient.send(new ScanCommand(broadParams));
      console.log(`Found ${broadResponse.Items?.length || 0} sessions with Working/Break status`);
      
      // Log first few records for debugging
      if (broadResponse.Items && broadResponse.Items.length > 0) {
        console.log('Sample record:', JSON.stringify(broadResponse.Items[0], null, 2));
      }
      
      // Return sessions without EndTime or with EndTime = null
      const activeSessions = (broadResponse.Items || []).filter(session => 
        !session.EndTime || session.EndTime === null
      );
      
      console.log(`After filtering, found ${activeSessions.length} active sessions`);
      return activeSessions;
    }
    
    return response.Items;
  } catch (error) {
    console.error('Error getting active sessions:', error);
    return [];
  }
}

module.exports = {
  startUserSession,
  getActiveSession,
  updateSessionStatus,
  recordBreak,
  recordReturnFromBreak,
  recordBackFromBreak,
  endUserSession,
  recordUpdate,
  getCurrentWorkDuration,
  logActivity,
  getWeeklyReport,
  getDailyActivityBreakdown,
  getDailyReport,
  getWeeklyReportByUser,
  storeUserChannelMapping,
  getUserChannelMapping,
  getAllUserChannelMappings,
  getAllActiveSessions
}; 