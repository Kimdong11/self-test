/**
 * YouTube Integration Module
 * Handles video search and playback with multiple fallback methods
 */

import { Logger } from './logger.js';

const log = Logger.scope('YouTube');

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
 * Updated with verified working video IDs (Jan 2026)
 * Expanded pools to prevent repetition
 */
const CURATED_VIDEOS = {
  // Lo-fi / Focus - Expanded pool for variety
  'lo-fi': [
    { videoId: 'jfKfPfyJRdk', title: 'lofi hip hop radio - beats to relax/study to' },
    { videoId: 'n61ULEU7CO0', title: 'Lofi Girl Synthwave Radio' },
    { videoId: 'rUxyKA_-grg', title: 'Chillhop Radio - jazzy & lofi hip hop beats' },
    { videoId: 'lTRiuFIWV54', title: '1 A.M Study Session - Lofi Hip Hop' },
    { videoId: 'kgx4WGK0oNU', title: 'lofi hip hop radio - beats to sleep/chill to' },
    { videoId: '7NOSDKb0HlU', title: 'Lofi Study Mix - Deep Focus' },
    { videoId: 'DWcJFNfaw9c', title: 'Chillhop Essentials - Fall 2023' },
    { videoId: '-FlxM_0S2lA', title: 'Coffee Shop Radio - Lofi Hip Hop Mix' }
  ],
  // Ambient / Calm - Expanded
  'ambient': [
    { videoId: 'lE6RYpe9IT0', title: 'Study Work Focus Deep Ambient Music' },
    { videoId: 'OdIJ2x3nxzQ', title: 'Relaxing Ambient Music Mix' },
    { videoId: 'C5CGD1fThFk', title: 'Ambient Space Music for Focus' },
    { videoId: 'S_MOd40zlYU', title: 'Relaxing Ambient Music - Deep Focus' },
    { videoId: 'hlWiI4xVXKY', title: 'Ambient Study Music To Concentrate' },
    { videoId: 'hHW1oY26kxQ', title: 'Peaceful Ambient Music - Calm' }
  ],
  // Classical / Piano - Expanded
  'piano': [
    { videoId: 'y7e-GC6oGhg', title: 'Relaxing Piano Music 24/7' },
    { videoId: 'HSOtku1j600', title: 'Classical Piano Music for Studying' },
    { videoId: '47e7xrF7wpY', title: 'Peaceful Piano & Soft Rain' },
    { videoId: '4Tr0otuiQuU', title: 'Classical Music for Studying & Brain Power' },
    { videoId: 'lCOF9LN_Zxs', title: 'Beautiful Piano Music for Sleep' },
    { videoId: 'Dx5qFachd3A', title: 'Piano Music - Relaxing Background' }
  ],
  // Cinematic / Epic - Expanded
  'cinematic': [
    { videoId: 'hEcuVR2vHwM', title: 'Epic Cinematic Music Mix' },
    { videoId: 'XYKUeZQbMF0', title: 'Two Steps From Hell Mix' },
    { videoId: '2rn-lwJKhkI', title: 'Epic & Powerful Cinematic Music' },
    { videoId: 'ASj81daun5Q', title: 'Epic Orchestral Music Mix' },
    { videoId: 'vbttZVTSJRU', title: 'Most Epic Music Ever - Powerful' },
    { videoId: 'hKRUPYrAQoE', title: 'Cinematic Orchestral Music' }
  ],
  // Nature / Relaxing - Expanded
  'nature': [
    { videoId: 'mPZkdNFkNps', title: 'Rain Sounds for Sleep' },
    { videoId: 'V1RPi2MYptM', title: 'Forest Birdsong Nature Sounds' },
    { videoId: 'sGkh1W5cbH4', title: 'Ocean Waves Sounds for Sleep' },
    { videoId: 'q76bMs-NwRk', title: 'Rain Sounds 10 Hours' },
    { videoId: 'eKFTSSKCzWA', title: 'Relaxing Nature Sounds - Forest Birds' },
    { videoId: 'sz8Lo8oWlVU', title: 'Ocean Waves for Deep Sleep' }
  ],
  // Jazz - Expanded
  'jazz': [
    { videoId: 'neV3EPgvZ3g', title: 'Jazz Cafe Music - Relaxing Coffee Jazz' },
    { videoId: 'h2zkV-l_TbY', title: 'Cozy Coffee Shop Jazz' },
    { videoId: 'fEvM-OUbaKs', title: 'Smooth Jazz for Work & Study' },
    { videoId: 'Dx5qFachd3A', title: 'Coffee Shop Jazz - Relaxing BGM' },
    { videoId: 'VMAPTo7RVCo', title: 'Smooth Jazz for Work & Study' },
    { videoId: 'DSGyEsJ17cI', title: 'Jazz Piano Bar Music' }
  ],
  // Electronic / Upbeat - Expanded
  'electronic': [
    { videoId: 'UedTcufyrHc', title: 'NCS Release - Electronic Mix' },
    { videoId: 'c3sBBRxDAqk', title: 'Energetic Electronic Music for Focus' },
    { videoId: 'n1WpP7iowLc', title: 'Motivational Electronic Music' },
    { videoId: '36YnV9STBqc', title: 'Electronic Study Music Playlist' },
    { videoId: 'mfHC9mLaawc', title: 'Electronic Music for Focus' },
    { videoId: 'a4fv-BtzNmY', title: 'Upbeat Study Music Electronic' }
  ],
  // Sad / Melancholic - Expanded
  'sad': [
    { videoId: 'HoPaJRV-aF4', title: 'Sad Piano Music for Crying' },
    { videoId: 'IWBlXrI34kE', title: 'Melancholic Piano - Sad Songs' },
    { videoId: 'I4tqNClRlJs', title: 'Emotional Piano Music Collection' },
    { videoId: '4N3N1MlvVc4', title: 'Melancholic Piano - Emotional Music' },
    { videoId: 'RBumgq5yVrA', title: 'Sad & Emotional Piano Music' },
    { videoId: 'hHYct3aOJi4', title: 'Sad Piano Music for Reflection' }
  ],
  // Default fallback - expanded with variety
  'default': [
    { videoId: 'jfKfPfyJRdk', title: 'lofi hip hop radio - beats to relax/study to' },
    { videoId: 'n61ULEU7CO0', title: 'Lofi Girl Synthwave Radio' },
    { videoId: 'rUxyKA_-grg', title: 'Chillhop Radio' },
    { videoId: 'lE6RYpe9IT0', title: 'Study Work Focus Ambient Music' },
    { videoId: 'y7e-GC6oGhg', title: 'Relaxing Piano Music' },
    { videoId: 'neV3EPgvZ3g', title: 'Jazz Cafe Music' }
  ]
};

