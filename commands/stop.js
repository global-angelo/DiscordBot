const { SlashCommandBuilder } = require('discord.js');
const { useMainPlayer } = require('discord-player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playing music and disconnect the bot'),
    
    async execute(interaction) {
        // Check if the user is in a voice channel
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: 'You need to be in a voice channel to use this command!', ephemeral: true });
        }
        
        // Get the player instance
        const player = useMainPlayer();
        
        // Get the queue for the guild
        const queue = player.nodes.get(interaction.guildId);
        
        if (!queue) {
            return interaction.reply({ content: '❌ | No music is being played!', ephemeral: true });
        }
        
        try {
            // Check if user is in the same voice channel as the bot
            // Make sure queue.connection and queue.connection.channel exist before accessing id
            if (!queue.connection || !queue.connection.channel || queue.connection.channel.id !== voiceChannel.id) {
                return interaction.reply({ content: `❌ | You must be in the same voice channel as the bot to use this command!`, ephemeral: true });
            }
            
            // Delete the queue (stops music and disconnects)
            queue.delete();
            
            return interaction.reply({ content: '🛑 | Music playback stopped and disconnected from voice channel!' });
        } catch (error) {
            console.error('Error executing stop command:', error);
            return interaction.reply({ content: `❌ | An error occurred: ${error.message}`, ephemeral: true });
        }
    },
}; 