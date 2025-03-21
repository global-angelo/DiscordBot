const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { useMainPlayer, QueryType } = require('discord-player');
const { VoiceConnectionStatus, AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play music from YouTube, SoundCloud, or direct URLs')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The song title or URL to play')
                .setRequired(true)),
    
    async execute(interaction) {
        // Defer reply to give time for processing
        await interaction.deferReply();
        
        // Check if the user is in a voice channel
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.followUp({ content: 'You need to be in a voice channel to use this command!', ephemeral: true });
        }
        
        try {
            const player = useMainPlayer();
            
            // Get the search query from the user's command
            const query = interaction.options.getString('query');
            
            // Determine if the query is a URL
            const isUrl = query.startsWith('http://') || query.startsWith('https://');
            const isYouTubeUrl = isUrl && (query.includes('youtube.com') || query.includes('youtu.be'));
            const isSoundCloudUrl = isUrl && query.includes('soundcloud.com');
            const isDirectMediaUrl = isUrl && (query.endsWith('.mp3') || query.endsWith('.ogg') || query.endsWith('.wav') || query.endsWith('.m4a'));
            
            console.log(`[Player] Processing ${isDirectMediaUrl ? 'Direct Media URL' : isSoundCloudUrl ? 'SoundCloud URL' : isYouTubeUrl ? 'YouTube URL' : isUrl ? 'URL' : 'search query'}: ${query}`);
            
            // Try multiple search approaches for better reliability
            let searchResult = null;
            let searchError = null;
            
            try {
                // Handle different types of inputs
                if (isDirectMediaUrl) {
                    // Direct media file URL - fastest option
                    console.log(`[Player] Processing direct media URL`);
                    searchResult = await player.search(query, {
                        requestedBy: interaction.user,
                        searchEngine: 'arbitrary'
                    });
                } else if (isSoundCloudUrl) {
                    // SoundCloud URL - faster than YouTube
                    console.log(`[Player] Searching with soundcloud engine`);
                    searchResult = await player.search(query, {
                        requestedBy: interaction.user,
                        searchEngine: 'soundcloud'
                    });
                } else if (isYouTubeUrl) {
                    // Direct YouTube URL handling
                    console.log(`[Player] Searching with youtube_video engine`);
                    searchResult = await player.search(query, {
                        requestedBy: interaction.user,
                        searchEngine: 'youtube_video'
                    });
                } else {
                    // For regular searches, try with auto engine first (which should use the best available source)
                    console.log(`[Player] Searching with auto engine`);
                    searchResult = await player.search(query, {
                        requestedBy: interaction.user,
                        searchEngine: 'auto'
                    });
                    
                    // If no results, try with soundcloud engine (often faster than YouTube)
                    if (!searchResult || searchResult.tracks.length === 0) {
                        console.log(`[Player] No results with auto engine, trying soundcloud engine`);
                        searchResult = await player.search(query, {
                            requestedBy: interaction.user,
                            searchEngine: 'soundcloud'
                        });
                    }
                    
                    // If still no results, try with youtube engine
                    if (!searchResult || searchResult.tracks.length === 0) {
                        console.log(`[Player] No results with soundcloud engine, trying youtube engine`);
                        searchResult = await player.search(query, {
                            requestedBy: interaction.user,
                            searchEngine: 'youtube'
                        });
                    }
                    
                    // Last resort, try youtube_music
                    if (!searchResult || searchResult.tracks.length === 0) {
                        console.log(`[Player] No results with youtube engine, trying youtube_music engine`);
                        searchResult = await player.search(query, {
                            requestedBy: interaction.user,
                            searchEngine: 'youtube_music'
                        });
                    }
                }
            } catch (error) {
                searchError = error;
                console.error(`[Player] Search error:`, error);
            }
            
            // Check if we have results
            if (!searchResult || searchResult.tracks.length === 0) {
                console.log(`[Player] No results found for query: ${query}`);
                return interaction.followUp({ 
                    content: `❌ | No results found for "${query}"!\n${searchError ? `Error: ${searchError.message}` : ''}`, 
                    ephemeral: true 
                });
            }
            
            // Get the top result
            const track = searchResult.tracks[0];
            console.log(`[Player] Top result: "${track.title}" by ${track.author}`);
            
            // Create a new queue or get existing queue with better options
            const queue = player.nodes.create(interaction.guild, {
                metadata: {
                    channel: interaction.channel,
                    client: interaction.client,
                    requestedBy: interaction.user
                },
                bufferingTimeout: 15000, // Higher timeout for buffering (15 seconds)
                connectionTimeout: 35000, // Higher connection timeout (35 seconds)
                leaveOnStop: false, // Don't leave on stop to prevent unnecessary reconnections
                leaveOnEmpty: true, // Leave when channel is empty
                leaveOnEmptyCooldown: 300000, // 5 minutes
                leaveOnEnd: false, // Don't leave when queue ends to reduce reconnection issues
                skipOnNoStream: true, // Skip tracks that can't be played
                selfDeaf: true,
                volume: 80,
                ytdlOptions: {
                    filter: 'audioonly',
                    quality: 'highestaudio',
                    highWaterMark: 1 << 25, // 32MB buffer
                }
            });
            
            // Connect to the voice channel with better error handling
            if (!queue.connection) {
                try {
                    console.log(`[Player] Connecting to voice channel ${voiceChannel.name}...`);
                    await queue.connect(voiceChannel);
                    console.log(`[Player] Successfully connected to voice channel ${voiceChannel.name}`);
                } catch (err) {
                    // Destroy the queue if connection fails
                    queue.delete();
                    console.error(`[Player] Connection error:`, err);
                    return interaction.followUp({ content: `❌ | Could not join your voice channel: ${err.message}`, ephemeral: true });
                }
            }
            
            // Add track with error handling
            try {
                await queue.addTrack(track);
                console.log(`[Player] Added track: ${track.title}`);
            } catch (error) {
                console.error('Error adding track to queue:', error);
                return interaction.followUp({ content: `❌ | Error adding track to queue: ${error.message}`, ephemeral: true });
            }
            
            // Start playback if not already playing
            if (!queue.isPlaying()) {
                try {
                    console.log(`[Player] Starting playback of ${track.title}`);
                    await queue.node.play();
                } catch (error) {
                    console.error('Error starting playback:', error);
                    return interaction.followUp({ content: `❌ | Error starting playback: ${error.message}`, ephemeral: true });
                }
            }
            
            // Create a nice embed for the track
            const embed = new EmbedBuilder()
                .setTitle('🎵 Now Playing')
                .setDescription(`**[${track.title}](${track.url})**`)
                .addFields(
                    { name: 'Artist', value: track.author, inline: true },
                    { name: 'Duration', value: track.duration, inline: true },
                    { name: 'Source', value: getSourceName(searchResult.source), inline: true }
                )
                .setThumbnail(track.thumbnail)
                .setColor(getSourceColor(searchResult.source))
                .setFooter({ text: `Requested by ${interaction.user.tag}` });
                
            // For search queries, make it clear we're playing the top result
            if (!isUrl) {
                embed.setDescription(`**Top result for "${query}"**\n**[${track.title}](${track.url})**`);
            }
            
            return interaction.followUp({
                embeds: [embed]
            });
            
        } catch (error) {
            console.error('Play command error:', error);
            return interaction.followUp({
                content: `❌ | An error occurred: ${error.message}`,
                ephemeral: true
            });
        }
    },
};

// Helper function to get a friendly name for the source
function getSourceName(source) {
    switch(source) {
        case 'youtube': return 'YouTube';
        case 'soundcloud': return 'SoundCloud';
        case 'arbitrary': return 'Direct File';
        default: return source || 'Unknown';
    }
}

// Helper function to get a color for the source
function getSourceColor(source) {
    switch(source) {
        case 'youtube': return '#FF0000'; // YouTube red
        case 'soundcloud': return '#FF7700'; // SoundCloud orange
        case 'arbitrary': return '#00AAFF'; // Blue for direct files
        default: return '#7289DA'; // Discord blue
    }
} 