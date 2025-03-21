require('dotenv').config();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Starting bot deployment process...');

// Ensure we're in the project root directory
const projectRoot = __dirname;
console.log(`Project root: ${projectRoot}`);

// Check if node_modules exists, if not run npm install
if (!fs.existsSync(path.join(projectRoot, 'node_modules'))) {
  console.log('Node modules not found. Running npm install...');
  exec('npm install', { cwd: projectRoot }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error running npm install: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`npm install stderr: ${stderr}`);
    }
    console.log(`npm install stdout: ${stdout}`);
    startBot();
  });
} else {
  startBot();
}

function startBot() {
  console.log('Starting bot...');
  
  // Kill any existing node processes (optional)
  // NOTE: This will kill ALL node processes, use with caution
  // exec('taskkill /F /IM node.exe', (error) => {
  //   if (error) {
  //     console.log('No existing node processes found or unable to kill them.');
  //   } else {
  //     console.log('Killed existing node processes.');
  //   }
  
  // Start the bot
  const child = exec('node index.js', { cwd: projectRoot });
  
  child.stdout.on('data', (data) => {
    console.log(`Bot stdout: ${data}`);
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Bot stderr: ${data}`);
  });
  
  child.on('close', (code) => {
    console.log(`Bot process exited with code ${code}`);
  });
  
  console.log('Bot started successfully!');
  console.log('Press Ctrl+C to stop the bot.');
} 