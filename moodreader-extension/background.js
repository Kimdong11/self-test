/**
 * MoodReader Background Service Worker
 * Handles API calls, state management, and message routing
 * 
 * Security: API key encoding, input validation
 * Performance: Response caching with chrome.alarms cleanup
 */

import { analyzeSentiment, getFallbackMusicQuery, generateAlternativeQuery } from './lib/gemini.js';
import { searchYouTubeVideo, FALLBACK_VIDEOS, getRandomCuratedVideo } from './lib/youtube.js';
import { getCachedAnalysis, setCachedAnalysis, clearCache, initializeCacheCleanup, handleCacheAlarm } from './lib/cache.js';
import { encodeApiKey, decodeApiKey, isValidApiKeyFormat, sanitizeObject, sanitizeDomain } from './lib/security.js';
import { DEFAULT_SETTINGS, ERROR_CODES } from './lib/constants.js';
import { Logger } from './lib/logger.js';

const log = Logger.scope('Background');

// Current state
let currentState = {
  isPlaying: false,
  currentMood: null,
  currentQuery: null,
  currentVideoId: null,
  currentVideoTitle: null,
  moodData: null,
  context: null,
  skipCount: 0
};

// ============================================
// SETTINGS MANAGEMENT
// ============================================

async function initializeSettings() {
  const stored = await chrome.storage.local.get('settings');
  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    log.info('Default settings initialized');
  }
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  
  if (merged.apiKey && merged.apiKeyEncrypted) {
    merged.apiKey = decodeApiKey(merged.apiKey);
  }
  
  return merged;
}

async function updateSettings(newSettings) {
  const current = await chrome.storage.local.get('settings');
  const currentSettings = current.settings || DEFAULT_SETTINGS;
  
  // Handle API key encoding
  if (newSettings.apiKey !== undefined) {
    if (newSettings.apiKey) {
      if (isValidApiKeyFormat(newSettings.apiKey)) {
        newSettings.apiKey = encodeApiKey(newSettings.apiKey);
        newSettings.apiKeyEncrypted = true;
        log.info('API key saved (encoded)');
      } else {
        log.warn('Invalid API key format provided');
        return { error: 'Invalid API key format. Gemini API keys should start with "AIza".' };
      }
    } else {
      newSettings.apiKeyEncrypted = false;
    }
  }
  
  // Handle domain sanitization
  if (newSettings.excludedDomains) {
    newSettings.excludedDomains = newSettings.excludedDomains
      .map(d => sanitizeDomain(d))
      .filter(Boolean);
  }
  
  const updated = { ...currentSettings, ...newSettings };
  await chrome.storage.local.set({ settings: updated });
  
  if (updated.apiKey && updated.apiKeyEncrypted) {
    return { ...updated, apiKey: decodeApiKey(updated.apiKey) };
  }
  return updated;
}

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

// ============================================
// ANALYSIS HANDLERS
// ============================================

async function handleAnalyzeRequest(text, tabId, context = {}) {
  const settings = await getSettings();
  
  if (!settings.apiKey) {
    return { 
      success: false, 
      error: 'API key not configured. Please set your Gemini API key in the extension settings.',
      code: ERROR_CODES.API_KEY_MISSING
    };
  }

  if (!text || typeof text !== 'string' || text.trim().length < 50) {
    return {
      success: false,
      error: 'Not enough text content to analyze.',
      code: ERROR_CODES.INSUFFICIENT_CONTENT
    };
  }

  try {
    chrome.tabs.sendMessage(tabId, { 
      type: 'UPDATE_STATE', 
      state: { isLoading: true, loadingMessage: '🎵 Analyzing mood & context...' } 
    }).catch(() => {});

    // Check cache first
    let result = getCachedAnalysis(text);
    
    if (!result) {
      log.info('Cache miss, calling Gemini API');
      result = await analyzeSentiment(text, settings.apiKey, context);
      result = sanitizeObject(result);
      setCachedAnalysis(text, result);
    } else {
      log.info('Using cached analysis result');
    }
    
    const video = await searchYouTubeVideo(result.search_query);
    
    if (!video) {
      throw new Error('Could not find a matching video');
    }

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

    await chrome.storage.local.set({ currentState });

    chrome.tabs.sendMessage(tabId, {
      type: 'PLAY_MUSIC',
      data: {
        mood: result.mood_tag,
        query: result.search_query,
        videoId: video.videoId,
        videoTitle: video.title,
        energy: result.energy,
        valence: result.valence,
        tempo: result.tempo,
        genres: result.genres
      }
    }).catch(() => {});

    log.info('Analysis complete', { mood: result.mood_tag });
    return { success: true, data: currentState };
  } catch (error) {
    log.error('Analysis failed', error);
    
    chrome.tabs.sendMessage(tabId, {
      type: 'UPDATE_STATE',
      state: { isLoading: false, error: error.message }
    }).catch(() => {});

    return { 
      success: false, 
      error: error.message,
      code: ERROR_CODES.API_ERROR
    };
  }
}