// Track recently played videos to avoid repetition
const recentlyPlayed = [];
const MAX_RECENT_HISTORY = 10;

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
            log.info(`Piped search success: ${instance}`);
            return {
              videoId: videoId,
              title: validVideo.title || 'Music'
            };
          }
        }
      }
    } catch (error) {
      log.warn(`Piped instance ${instance} failed: ${error.message}`);
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
          
          log.info(`Invidious search success: ${instance}`);
          return {
            videoId: validVideo.videoId,
            title: validVideo.title || 'Music'
          };
        }
      }
    } catch (error) {
      log.warn(`Invidious instance ${instance} failed: ${error.message}`);
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
  log.info(`Searching for: ${query}`);
  
  // Try Piped API first (most reliable)
  try {
    const pipedResult = await searchWithPiped(query);
    if (pipedResult) {
      return pipedResult;
    }
  } catch (error) {
    log.warn('Piped search failed', { error: error.message });
  }
  
  // Try Invidious API
  try {
    const invidiousResult = await searchWithInvidious(query);
    if (invidiousResult) {
      return invidiousResult;
    }
  } catch (error) {
    log.warn('Invidious search failed', { error: error.message });
  }
  
  // Fallback to curated videos (always works)
  log.info(`Using curated fallback for query: ${query}`);
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
 * Using most reliable video IDs
 */
export const FALLBACK_VIDEOS = {
  focus: 'jfKfPfyJRdk',      // Lofi Girl
  relax: 'lE6RYpe9IT0',      // Ambient music
  sad: 'HoPaJRV-aF4',        // Sad piano
  energetic: 'UedTcufyrHc',  // NCS electronic
  cinematic: 'hEcuVR2vHwM',  // Epic cinematic
  nature: 'mPZkdNFkNps'      // Rain sounds
};

/**
 * Get a random curated video for a specific mood
 * Avoids recently played videos for variety
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
    nature: 'nature',
    piano: 'piano',
    jazz: 'jazz',
    ambient: 'ambient',
    electronic: 'electronic'
  };
  
  const category = moodToCategory[mood] || 'default';
  let videos = CURATED_VIDEOS[category] || CURATED_VIDEOS['default'];
  
  // Filter out recently played videos
  const availableVideos = videos.filter(v => !recentlyPlayed.includes(v.videoId));
  
  // If all videos have been played recently, reset and use all
  if (availableVideos.length === 0) {
    recentlyPlayed.length = 0; // Clear history
    log.info('Reset recently played history - all videos in category were played');
  }
  
  const finalVideos = availableVideos.length > 0 ? availableVideos : videos;
  const selected = finalVideos[Math.floor(Math.random() * finalVideos.length)];
  
  // Add to recently played
  recentlyPlayed.push(selected.videoId);
  if (recentlyPlayed.length > MAX_RECENT_HISTORY) {
    recentlyPlayed.shift(); // Remove oldest
  }
  
  log.info('Selected curated video', { mood, category, videoId: selected.videoId, recentCount: recentlyPlayed.length });
  
  return selected;
}

/**
 * Get a different video from the same category (for skip)
 * @param {string} mood - Current mood
 * @param {string} currentVideoId - Current video to avoid
 * @returns {{videoId: string, title: string}}
 */
export function getDifferentVideo(mood, currentVideoId) {
  const moodToCategory = {
    focus: 'lo-fi',
    relax: 'ambient',
    sad: 'sad',
    energetic: 'electronic',
    cinematic: 'cinematic',
    nature: 'nature',
    piano: 'piano',
    jazz: 'jazz',
    ambient: 'ambient',
    electronic: 'electronic'
  };
  
  const category = moodToCategory[mood] || 'default';
  let videos = CURATED_VIDEOS[category] || CURATED_VIDEOS['default'];
  
  // Exclude current video and recently played
  const availableVideos = videos.filter(v => 
    v.videoId !== currentVideoId && !recentlyPlayed.includes(v.videoId)
  );
  
  const finalVideos = availableVideos.length > 0 ? availableVideos : videos.filter(v => v.videoId !== currentVideoId);
  
  if (finalVideos.length === 0) {
    // All videos exhausted, pick random from different category
    const allCategories = Object.keys(CURATED_VIDEOS);
    const otherCategory = allCategories[Math.floor(Math.random() * allCategories.length)];
    videos = CURATED_VIDEOS[otherCategory];
    return videos[Math.floor(Math.random() * videos.length)];
  }
  
  const selected = finalVideos[Math.floor(Math.random() * finalVideos.length)];
  
  // Add to recently played
  recentlyPlayed.push(selected.videoId);
  if (recentlyPlayed.length > MAX_RECENT_HISTORY) {
    recentlyPlayed.shift();
  }
  
  return selected;
}
