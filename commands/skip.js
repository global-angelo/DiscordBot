const { SlashCommandBuilder } = require('discord.js');
const { useMainPlayer } = require('discord-player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song'),
    
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
        
        if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '❌ | No music is being played!', ephemeral: true });
        }
        
        try {
            // Check if user is in the same voice channel as the bot
            if (queue.connection.channel.id !== voiceChannel.id) {
                return interaction.reply({ content: `❌ | You must be in the same voice channel as the bot to use this command!`, ephemeral: true });
            }
            
            const currentTrack = queue.currentTrack;
            
            // Skip the current track
            await queue.node.skip();
            
            return interaction.reply({ content: `⏭️ | Skipped **${currentTrack.title}**!` });
        } catch (error) {
            console.error(error);
            return interaction.reply({ content: `❌ | An error occurred: ${error.message}`, ephemeral: true });
        }
    },
}; 