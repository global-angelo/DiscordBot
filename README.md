# Ferret9 Discord Bot

A Discord bot for tracking team member activity, managing work status, and generating reports.

## Features

- Sign-in/Sign-out tracking
- Status updates
- Break management
- Voice channel integration
- Activity logging
- Administrative features
- Scheduled update reminders

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   BOT_TOKEN=your_discord_bot_token
   CLIENT_ID=your_discord_application_id
   AWS_REGION=your_aws_region
   AWS_ACCESS_KEY_ID=your_aws_access_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key
   DYNAMODB_USER_ACTIVITY_TABLE=UserActivity
   ```
4. Configure the bot settings in `config/config.js`:
   - Set up channel IDs
   - Configure update reminder settings (role ID, interval, channel)
   - Adjust other settings as needed
5. Register slash commands:
   ```
   node deploy-commands.js
   ```
6. Start the bot:
   ```
   node index.js
   ```

## Required Channels

The bot expects the following channels to exist in your Discord server:
- `test-bot` - For testing and bot status messages
- Team channel (configurable)
- Updates channel (configurable)
- Activity log channel (configurable)

## Commands

- `/start` - Creates your personal log channel and provides detailed instructions on using the bot
- `/signin` - Sign in for work
- `/signout [summary]` - Sign out with a summary of work done
- `/update [message]` - Post a status update
- `/break [reason]` - Indicate you're taking a break
- `/back` - Indicate you've returned from a break
- `/config channel [type] [#channel]` - Configure notification channels
- `/report [daily/weekly]` - Generate activity reports
- `/weeklyreport user:[user] date_range:[YYYY-MM-DD:YYYY-MM-DD]` - Generate a weekly report for a specific user (Admin only)

## Command Details

### `/start`

The `/start` command is the first command new users should run. It:

1. Creates a personal log channel for the user
2. Provides a comprehensive welcome message with:
   - Overview of available commands
   - Explanation of work status roles
   - Best practices for using the bot
3. Sends detailed guides on:
   - How to use each command effectively
   - A typical workflow for using the bot throughout the day
   - Formatting tips for updates and summaries
   - Best practices for documentation

**Usage:**
```
/start
```

**Example Output:**
- Creates a personal channel named after the user
- Sends welcome embeds with command information
- Provides a workflow guide for daily use
- Includes formatting tips for effective documentation
- Confirms channel creation with an ephemeral message

### `/weeklyreport`

The `/weeklyreport` command allows administrators to generate detailed activity reports for specific users within a date range.

1. Provides a comprehensive overview of a user's activity including:
   - Sign-ins and sign-outs
   - Work updates
   - Breaks and returns
   - Summaries of completed work

2. Features:
   - Restricted to users with Administrator permissions
   - Results are only visible to the person who runs the command
   - Supports custom date ranges for flexible reporting
   - Collects data from both the user's log channel and the database

**Usage:**
```
/weeklyreport user:@username date_range:2023-06-01:2023-06-07
```

**Parameters:**
- `user` - The Discord user to generate a report for (mention or select from list)
- `date_range` - Date range in format YYYY-MM-DD:YYYY-MM-DD (start:end)

**Example Output:**
- Summary embed with activity counts
- Detailed sign-in/sign-out information
- Work updates with timestamps
- Break activity with reasons
- All information is presented in chronological order

### Other Commands

## Update Reminders

The bot includes a feature to automatically remind users with a specific role to provide updates at regular intervals.

### Configuration

In the `config/config.js` file, you can configure the following settings:

```javascript
updateReminders: {
  roleId: 'UPDATE_REQUIRED_ROLE_ID',  // Replace with the ID of the role that needs to provide updates
  intervalHours: 4,                   // How often to remind users (in hours)
  channelId: 'UPDATES_CHANNEL_ID'     // Channel to send reminders to
}
```

### How It Works

1. The bot checks every hour if it's time to send a reminder (based on the configured interval)
2. When it's time, it sends a reminder message to the specified channel
3. The message mentions the configured role and includes instructions on how to provide an update
4. Users with the role will receive a notification and can use the `/update` command to share their progress

### Customization

You can customize:
- Which role receives reminders
- How frequently reminders are sent (every X hours)
- Which channel reminders are sent to

### Example Reminder

The reminder includes:
- A mention of the role that needs to provide updates
- Instructions on how to use the `/update` command
- Information about why regular updates are important
- When the next reminder will be sent

## Development

To add new commands, create a new file in the `commands` directory following the structure of existing commands.

To add new event handlers, create a new file in the `events` directory following the structure of existing events.

## DynamoDB Integration

The Ferret9 Discord Bot now uses Amazon DynamoDB for persistent data storage. This provides several benefits:

1. **Data Persistence**: All user activity data is stored persistently, surviving bot restarts
2. **Scalability**: DynamoDB can handle large amounts of data as your team grows
3. **Reliability**: AWS's managed service ensures high availability and durability
4. **Advanced Querying**: Enables more sophisticated reporting capabilities

### DynamoDB Tables

The bot uses two main tables:

1. **UserSessions**: Stores work session data
   - Partition Key: `UserId` (Discord user ID)
   - Sort Key: `SessionId` (Timestamp of session start)
   - Attributes: StartTime, EndTime, TotalWorkDuration, BreakDuration, Status, etc.

2. **ActivityLogs**: Stores detailed activity logs
   - Partition Key: `UserId` (Discord user ID)
   - Sort Key: `Timestamp` (When the activity occurred)
   - Attributes: ActivityType, Details, Duration, etc.

### Activity Types

The bot tracks several types of activities:
- `SignIn`: When a user starts a work session
- `Break`: When a user takes a break
- `BackFromBreak`: When a user returns from a break
- `SignOut`: When a user ends their work session
- `Update`: When a user provides a work update

### Setup

To set up the DynamoDB integration:

1. Create an AWS account if you don't have one
2. Create an IAM user with DynamoDBFullAccess permissions
3. Add your AWS credentials to the `.env` file:
   ```
   AWS_REGION=your-region
   AWS_ACCESS_KEY_ID=your-access-key
   AWS_SECRET_ACCESS_KEY=your-secret-key
   DYNAMODB_SESSIONS_TABLE=UserSessions
   DYNAMODB_LOGS_TABLE=ActivityLogs
   ```
4. Run the setup script to create the required tables:
   ```
   node setup-dynamodb.js
   ```

### Security Note

Always keep your AWS credentials secure and never commit them to version control. Consider using AWS IAM roles for production deployments 