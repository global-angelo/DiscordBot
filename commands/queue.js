const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { useMainPlayer } = require('discord-player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('View the current music queue'),
    
    async execute(interaction) {
        // Get the player instance
        const player = useMainPlayer();
        
        // Get the queue for the guild
        const queue = player.nodes.get(interaction.guildId);
        
        if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '❌ | No music is being played!', ephemeral: true });
        }
        
        try {
            // Get the tracks in the queue
            const tracks = queue.tracks.toArray();
            const currentTrack = queue.currentTrack;
            
            if (!currentTrack) {
                return interaction.reply({ content: '❌ | No music is currently playing!', ephemeral: true });
            }
            
            // Create an embed to display the queue
            const embed = new EmbedBuilder()
                .setTitle('Music Queue')
                .setColor('#FF0000') // YouTube red color
                .setThumbnail(currentTrack.thumbnail)
                .setTimestamp();
            
            // Add the current track to the embed
            embed.addFields({
                name: '🎵 Now Playing',
                value: `**${currentTrack.title}** - ${currentTrack.author} (${currentTrack.duration})`,
            });
            
            // Add the next tracks to the embed
            if (tracks.length > 0) {
                // Get the next 10 tracks or fewer
                const nextTracks = tracks.slice(0, 10);
                
                let description = nextTracks.map((track, index) => {
                    return `${index + 1}. **${track.title}** - ${track.author} (${track.duration})`;
                }).join('\n');
                
                embed.addFields({
                    name: '🎶 Up Next',
                    value: description,
                });
                
                // If there are more tracks than shown
                if (tracks.length > 10) {
                    embed.addFields({
                        name: '• • •',
                        value: `And ${tracks.length - 10} more tracks...`,
                    });
                }
            } else {
                embed.addFields({
                    name: '🎶 Up Next',
                    value: 'No tracks in queue',
                });
            }
            
            return interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            return interaction.reply({ content: `❌ | An error occurred: ${error.message}`, ephemeral: true });
        }
    },
}; 