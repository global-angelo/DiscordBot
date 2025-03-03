/**
 * Fix script for ephemeral flag syntax
 * This script fixes the incorrect flags syntax in command files
 */

const fs = require('fs').promises;
const path = require('path');

// Command files directory
const commandsDir = path.join(__dirname, 'commands');

async function fixFile(filePath) {
  console.log(`Processing file: ${filePath}`);
  
  try {
    // Read the file content
    let content = await fs.readFile(filePath, 'utf8');
    
    // Keep a copy of the original
    const originalContent = content;
    
    // Fix the incorrect flags syntax
    content = content.replace(/flags: { flags: { ephemeral: true } }/g, 'ephemeral: true');
    content = content.replace(/flags: { ephemeral: true }/g, 'ephemeral: true');
    content = content.replace(/{ flags: { ephemeral: true } }/g, '{ ephemeral: true }');
    
    // Only write if there were changes
    if (content !== originalContent) {
      // Backup the original file if it doesn't exist
      const backupPath = `${filePath}.ephemeral.bak`;
      try {
        await fs.access(backupPath);
        console.log(`Backup already exists for ${filePath}`);
      } catch (err) {
        // File doesn't exist, create backup
        await fs.writeFile(backupPath, originalContent);
        console.log(`Created backup: ${backupPath}`);
      }
      
      // Write the updated content
      await fs.writeFile(filePath, content);
      console.log(`✅ Fixed: ${filePath}`);
    } else {
      console.log(`No changes needed for: ${filePath}`);
    }
    
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
  }
}

async function fixCommands() {
  try {
    console.log('Starting ephemeral flag fixes...');
    
    // Get all JS files in the commands directory
    const files = await fs.readdir(commandsDir);
    const commandFiles = files.filter(file => file.endsWith('.js') && !file.endsWith('.bak'));
    
    console.log(`Found ${commandFiles.length} command files to process.`);
    
    // Fix all command files
    for (const file of commandFiles) {
      await fixFile(path.join(commandsDir, file));
    }
    
    console.log('Fixes completed!');
    
  } catch (error) {
    console.error('Error during fixes:', error);
  }
}

// Run the fixes
fixCommands(); 