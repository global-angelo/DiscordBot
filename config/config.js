module.exports = {
  // Channel IDs - Replace with actual channel IDs from your server
  channels: {
    team: '1345428260799910000', //1345428260799910000
    updates: '1345429377915293737',  // Ping channel ID
    activityLog: '1345393272612327474',
    dailyReport: '1346077454724501536',
    weeklyReport: '1346077972037111859'
  },
  
  // Category IDs
  categories: {
    workLog: '1345403690034659459',  // Regular work log category
    intern: '1345976516487413812'    // Intern category
  },
  
  // Reminder times (24-hour format)
  reminderTimes: [
    { hour: 10, minute: 0 },  // 10:00 AM
    { hour: 14, minute: 0 },  // 2:00 PM
    { hour: 21, minute: 0 },  // 9:00 PM
    { hour: 2, minute: 0 }    // 2:00 AM
  ],
  
  // Update reminder settings
  updateReminders: {
    roleId: '1345394475165548615',  // Using Working role for update reminders
    intervalHours: 4,           // How often to remind users (in hours)
    channelId: '1345428260799910000' // Ping channel ID
  },
  
  // Role IDs
  roles: {
    intern: '1345978186206285845',  // Intern role ID
    working: '1345394475165548615',  // Working role ID
    onBreak: '1345394581642022933'   // On Break role ID
  },
  
  // Timezone settings
  timezone: 'Asia/Manila' // UTC+8 Manila timezone
}; 