async function handleManualMood(mood, tabId, context = {}) {
  const validMoods = ['focus', 'relax', 'sad', 'energetic', 'cinematic', 'nature'];
  if (!validMoods.includes(mood)) {
    return { success: false, error: 'Invalid mood type' };
  }

  try {
    const moodData = getFallbackMusicQuery(mood, context);
    
    let video = await searchYouTubeVideo(moodData.search_query);
    
    if (!video || !video.videoId) {
      log.info('Using curated video for mood:', mood);
      video = getRandomCuratedVideo(mood);
    }
    
    const videoId = video.videoId;
    const videoTitle = video.title || `${moodData.mood_tag} Music`;

    currentState = {
      isPlaying: true,
      currentMood: moodData.mood_tag,
      currentQuery: moodData.search_query,
      currentVideoId: videoId,
      currentVideoTitle: videoTitle,
      moodData: sanitizeObject(moodData),
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
    log.error('Manual mood selection failed', error);
    return { success: false, error: error.message };
  }
}

async function handleSkipSong(tabId) {
  if (!currentState.currentQuery && !currentState.moodData) {
    return { success: false, error: 'No current mood set' };
  }

  try {
    currentState.skipCount = (currentState.skipCount || 0) + 1;
    
    const alternativeQuery = generateAlternativeQuery(
      currentState.moodData || { search_query: currentState.currentQuery },
      currentState.skipCount
    );
    
    log.info(`Skip #${currentState.skipCount}`, { query: alternativeQuery });
    
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
    log.error('Skip failed', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// MESSAGE LISTENER
// ============================================

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
          sendResponse({ 
            success: true, 
            settings: {
              ...settings,
              apiKey: settings.apiKey ? '***configured***' : '',
              hasApiKey: !!settings.apiKey
            }
          });
          break;
        }

        case 'GET_SETTINGS_FULL': {
          const settings = await getSettings();
          sendResponse({ success: true, settings });
          break;
        }

        case 'UPDATE_SETTINGS': {
          const result = await updateSettings(message.settings);
          if (result.error) {
            sendResponse({ success: false, error: result.error });
          } else {
            sendResponse({ success: true, settings: result });
          }
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

        case 'CLEAR_CACHE': {
          clearCache();
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      log.error('Message handler error', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true;
});

// ============================================
// ALARM LISTENER (for cache cleanup)
// ============================================

chrome.alarms.onAlarm.addListener((alarm) => {
  handleCacheAlarm(alarm);
});

// ============================================
// LIFECYCLE EVENTS
// ============================================

chrome.runtime.onInstalled.addListener(async () => {
  await initializeSettings();
  await initializeCacheCleanup();
  log.info('MoodReader extension installed');
});

chrome.runtime.onStartup.addListener(async () => {
  await initializeCacheCleanup();
  
  const { currentState: savedState } = await chrome.storage.local.get('currentState');
  if (savedState) {
    currentState = savedState;
  }
  log.info('MoodReader extension started');
});
