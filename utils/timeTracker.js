// In-memory storage for user session times
const userSessions = new Map();

/**
 * Start tracking time for a user
 * @param {string} userId - The user's ID
 */
function startSession(userId) {
    userSessions.set(userId, {
        startTime: new Date(),
        breaks: []
    });
}

/**
 * Record a break for a user
 * @param {string} userId - The user's ID
 */
function startBreak(userId) {
    const session = userSessions.get(userId);
    if (session) {
        session.breaks.push({
            startTime: new Date(),
            endTime: null
        });
    }
}

/**
 * End the current break for a user
 * @param {string} userId - The user's ID
 */
function endBreak(userId) {
    const session = userSessions.get(userId);
    if (session && session.breaks.length > 0) {
        const currentBreak = session.breaks[session.breaks.length - 1];
        if (!currentBreak.endTime) {
            currentBreak.endTime = new Date();
        }
    }
}

/**
 * Calculate total break duration in milliseconds
 * @param {Array} breaks - Array of break periods
 * @returns {number} Total break duration in milliseconds
 */
function calculateBreakDuration(breaks) {
    return breaks.reduce((total, breakPeriod) => {
        if (breakPeriod.endTime) {
            return total + (breakPeriod.endTime - breakPeriod.startTime);
        }
        return total;
    }, 0);
}

/**
 * Get current session duration for a user
 * @param {string} userId - The user's ID
 * @returns {Object|null} Session duration info or null if no session
 */
function getCurrentSession(userId) {
    const session = userSessions.get(userId);
    if (!session) return null;

    const now = new Date();
    const totalDuration = now - session.startTime;
    const breakDuration = calculateBreakDuration(session.breaks);
    const workDuration = totalDuration - breakDuration;

    return {
        totalDuration,
        breakDuration,
        workDuration,
        startTime: session.startTime,
        breaks: session.breaks
    };
}

/**
 * End and remove a user's session
 * @param {string} userId - The user's ID
 * @returns {Object|null} Final session info or null if no session
 */
function endSession(userId) {
    const sessionInfo = getCurrentSession(userId);
    userSessions.delete(userId);
    return sessionInfo;
}

/**
 * Format duration in milliseconds to human readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    
    const parts = [];
    
    if (hours > 0) {
        parts.push(`${hours}h`);
    }
    
    parts.push(`${remainingMinutes}m`);
    parts.push(`${remainingSeconds}s`);
    
    return parts.join(' ');
}

module.exports = {
    startSession,
    startBreak,
    endBreak,
    getCurrentSession,
    endSession,
    formatDuration
}; 