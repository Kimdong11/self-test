/**
 * MoodReader Background Service Worker
 * Handles API calls, state management, and message routing
 * 
 * Features:
 * - Instant playback mode (plays immediately, refines with AI)
 * - Domain-based caching for faster repeat visits
 * - Parallel processing of AI analysis and music playback
 * 
 * Security: API key encoding, input validation
 * Performance: Response caching, instant playback, chrome.alarms cleanup
 */

import { analyzeSentiment, getFallbackMusicQuery, generateAlternativeQuery } from './lib/gemini.js';
import { searchYouTubeVideo, FALLBACK_VIDEOS, getRandomCuratedVideo } from './lib/youtube.js';
import { 
  getCachedAnalysis, setCachedAnalysis, clearCache, 
  initializeCacheCleanup, handleCacheAlarm,
  getDomainMood, setDomainMood, clearDomainCache
} from './lib/cache.js';
import { encodeApiKey, decodeApiKey, isValidApiKeyFormat, sanitizeObject, sanitizeDomain } from './lib/security.js';
import { DEFAULT_SETTINGS, ERROR_CODES } from './lib/constants.js';
import { Logger } from './lib/logger.js';
import { getInstantPlaybackData, quickMoodDetection, shouldRefineWithAI, mergeWithAIResult } from './lib/instant-play.js';

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
// ANALYSIS HANDLERS (with Instant Playback Mode)
// ============================================

/**
 * Handle analyze request with instant playback mode
 * Flow:
 * 1. Check domain cache for instant result
 * 2. If no cache, use quick mood detection and play immediately
 * 3. In parallel, run AI analysis for refinement
 * 4. If AI produces better result, smoothly transition
 */
