/**
 * Migration script to update command files to use newer Discord.js syntax
 * 
 * This script:
 * 1. Updates all instances of ephemeral: true to flags: { ephemeral: true }
 * 2. Adds checks for interaction.replied || interaction.deferred
 * 3. Improves error handling patterns
 */

const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// Command files directory
const commandsDir = path.join(__dirname, 'commands');

// New interaction pattern template
const interactionCheckCode = `// Check if interaction was already replied to or deferred
      if (interaction.replied || interaction.deferred) {
        console.log('Interaction already handled. Skipping.');
        return;
      }
      
      `;

// Improved error handling template
const errorHandlingTemplate = `try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ An error occurred. Please try again.",
            flags: { ephemeral: true }
          }).catch(err => console.error('Error replying to interaction:', err));
        } else if (interaction.deferred && !interaction.replied) {
          await interaction.editReply({
            content: "❌ An error occurred. Please try again."
          }).catch(err => console.error('Error editing reply:', err));
        }
      } catch (replyError) {
        console.error('Error sending error message:', replyError);
      }`;

async function processFile(filePath) {
  console.log(`Processing file: ${filePath}`);
  
  try {
    // Read the file content
    let content = await fs.readFile(filePath, 'utf8');
    
    // Keep a copy of the original
    const originalContent = content;
    
    // Update ephemeral: true to flags: { ephemeral: true }
    // In interaction.reply
    content = content.replace(/interaction\.reply\(\s*{\s*content:/g, (match) => {
      return match;
    }).replace(/ephemeral:\s*true/g, 'flags: { ephemeral: true }');
    
    // In interaction.deferReply
    content = content.replace(/interaction\.deferReply\(\s*{\s*ephemeral:\s*true\s*}\)/g, 
                             'interaction.deferReply({ flags: { ephemeral: true } })');
    
    // Remove ephemeral: true from editReply calls since it's not needed
    content = content.replace(/await\s+interaction\.editReply\(\s*{\s*content:(.*?),\s*ephemeral:\s*true\s*}\)/g, 
                             'await interaction.editReply({ content:$1 })');
    
    // Look for the execute function to add the interaction check
    const executePattern = /async\s+execute\s*\(\s*interaction\s*\)\s*{\s*try\s*{/;
    if (executePattern.test(content)) {
      content = content.replace(executePattern, (match) => {
        return match + '\n' + interactionCheckCode;
      });
    }
    
    // Improve error handling in the catch block
    const catchPattern = /catch\s*\(\s*error\s*\)\s*{([\s\S]*?)(?=}\s*,|\}$)/;
    if (catchPattern.test(content)) {
      content = content.replace(catchPattern, (match, catchContent) => {
        // Keep the console.error line
        const consoleErrorLine = catchContent.match(/console\.error\([^\)]+\);/);
        if (consoleErrorLine) {
          return `catch (error) {\n      ${consoleErrorLine[0]}\n      ${errorHandlingTemplate}`;
        }
        return `catch (error) {\n      console.error('Error executing command:', error);\n      ${errorHandlingTemplate}`;
      });
    }
    
    // Fix any remaining }}, syntax errors
    content = content.replace(/\}\},(\s*\})/g, '}\n    }\n  },\n$1');
    
    // Only write if there were changes
    if (content !== originalContent) {
      // Backup the original file
      await fs.writeFile(`${filePath}.bak`, originalContent);
      
      // Write the updated content
      await fs.writeFile(filePath, content);
      console.log(`✅ Updated: ${filePath}`);
    } else {
      console.log(`No changes needed for: ${filePath}`);
    }
    
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
  }
}

async function migrateCommands() {
  try {
    console.log('Starting command migration...');
    
    // Get all JS files in the commands directory
    const files = await fs.readdir(commandsDir);
    const commandFiles = files.filter(file => file.endsWith('.js') && !file.endsWith('.bak'));
    
    console.log(`Found ${commandFiles.length} command files to process.`);
    
    // Process each file
    for (const file of commandFiles) {
      await processFile(path.join(commandsDir, file));
    }
    
    console.log('Migration complete!');
    
  } catch (error) {
    console.error('Error during migration:', error);
  }
}

// Run the migration
migrateCommands(); 