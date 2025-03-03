/**
 * Restart script for Discord bot
 * This script:
 * 1. Finds any running instances of the bot
 * 2. Terminates them
 * 3. Starts a new instance 
 */

const { spawn, exec } = require('child_process');
const path = require('path');

console.log('Checking for existing bot processes...');

// Use different commands based on platform
const isWindows = process.platform === 'win32';
const findCommand = isWindows ? 
  'tasklist /fi "imagename eq node.exe" /fo csv /nh' : 
  'ps aux | grep "node.*index.js" | grep -v grep';

exec(findCommand, async (error, stdout, stderr) => {
  if (error) {
    console.error(`Error checking for processes: ${error.message}`);
    return;
  }
  
  let processesToKill = [];
  
  if (isWindows) {
    // Parse Windows tasklist output
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (line.includes('node.exe')) {
        const match = /^"node.exe","(\d+)"/.exec(line);
        if (match && match[1]) {
          processesToKill.push(match[1]);
        }
      }
    }
  } else {
    // Parse Unix ps output
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (line.trim() !== '') {
        const parts = line.trim().split(/\s+/);
        if (parts.length > 1) {
          processesToKill.push(parts[1]);
        }
      }
    }
  }
  
  if (processesToKill.length > 0) {
    console.log(`Found ${processesToKill.length} bot processes to terminate.`);
    
    // Kill each process
    for (const pid of processesToKill) {
      const killCommand = isWindows ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`;
      
      try {
        console.log(`Terminating process ${pid}...`);
        exec(killCommand);
      } catch (killError) {
        console.error(`Error terminating process ${pid}: ${killError.message}`);
      }
    }
    
    // Wait a moment for processes to terminate
    console.log('Waiting for processes to terminate...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  } else {
    console.log('No existing bot processes found.');
  }
  
  // Start the bot
  console.log('Starting new bot instance...');
  const bot = spawn('node', ['index.js'], {
    detached: true,
    stdio: 'inherit'
  });
  
  bot.on('error', (err) => {
    console.error('Failed to start bot:', err);
  });
  
  console.log(`Bot started with PID: ${bot.pid}`);
}); 