async function handleAnalyzeRequest(text, tabId, context = {}) {
  const settings = await getSettings();
  const instantPlayEnabled = settings.instantPlayEnabled !== false; // Default to true
  
  // Validate text
  if (!text || typeof text !== 'string' || text.trim().length < 50) {
    return {
      success: false,
      error: 'Not enough text content to analyze.',
      code: ERROR_CODES.INSUFFICIENT_CONTENT
    };
  }

  try {
    // === PHASE 1: Check for cached mood (but always pick new video for variety) ===
    
    // Check domain cache for mood info (not video)
    const domainMood = getDomainMood(context.url, context.siteCategory);
    if (domainMood && instantPlayEnabled) {
      log.info('Domain cache hit - using cached mood with new video selection');
      // Use cached mood but get a NEW random video
      const video = getRandomCuratedVideo(domainMood.mood_tag?.toLowerCase()?.replace(/\s+/g, '') || 'focus');
      return await playWithMoodAndVideo(domainMood, video, tabId, context);
    }
    
    // Check text-based cache
    const cachedResult = getCachedAnalysis(text);
    if (cachedResult) {
      log.info('Text cache hit - using cached mood with new video');
      // Cache the mood by domain for future
      if (context.url) {
        setDomainMood(context.url, context.siteCategory, cachedResult);
      }
      // Get a new video for variety
      const video = getRandomCuratedVideo(getMoodCategory(cachedResult));
      return await playWithMoodAndVideo(cachedResult, video, tabId, context);
    }

    // === PHASE 2: Instant Playback Mode ===
    
    if (instantPlayEnabled) {
      // Start with instant playback (no API wait)
      const instantData = getInstantPlaybackData(context, text);
      
      // Send instant playback to content script
      chrome.tabs.sendMessage(tabId, {
        type: 'PLAY_MUSIC',
        data: {
          ...instantData,
          isInstant: true,
          loadingAI: !!settings.apiKey
        }
      }).catch(() => {});

      // Update state with instant data
      currentState = {
        isPlaying: true,
        currentMood: instantData.mood,
        currentQuery: instantData.moodData?.search_query || '',
        currentVideoId: instantData.videoId,
        currentVideoTitle: instantData.videoTitle,
        moodData: instantData.moodData,
        context: context,
        skipCount: 0,
        isInstant: true
      };

      await chrome.storage.local.set({ currentState });
      
      log.info('Instant playback started', { mood: instantData.mood });

      // === PHASE 3: AI Refinement (parallel, non-blocking) ===
      
      if (settings.apiKey && shouldRefineWithAI({ confidence: 0.5 }, text.length)) {
        // Run AI analysis in background (don't await)
        refineWithAI(text, settings.apiKey, context, tabId, instantData).catch(err => {
          log.warn('AI refinement failed (non-critical)', { error: err.message });
        });
      }

      return { success: true, data: currentState, instant: true };
    }

    // === FALLBACK: Traditional flow (no instant play) ===
    
    if (!settings.apiKey) {
      return { 
        success: false, 
        error: 'API key not configured. Please set your Gemini API key in the extension settings.',
        code: ERROR_CODES.API_KEY_MISSING
      };
    }

    chrome.tabs.sendMessage(tabId, { 
      type: 'UPDATE_STATE', 
      state: { isLoading: true, loadingMessage: '🎵 Analyzing mood & context...' } 
    }).catch(() => {});

    const result = await analyzeSentiment(text, settings.apiKey, context);
    const sanitizedResult = sanitizeObject(result);
    setCachedAnalysis(text, sanitizedResult);
    
    if (context.url) {
      setDomainMood(context.url, context.siteCategory, sanitizedResult);
    }

    return await playWithMoodData(sanitizedResult, tabId, context, text);

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

/**
 * Get mood category from moodData for video selection
 */
function getMoodCategory(moodData) {
  const moodTag = (moodData.mood_tag || '').toLowerCase();
  
  // Map common mood tags to categories
  if (moodTag.includes('focus') || moodTag.includes('study') || moodTag.includes('work')) return 'focus';
  if (moodTag.includes('relax') || moodTag.includes('calm') || moodTag.includes('peace')) return 'relax';
  if (moodTag.includes('sad') || moodTag.includes('melanchol') || moodTag.includes('reflect')) return 'sad';
  if (moodTag.includes('energ') || moodTag.includes('upbeat') || moodTag.includes('motiv')) return 'energetic';
  if (moodTag.includes('cinema') || moodTag.includes('epic') || moodTag.includes('dramat')) return 'cinematic';
  if (moodTag.includes('nature') || moodTag.includes('rain') || moodTag.includes('forest')) return 'nature';
  if (moodTag.includes('piano') || moodTag.includes('classical')) return 'piano';
  if (moodTag.includes('jazz') || moodTag.includes('cafe') || moodTag.includes('coffee')) return 'jazz';
  if (moodTag.includes('ambient') || moodTag.includes('space') || moodTag.includes('atmosph')) return 'ambient';
  if (moodTag.includes('electro') || moodTag.includes('synth')) return 'electronic';
  
  // Check energy level as fallback
  if (moodData.energy !== undefined) {
    if (moodData.energy > 0.6) return 'energetic';
    if (moodData.energy < 0.3) return 'ambient';
  }
  
  return 'focus'; // Default
}

/**
 * Play music with mood data and specific video
 */
async function playWithMoodAndVideo(moodData, video, tabId, context) {
  currentState = {
    isPlaying: true,
    currentMood: moodData.mood_tag,
    currentQuery: moodData.search_query,
    currentVideoId: video.videoId,
    currentVideoTitle: video.title,
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
      videoId: video.videoId,
      videoTitle: video.title,
      energy: moodData.energy,
      valence: moodData.valence,
      tempo: moodData.tempo,
      genres: moodData.genres
    }
  }).catch(() => {});

  log.info('Playing with mood and video', { mood: moodData.mood_tag, videoId: video.videoId });
  return { success: true, data: currentState };
}

/**
 * Play music with mood data (searches for video)
 */
