/**
 * MoodReader Background Service Worker
 * Handles API calls, state management, and message routing
 */

import { analyzeSentiment, getFallbackMusicQuery, buildContext, generateAlternativeQuery } from './lib/gemini.js';
import { searchYouTubeVideo, FALLBACK_VIDEOS } from './lib/youtube.js';

// Default settings
const DEFAULT_SETTINGS = {
  apiKey: '',
  volume: 50,
  enabled: true,
  excludedDomains: ['youtube.com', 'netflix.com', 'spotify.com', 'music.youtube.com', 'soundcloud.com', 'twitch.tv', 'vimeo.com', 'dailymotion.com'],
  autoAnalyze: true  // Auto-analyze enabled by default
};

// Current state
let currentState = {
  isPlaying: false,
  currentMood: null,
  currentQuery: null,
  currentVideoId: null,
  currentVideoTitle: null,
  // Enhanced mood data
  moodData: null,
  context: null,
  skipCount: 0
};

/**
 * Initialize extension settings
 */
async function initializeSettings() {
  const stored = await chrome.storage.local.get('settings');
  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
}

/**
 * Get current settings
 */
async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

/**
 * Update settings
 */
async function updateSettings(newSettings) {
  const current = await getSettings();
  const updated = { ...current, ...newSettings };
  await chrome.storage.local.set({ settings: updated });
  return updated;
}

/**
 * Check if domain is excluded
 */
async function isDomainExcluded(url) {
  try {
    const { hostname } = new URL(url);
    const settings = await getSettings();
    return settings.excludedDomains.some(domain => 
      hostname.includes(domain) || hostname.endsWith(domain)
    );
  } catch {
    return false;
  }
}

/**
 * Handle analyze request from content script or popup
 */
async function handleAnalyzeRequest(text, tabId, context = {}) {
  const settings = await getSettings();
  
  if (!settings.apiKey) {
    return { 
      success: false, 
      error: 'API key not configured. Please set your Gemini API key in the extension settings.' 
    };
  }

  try {
    // Send loading state to content script
    chrome.tabs.sendMessage(tabId, { 
      type: 'UPDATE_STATE', 
      state: { isLoading: true, loadingMessage: '🎵 Analyzing mood & context...' } 
    }).catch(() => {});

    // Analyze sentiment with Gemini (with context)
    const result = await analyzeSentiment(text, settings.apiKey, context);
    
    console.log('Enhanced analysis result:', result);
    
    // Search for a matching video
    const video = await searchYouTubeVideo(result.search_query);
    
    if (!video) {
      throw new Error('Could not find a matching video');
    }

    // Update current state with enhanced data
    currentState = {
      isPlaying: true,
      currentMood: result.mood_tag,
      currentQuery: result.search_query,
      currentVideoId: video.videoId,
      currentVideoTitle: video.title,
      moodData: result,
      context: context,
      skipCount: 0
    };

    // Save state to storage
    await chrome.storage.local.set({ currentState });

    // Send success response to content script with enhanced data
    chrome.tabs.sendMessage(tabId, {
      type: 'PLAY_MUSIC',
      data: {
        mood: result.mood_tag,
        query: result.search_query,
        videoId: video.videoId,
        videoTitle: video.title,
        // Enhanced data for UI
        energy: result.energy,
        valence: result.valence,
        tempo: result.tempo,
        genres: result.genres
      }
    }).catch(() => {});

    return { success: true, data: currentState };
  } catch (error) {
    console.error('Analysis failed:', error);
    
    // Send error to content script
    chrome.tabs.sendMessage(tabId, {
      type: 'UPDATE_STATE',
      state: { isLoading: false, error: error.message }
    }).catch(() => {});

    return { success: false, error: error.message };
  }
}

/**
 * Handle manual mood selection
 */
