require('dotenv').config();
const { DynamoDBClient, CreateTableCommand, ListTablesCommand, DeleteTableCommand } = require('@aws-sdk/client-dynamodb');

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Table names from .env
const SESSIONS_TABLE = process.env.DYNAMODB_SESSIONS_TABLE;
const LOGS_TABLE = process.env.DYNAMODB_LOGS_TABLE;

// Function to create a table
async function createTable(tableName) {
  const params = {
    TableName: tableName,
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' } // Partition key
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' } // String
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  };

  try {
    const data = await client.send(new CreateTableCommand(params));
    console.log(`Created table: ${tableName}`);
    return data;
  } catch (err) {
    if (err.name === 'ResourceInUseException') {
      console.log(`Table ${tableName} already exists.`);
    } else {
      console.error(`Error creating table ${tableName}:`, err);
    }
  }
}

// Function to delete a table
async function deleteTable(tableName) {
  try {
    const data = await client.send(new DeleteTableCommand({ TableName: tableName }));
    console.log(`Deleted table: ${tableName}`);
    return data;
  } catch (err) {
    console.error(`Error deleting table ${tableName}:`, err);
  }
}

// Function to check if a table exists
async function tableExists(tableName) {
  try {
    const data = await client.send(new ListTablesCommand({}));
    return data.TableNames.includes(tableName);
  } catch (err) {
    console.error('Error listing tables:', err);
    return false;
  }
}

// Main function to set up tables
async function setupTables() {
  console.log('Setting up DynamoDB tables...');
  
  // Check if tables exist
  const sessionsExists = await tableExists(SESSIONS_TABLE);
  const logsExists = await tableExists(LOGS_TABLE);
  
  // Ask user if they want to recreate existing tables
  if (sessionsExists || logsExists) {
    console.log('One or more tables already exist:');
    if (sessionsExists) console.log(`- ${SESSIONS_TABLE}`);
    if (logsExists) console.log(`- ${LOGS_TABLE}`);
    
    // In a real interactive environment, we would ask for confirmation here
    // Since this is a script, we'll proceed with recreation
    console.log('Recreating tables to ensure correct structure...');
    
    if (sessionsExists) await deleteTable(SESSIONS_TABLE);
    if (logsExists) await deleteTable(LOGS_TABLE);
    
    // Wait a moment for deletion to complete
    console.log('Waiting for tables to be deleted...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  // Create tables
  await createTable(SESSIONS_TABLE);
  await createTable(LOGS_TABLE);
  
  console.log('DynamoDB setup complete!');
}

// Run the setup
setupTables().catch(err => {
  console.error('Error setting up DynamoDB:', err);
}); 