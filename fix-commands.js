/**
 * Quick fix script for command files
 * This script fixes the syntax error in command files
 * where there is a }}; pattern that needs to be replaced
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
    
    // Fix the }}, syntax error that's causing JavaScript to fail
    content = content.replace(/\s*\}\},\s*\};/g, '\n      }\n    }\n  },\n};');
    
    // Also fix any other instances of }}, that might be in the file
    content = content.replace(/\s*\}\},\s*\w+/g, '\n      }\n    }\n  },\n$1');
    
    // Handle the standalone }}, pattern
    content = content.replace(/\s*\}\},\s*$/gm, '\n      }\n    }\n  },');
    
    // Only write if there were changes
    if (content !== originalContent) {
      // Backup the original file if it doesn't exist
      const backupPath = `${filePath}.syntax.bak`;
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

// Manual fix for specific files
async function manuallyFixFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    
    // Create backup
    await fs.writeFile(`${filePath}.manual.bak`, content);
    
    // Find the problematic section
    const matches = content.match(/catch \(replyError\) {[\s\S]*?console\.error\([^\)]+\);[\s\S]*?\}\},/);
    
    if (matches) {
      const fixedContent = content.replace(
        /catch \(replyError\) {[\s\S]*?console\.error\([^\)]+\);[\s\S]*?\}\},/, 
        `catch (replyError) {
        console.error('Error sending error message:', replyError);
      }
    }
  },`
      );
      
      await fs.writeFile(filePath, fixedContent);
      console.log(`✅ Manually fixed: ${filePath}`);
    } else {
      console.log(`No matching pattern found for manual fix in: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error manually fixing file ${filePath}:`, error);
  }
}

async function fixCommands() {
  try {
    console.log('Starting command fixes...');
    
    // Get all JS files in the commands directory
    const files = await fs.readdir(commandsDir);
    const commandFiles = files.filter(file => file.endsWith('.js') && !file.endsWith('.bak'));
    
    console.log(`Found ${commandFiles.length} command files to process.`);
    
    // First, manually fix a few files to see if our pattern works
    const sampleFiles = ['ping.js', 'signin.js', 'signout.js', 'back.js', 'break.js'];
    for (const file of sampleFiles) {
      const filePath = path.join(commandsDir, file);
      try {
        await fs.access(filePath);
        await manuallyFixFile(filePath);
      } catch (err) {
        console.log(`File ${file} not found, skipping.`);
      }
    }
    
    // Then try the automatic fix for all files
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