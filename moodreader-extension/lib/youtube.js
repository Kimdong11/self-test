/**
 * YouTube Integration Module
 * Handles video search and playback with multiple fallback methods
 */

// Piped API instances (more reliable than Invidious)
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.syncpundit.io',
  'https://api-piped.mha.fi'
];

// Invidious API instances as backup
const INVIDIOUS_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.protokolla.fi',
  'https://inv.nadeko.net',
  'https://invidious.privacyredirect.com',
  'https://iv.melmac.space'
];

/**
 * Curated playlists for each mood - these are long-play videos/live streams
 * that are reliable and won't get taken down easily
 */
const CURATED_VIDEOS = {
  // Lo-fi / Focus
  'lo-fi': [
    { videoId: 'jfKfPfyJRdk', title: 'lofi hip hop radio - beats to relax/study to' },
    { videoId: '5qap5aO4i9A', title: 'Lofi Hip Hop Radio - Beats to Sleep/Chill to' },
    { videoId: 'rUxyKA_-grg', title: 'Lofi Hip Hop Mix - Chill Beats' },
    { videoId: 'lTRiuFIWV54', title: 'Coffee Shop Radio - Chill Lofi Hip Hop Beats' }
  ],
  // Ambient / Calm
  'ambient': [
    { videoId: 'S_MOd40zlYU', title: 'Relaxing Ambient Music for Deep Focus' },
    { videoId: 'hlWiI4xVXKY', title: 'Ambient Study Music To Concentrate' },
    { videoId: 'w3gtLpZ1v5A', title: 'Ambient Music for Studying and Concentration' }
  ],
  // Classical / Piano
  'piano': [
    { videoId: '4Tr0otuiQuU', title: 'Classical Music for Studying & Brain Power' },
    { videoId: 'jgpJVI3tDbY', title: 'Beautiful Piano Music 24/7' },
    { videoId: 'BT0Gdy6bf4A', title: 'Peaceful Piano Music for Relaxation' }
  ],
  // Cinematic / Epic
  'cinematic': [
    { videoId: 'dTqPz0VHmFM', title: 'Epic Cinematic Music Mix' },
    { videoId: 'WFkZ-51xnLo', title: 'Most Beautiful Epic Music' },
    { videoId: 'ASj81daun5Q', title: 'Epic Orchestral Music Mix' }
  ],
  // Nature / Relaxing
  'nature': [
    { videoId: 'eKFTSSKCzWA', title: 'Relaxing Nature Sounds - Forest Birds' },
    { videoId: 'q76bMs-NwRk', title: 'Rain Sounds for Sleeping' },
    { videoId: 'sz8Lo8oWlVU', title: 'Ocean Waves for Deep Sleep' }
  ],
  // Jazz
  'jazz': [
    { videoId: 'Dx5qFachd3A', title: 'Coffee Shop Jazz - Relaxing Background Music' },
    { videoId: 'VMAPTo7RVCo', title: 'Smooth Jazz for Work & Study' },
    { videoId: 'fEvM-OUbaKs', title: 'Jazz Music - Coffee Shop Ambience' }
  ],
  // Electronic / Upbeat
  'electronic': [
    { videoId: 'mfHC9mLaawc', title: 'Electronic Music for Focus' },
    { videoId: '36YnV9STBqc', title: 'Electronic Study Music Playlist' },
    { videoId: 'a4fv-BtzNmY', title: 'Upbeat Study Music Electronic' }
  ],
  // Sad / Melancholic
  'sad': [
    { videoId: 'hHYct3aOJi4', title: 'Sad Piano Music for Reflection' },
    { videoId: '4N3N1MlvVc4', title: 'Melancholic Piano - Emotional Music' },
    { videoId: 'RBumgq5yVrA', title: 'Sad & Emotional Piano Music' }
  ],
  // Default fallback
  'default': [
    { videoId: 'jfKfPfyJRdk', title: 'lofi hip hop radio - beats to relax/study to' },
    { videoId: '5qap5aO4i9A', title: 'Relaxing Music 24/7' }
  ]
};

/**
 * Search for YouTube videos using Piped API
 * @param {string} query - Search query
 * @returns {Promise<{videoId: string, title: string}|null>}
 */
async function searchWithPiped(query) {
  for (const instance of PIPED_INSTANCES) {
    try {
      const response = await fetch(
        `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`,
        { 
          signal: AbortSignal.timeout(5000),
          headers: { 'Accept': 'application/json' }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          // Filter for videos that are likely to be playable (not too short, not live ended)
          const validVideo = data.items.find(item => 
            item.duration > 180 && // At least 3 minutes
            !item.isShort &&
            item.url
          ) || data.items[0];
          
          // Extract video ID from URL like /watch?v=XXXXX
          const videoId = validVideo.url?.replace('/watch?v=', '') || validVideo.id;
          
          if (videoId) {
            console.log(`Piped search success: ${instance}`);
            return {
              videoId: videoId,
              title: validVideo.title || 'Music'
            };
          }
        }
      }
    } catch (error) {
      console.warn(`Piped instance ${instance} failed:`, error.message);
      continue;
    }
  }
  return null;
}