async function handleManualMood(mood, tabId, context = {}) {
  try {
    // Get context-aware fallback query
    const moodData = getFallbackMusicQuery(mood, context);
    const video = await searchYouTubeVideo(moodData.search_query);
    
    const videoId = video?.videoId || FALLBACK_VIDEOS[mood] || FALLBACK_VIDEOS.focus;
    const videoTitle = video?.title || `${moodData.mood_tag} Music`;

    currentState = {
      isPlaying: true,
      currentMood: moodData.mood_tag,
      currentQuery: moodData.search_query,
      currentVideoId: videoId,
      currentVideoTitle: videoTitle,
      moodData: moodData,
      context: context,
      skipCount: 0
    };

    await chrome.storage.local.set({ currentState });

    chrome.tabs.sendMessage(tabId, {
      type: 'PLAY_MUSIC',
      data: {
        mood: moodData.mood_tag,
        query: moodData.search_query,
        videoId: videoId,
        videoTitle: videoTitle,
        energy: moodData.energy,
        valence: moodData.valence,
        tempo: moodData.tempo,
        genres: moodData.genres
      }
    }).catch(() => {});

    return { success: true, data: currentState };
  } catch (error) {
    console.error('Manual mood selection failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle skip/change song request
 */
async function handleSkipSong(tabId) {
  if (!currentState.currentQuery && !currentState.moodData) {
    return { success: false, error: 'No current mood set' };
  }

  try {
    // Increment skip count
    currentState.skipCount = (currentState.skipCount || 0) + 1;
    
    // Generate alternative query based on skip count and mood data
    const alternativeQuery = generateAlternativeQuery(
      currentState.moodData || { search_query: currentState.currentQuery },
      currentState.skipCount
    );
    
    console.log(`Skip #${currentState.skipCount}, trying query: ${alternativeQuery}`);
    
    const video = await searchYouTubeVideo(alternativeQuery);
    
    if (video) {
      currentState.currentVideoId = video.videoId;
      currentState.currentVideoTitle = video.title;
      
      await chrome.storage.local.set({ currentState });

      chrome.tabs.sendMessage(tabId, {
        type: 'PLAY_MUSIC',
        data: {
          mood: currentState.currentMood,
          query: alternativeQuery,
          videoId: video.videoId,
          videoTitle: video.title,
          energy: currentState.moodData?.energy,
          valence: currentState.moodData?.valence,
          tempo: currentState.moodData?.tempo,
          genres: currentState.moodData?.genres
        }
      }).catch(() => {});

      return { success: true, data: currentState };
    }
    
    return { success: false, error: 'Could not find alternative video' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Message listener for communication with content scripts and popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  (async () => {
    try {
      switch (message.type) {
        case 'ANALYZE_TEXT': {
          const result = await handleAnalyzeRequest(message.text, tabId, message.context || {});
          sendResponse(result);
          break;
        }

        case 'MANUAL_MOOD': {
          const result = await handleManualMood(message.mood, tabId || message.tabId, message.context || {});
          sendResponse(result);
          break;
        }

        case 'SKIP_SONG': {
          const result = await handleSkipSong(tabId || message.tabId);
          sendResponse(result);
          break;
        }

        case 'GET_SETTINGS': {
          const settings = await getSettings();
          sendResponse({ success: true, settings });
          break;
        }

        case 'UPDATE_SETTINGS': {
          const settings = await updateSettings(message.settings);
          sendResponse({ success: true, settings });
          break;
        }

        case 'GET_STATE': {
          sendResponse({ success: true, state: currentState });
          break;
        }

        case 'UPDATE_STATE': {
          currentState = { ...currentState, ...message.state };
          await chrome.storage.local.set({ currentState });
          sendResponse({ success: true, state: currentState });
          break;
        }

        case 'CHECK_EXCLUDED': {
          const excluded = await isDomainExcluded(message.url);
          sendResponse({ success: true, excluded });
          break;
        }

        case 'STOP_MUSIC': {
          currentState.isPlaying = false;
          await chrome.storage.local.set({ currentState });
          if (tabId || message.tabId) {
            chrome.tabs.sendMessage(tabId || message.tabId, {
              type: 'STOP_MUSIC'
            }).catch(() => {});
          }
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep channel open for async response
});

/**
 * Initialize on install
 */
chrome.runtime.onInstalled.addListener(async () => {
  await initializeSettings();
  console.log('MoodReader extension installed');
});

/**
 * Restore state on startup
 */
chrome.runtime.onStartup.addListener(async () => {
  const { currentState: savedState } = await chrome.storage.local.get('currentState');
  if (savedState) {
    currentState = savedState;
  }
});
