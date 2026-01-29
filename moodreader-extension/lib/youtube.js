/**
 * YouTube IFrame API Integration Module
 * Handles video search and playback
 */

const YOUTUBE_SEARCH_API = 'https://www.googleapis.com/youtube/v3/search';
const INVIDIOUS_INSTANCES = [
  'https://vid.puffyan.us',
  'https://inv.riverside.rocks',
  'https://invidious.snopyta.org'
];

/**
 * Search for YouTube videos using Invidious API (no API key required)
 * @param {string} query - Search query
 * @returns {Promise<{videoId: string, title: string}|null>}
 */
export async function searchYouTubeVideo(query) {
  // Try Invidious instances first (no API key needed)
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const response = await fetch(
        `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
        { signal: AbortSignal.timeout(5000) }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          return {
            videoId: data[0].videoId,
            title: data[0].title
          };
        }
      }
    } catch (error) {
      console.warn(`Invidious instance ${instance} failed:`, error.message);
      continue;
    }
  }
  
  // Fallback: Extract video ID from YouTube search page (scraping approach)
  try {
    return await scrapeYouTubeSearch(query);
  } catch (error) {
    console.error('YouTube search failed:', error);
    return null;
  }
}

/**
 * Scrape YouTube search results (fallback method)
 * @param {string} query - Search query
 * @returns {Promise<{videoId: string, title: string}|null>}
 */
async function scrapeYouTubeSearch(query) {
  try {
    const response = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );
    
    const html = await response.text();
    
    // Extract video ID from the page
    const videoIdMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    const titleMatch = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"\}\]/);
    
    if (videoIdMatch) {
      return {
        videoId: videoIdMatch[1],
        title: titleMatch ? titleMatch[1] : 'Unknown Title'
      };
    }
    
    return null;
  } catch (error) {
    console.error('YouTube scraping failed:', error);
    return null;
  }
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
    origin: chrome.runtime.getURL(''),
    controls: '1',
    rel: '0',
    modestbranding: '1',
    loop: '1',
    playlist: videoId // Required for loop to work
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
 * Predefined mood playlists (fallback video IDs)
 */
export const FALLBACK_VIDEOS = {
  focus: 'jfKfPfyJRdk', // lofi hip hop radio
  relax: '5qap5aO4i9A', // relaxing music
  sad: 'RBumgq5yVrA', // sad piano
  energetic: 'n1WpP7iowLc' // electronic
};