/**
 * Search for YouTube videos using Invidious API
 * @param {string} query - Search query
 * @returns {Promise<{videoId: string, title: string}|null>}
 */
async function searchWithInvidious(query) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const response = await fetch(
        `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
        { 
          signal: AbortSignal.timeout(5000),
          headers: { 'Accept': 'application/json' }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          // Find a video that's long enough
          const validVideo = data.find(item => 
            item.lengthSeconds > 180
          ) || data[0];
          
          console.log(`Invidious search success: ${instance}`);
          return {
            videoId: validVideo.videoId,
            title: validVideo.title || 'Music'
          };
        }
      }
    } catch (error) {
      console.warn(`Invidious instance ${instance} failed:`, error.message);
      continue;
    }
  }
  return null;
}

/**
 * Get curated video based on search query keywords
 * @param {string} query - Search query
 * @returns {{videoId: string, title: string}}
 */
function getCuratedVideo(query) {
  const queryLower = query.toLowerCase();
  
  // Match query to curated categories
  const categoryMatches = [
    { keywords: ['lo-fi', 'lofi', 'lo fi', 'study', 'focus', 'work'], category: 'lo-fi' },
    { keywords: ['ambient', 'atmospheric', 'soundscape'], category: 'ambient' },
    { keywords: ['piano', 'classical', 'orchestra'], category: 'piano' },
    { keywords: ['cinematic', 'epic', 'dramatic', 'film'], category: 'cinematic' },
    { keywords: ['nature', 'rain', 'forest', 'ocean', 'water'], category: 'nature' },
    { keywords: ['jazz', 'coffee', 'cafe'], category: 'jazz' },
    { keywords: ['electronic', 'upbeat', 'energy', 'workout', 'motivation'], category: 'electronic' },
    { keywords: ['sad', 'melancholic', 'emotional', 'cry'], category: 'sad' }
  ];
  
  for (const { keywords, category } of categoryMatches) {
    if (keywords.some(kw => queryLower.includes(kw))) {
      const videos = CURATED_VIDEOS[category];
      // Return random video from category
      return videos[Math.floor(Math.random() * videos.length)];
    }
  }
  
  // Default fallback
  const defaultVideos = CURATED_VIDEOS['default'];
  return defaultVideos[Math.floor(Math.random() * defaultVideos.length)];
}

/**
 * Main search function with multiple fallbacks
 * @param {string} query - Search query
 * @returns {Promise<{videoId: string, title: string}>}
 */
export async function searchYouTubeVideo(query) {
  console.log('Searching for:', query);
  
  // Try Piped API first (most reliable)
  try {
    const pipedResult = await searchWithPiped(query);
    if (pipedResult) {
      return pipedResult;
    }
  } catch (error) {
    console.warn('Piped search failed:', error);
  }
  
  // Try Invidious API
  try {
    const invidiousResult = await searchWithInvidious(query);
    if (invidiousResult) {
      return invidiousResult;
    }
  } catch (error) {
    console.warn('Invidious search failed:', error);
  }
  
  // Fallback to curated videos (always works)
  console.log('Using curated fallback for query:', query);
  return getCuratedVideo(query);
}

/**
 * Get embed URL for YouTube video
 * @param {string} videoId - YouTube video ID
 * @param {boolean} autoplay - Whether to autoplay
 * @returns {string}
 */
export function getYouTubeEmbedUrl(videoId, autoplay = true) {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    enablejsapi: '1',
    controls: '0',
    rel: '0',
    modestbranding: '1',
    loop: '1',
    playlist: videoId,
    mute: '0'
  });
  
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

/**
 * Build YouTube player HTML for injection
 * @param {string} videoId - YouTube video ID
 * @returns {string}
 */
export function buildPlayerHTML(videoId) {
  return `
    <iframe
      id="moodreader-youtube-player"
      width="100%"
      height="100%"
      src="${getYouTubeEmbedUrl(videoId)}"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
    ></iframe>
  `;
}

/**
 * Predefined mood to video mappings (fallback)
 */
export const FALLBACK_VIDEOS = {
  focus: 'jfKfPfyJRdk',
  relax: '5qap5aO4i9A', 
  sad: 'hHYct3aOJi4',
  energetic: '36YnV9STBqc',
  cinematic: 'dTqPz0VHmFM',
  nature: 'eKFTSSKCzWA'
};

/**
 * Get a random curated video for a specific mood
 * @param {string} mood - Mood type
 * @returns {{videoId: string, title: string}}
 */
export function getRandomCuratedVideo(mood) {
  const moodToCategory = {
    focus: 'lo-fi',
    relax: 'ambient',
    sad: 'sad',
    energetic: 'electronic',
    cinematic: 'cinematic',
    nature: 'nature'
  };
  
  const category = moodToCategory[mood] || 'default';
  const videos = CURATED_VIDEOS[category] || CURATED_VIDEOS['default'];
  return videos[Math.floor(Math.random() * videos.length)];
}