async function playWithMoodData(moodData, tabId, context, text) {
  // Try to get a curated video first for reliability
  const category = getMoodCategory(moodData);
  let video = getRandomCuratedVideo(category);
  
  // Optionally try API search for more variety (30% chance)
  if (Math.random() < 0.3) {
    try {
      const searchResult = await searchYouTubeVideo(moodData.search_query);
      if (searchResult && searchResult.videoId) {
        video = searchResult;
      }
    } catch (e) {
      log.warn('API search failed, using curated video', { error: e.message });
    }
  }

  currentState = {
    isPlaying: true,
    currentMood: moodData.mood_tag,
    currentQuery: moodData.search_query,
    currentVideoId: video.videoId,
    currentVideoTitle: video.title,
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
      videoId: video.videoId,
      videoTitle: video.title,
      energy: moodData.energy,
      valence: moodData.valence,
      tempo: moodData.tempo,
      genres: moodData.genres
    }
  }).catch(() => {});

  log.info('Playing with mood data', { mood: moodData.mood_tag, videoId: video.videoId });
  return { success: true, data: currentState };
}

/**
 * Refine instant playback with AI analysis (runs in background)
 */
async function refineWithAI(text, apiKey, context, tabId, instantData) {
  try {
    log.info('Starting AI refinement in background');
    
    const result = await analyzeSentiment(text, apiKey, context);
    const sanitizedResult = sanitizeObject(result);
    
    // Cache results
    setCachedAnalysis(text, sanitizedResult);
    if (context.url) {
      setDomainMood(context.url, context.siteCategory, sanitizedResult);
    }

    // Check if AI result is significantly different
    const instantMood = instantData.mood?.toLowerCase() || '';
    const aiMood = sanitizedResult.mood_tag?.toLowerCase() || '';
    
    // Only update if mood is different or energy/valence differ significantly
    const moodDifferent = !aiMood.includes(instantMood) && !instantMood.includes(aiMood);
    const energyDifferent = Math.abs((sanitizedResult.energy || 0.5) - (instantData.energy || 0.5)) > 0.3;
    
    if (moodDifferent || energyDifferent) {
      log.info('AI detected different mood, searching for better music', { 
        instant: instantMood, 
        ai: aiMood 
      });
      
      // Search for AI-recommended music
      const video = await searchYouTubeVideo(sanitizedResult.search_query);
      
      if (video) {
        // Update state
        currentState = {
          ...currentState,
          currentMood: sanitizedResult.mood_tag,
          currentQuery: sanitizedResult.search_query,
          moodData: sanitizedResult,
          isInstant: false,
          aiRefined: true
        };
        
        // Notify content script about AI refinement (smooth transition)
        chrome.tabs.sendMessage(tabId, {
          type: 'AI_REFINEMENT',
          data: {
            mood: sanitizedResult.mood_tag,
            query: sanitizedResult.search_query,
            videoId: video.videoId,
            videoTitle: video.title,
            energy: sanitizedResult.energy,
            valence: sanitizedResult.valence,
            tempo: sanitizedResult.tempo,
            genres: sanitizedResult.genres
          }
        }).catch(() => {});
        
        log.info('AI refinement complete - transition available');
      }
    } else {
      log.info('AI confirms instant mood - no change needed');
      
      // Still notify that AI analysis is complete
      chrome.tabs.sendMessage(tabId, {
        type: 'AI_CONFIRMED',
        data: { mood: sanitizedResult.mood_tag }
      }).catch(() => {});
    }
    
  } catch (error) {
    log.error('AI refinement error', error);
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
          clearDomainCache();
          sendResponse({ success: true, message: 'All caches cleared' });
          break;
        }

        case 'INSTANT_PLAY': {
          // Direct instant play request (from popup or manual trigger)
          const instantData = getInstantPlaybackData(message.context || {}, message.text || '');
          const video = instantData.videoId ? instantData : await searchYouTubeVideo(instantData.moodData?.search_query || 'ambient music');
          
          currentState = {
            isPlaying: true,
            currentMood: instantData.mood,
            currentQuery: instantData.moodData?.search_query || '',
            currentVideoId: video.videoId,
            currentVideoTitle: video.videoTitle || video.title,
            moodData: instantData.moodData,
            context: message.context || {},
            skipCount: 0,
            isInstant: true
          };

          await chrome.storage.local.set({ currentState });

          if (tabId || message.tabId) {
            chrome.tabs.sendMessage(tabId || message.tabId, {
              type: 'PLAY_MUSIC',
              data: instantData
            }).catch(() => {});
          }
          
          sendResponse({ success: true, data: currentState });
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
