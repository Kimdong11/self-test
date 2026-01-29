/**
 * MoodReader Instant Play Module
 * Provides quick, rule-based mood detection for immediate music playback
 * 
 * This module enables instant music playback by:
 * 1. Quick keyword-based mood detection (no API call)
 * 2. Site category matching to curated music
 * 3. Time-of-day based defaults
 */

import { Logger } from './logger.js';
import { getRandomCuratedVideo, FALLBACK_VIDEOS } from './youtube.js';

const log = Logger.scope('InstantPlay');

/**
 * Keyword patterns for quick mood detection
 * Maps keywords to mood categories
 */
const MOOD_KEYWORDS = {
  focus: {
    keywords: ['study', 'work', 'productivity', 'focus', 'concentrate', 'learn', 'tutorial', 
               'guide', 'how-to', 'documentation', 'code', 'programming', 'development'],
    weight: 1.0
  },
  sad: {
    keywords: ['sad', 'death', 'tragedy', 'loss', 'grief', 'depression', 'crying', 
               'heartbreak', 'memorial', 'farewell', 'goodbye', 'misfortune'],
    weight: 1.2
  },
  energetic: {
    keywords: ['exciting', 'amazing', 'incredible', 'breakthrough', 'revolution', 
               'success', 'victory', 'win', 'achieve', 'motivation', 'inspire', 'energy'],
    weight: 1.0
  },
  relax: {
    keywords: ['calm', 'peaceful', 'serene', 'nature', 'travel', 'vacation', 
               'meditation', 'wellness', 'spa', 'garden', 'beach', 'relax'],
    weight: 1.0
  },
  cinematic: {
    keywords: ['movie', 'film', 'cinema', 'review', 'trailer', 'epic', 
               'story', 'drama', 'adventure', 'fantasy', 'science fiction'],
    weight: 0.9
  }
};

/**
 * Site category to default mood mapping
 */
const SITE_MOOD_MAP = {
  news: 'focus',
  tech: 'focus',
  academic: 'focus',
  lifestyle: 'relax',
  entertainment: 'cinematic',
  blog: 'relax',
  other: 'focus'
};

/**
 * Time of day to mood preference
 */
const TIME_MOOD_MAP = {
  morning: { primary: 'relax', secondary: 'focus', energy: 0.4 },
  afternoon: { primary: 'focus', secondary: 'energetic', energy: 0.6 },
  evening: { primary: 'relax', secondary: 'cinematic', energy: 0.4 },
  night: { primary: 'relax', secondary: 'sad', energy: 0.2 }
};

/**
 * Quick mood detection using keyword matching
 * @param {string} text - Text to analyze (first ~500 chars)
 * @param {Object} context - Context information
 * @returns {Object} - Quick mood analysis result
 */
export function quickMoodDetection(text, context = {}) {
  const startTime = performance.now();
  
  // Normalize text for matching
  const normalizedText = (text || '').toLowerCase().substring(0, 500);
  const { timeOfDay = 'afternoon', siteCategory = 'other' } = context;
  
  // Score each mood based on keyword matches
  const scores = {};
  let maxScore = 0;
  let detectedMood = null;
  
  for (const [mood, config] of Object.entries(MOOD_KEYWORDS)) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (normalizedText.includes(keyword)) {
        score += config.weight;
      }
    }
    scores[mood] = score;
    
    if (score > maxScore) {
      maxScore = score;
      detectedMood = mood;
    }
  }
  
  // If no strong keyword match, use site category default
  if (!detectedMood || maxScore < 1.5) {
    detectedMood = SITE_MOOD_MAP[siteCategory] || 'focus';
    log.info('Using site category default mood', { siteCategory, mood: detectedMood });
  } else {
    log.info('Keyword-based mood detection', { mood: detectedMood, score: maxScore });
  }
  
  // Adjust based on time of day
  const timePrefs = TIME_MOOD_MAP[timeOfDay] || TIME_MOOD_MAP.afternoon;
  
  const duration = performance.now() - startTime;
  log.info(`Quick mood detection completed in ${duration.toFixed(2)}ms`);
  
  return {
    mood: detectedMood,
    confidence: maxScore > 0 ? Math.min(maxScore / 5, 1) : 0.3,
    energy: timePrefs.energy,
    source: maxScore >= 1.5 ? 'keywords' : 'category'
  };
}

/**
 * Get instant playback data without API call
 * @param {Object} context - Context with siteCategory, timeOfDay, etc.
 * @param {string} text - Optional text for quick analysis
 * @returns {Object} - Playback data with video info
 */
export function getInstantPlaybackData(context = {}, text = '') {
  const { timeOfDay = 'afternoon', siteCategory = 'other' } = context;
  
  // Quick mood detection if text provided
  let mood;
  if (text && text.length > 50) {
    const detection = quickMoodDetection(text, context);
    mood = detection.mood;
  } else {
    // Use site category default
    mood = SITE_MOOD_MAP[siteCategory] || 'focus';
    
    // Time-based adjustment
    const timePrefs = TIME_MOOD_MAP[timeOfDay];
    if (timePrefs && Math.random() > 0.7) {
      mood = timePrefs.primary;
    }
  }
  
  // Get curated video for this mood
  const video = getRandomCuratedVideo(mood);
  
  // Build mood data
  const moodData = buildInstantMoodData(mood, context);
  
  log.info('Instant playback data generated', { mood, videoId: video.videoId });
  
  return {
    mood: moodData.mood_tag,
    videoId: video.videoId,
    videoTitle: video.title,
    energy: moodData.energy,
    valence: moodData.valence,
    tempo: moodData.tempo,
    genres: moodData.genres,
    isInstant: true,
    moodData: moodData
  };
}

/**
 * Build mood data object for instant playback
 * @param {string} mood - Detected mood
 * @param {Object} context - Context information
 * @returns {Object} - Mood data object
 */
function buildInstantMoodData(mood, context = {}) {
  const { timeOfDay = 'afternoon' } = context;
  
  const moodProfiles = {
    focus: {
      mood_tag: 'Deep Focus',
      energy: 0.3,
      valence: 0.5,
      tempo: 'slow',
      genres: ['lo-fi', 'ambient'],
      instrumentation: ['piano', 'synth'],
      search_query: 'Lo-fi hip hop study beats instrumental'
    },
    relax: {
      mood_tag: 'Calm & Peaceful',
      energy: 0.2,
      valence: 0.6,
      tempo: 'slow',
      genres: ['ambient', 'acoustic'],
      instrumentation: ['guitar', 'piano'],
      search_query: 'Relaxing ambient music calm instrumental'
    },
    sad: {
      mood_tag: 'Reflective Mood',
      energy: 0.2,
      valence: 0.3,
      tempo: 'slow',
      genres: ['classical', 'ambient'],
      instrumentation: ['piano', 'strings'],
      search_query: 'Melancholic piano ambient no lyrics'
    },
    energetic: {
      mood_tag: 'High Energy',
      energy: 0.8,
      valence: 0.7,
      tempo: 'fast',
      genres: ['electronic', 'upbeat'],
      instrumentation: ['synth', 'drums'],
      search_query: 'Upbeat electronic workout music instrumental'
    },
    cinematic: {
      mood_tag: 'Cinematic',
      energy: 0.5,
      valence: 0.5,
      tempo: 'medium',
      genres: ['orchestral', 'cinematic'],
      instrumentation: ['orchestra', 'strings'],
      search_query: 'Epic cinematic music instrumental'
    }
  };
  
  const profile = moodProfiles[mood] || moodProfiles.focus;
  
  // Time-based energy adjustment
  const timeEnergy = TIME_MOOD_MAP[timeOfDay]?.energy || 0.5;
  profile.energy = (profile.energy + timeEnergy) / 2;
  
  return profile;
}

/**
 * Determine if AI refinement is needed
 * @param {Object} instantResult - Result from instant detection
 * @param {number} textLength - Length of article text
 * @returns {boolean} - Whether to proceed with AI analysis
 */
export function shouldRefineWithAI(instantResult, textLength) {
  // Skip AI if confidence is very high
  if (instantResult.confidence > 0.8) {
    return false;
  }
  
  // Skip AI for very short content
  if (textLength < 200) {
    return false;
  }
  
  // Proceed with AI for more nuanced results
  return true;
}

/**
 * Merge instant result with AI result
 * @param {Object} instantData - Instant playback data
 * @param {Object} aiResult - AI analysis result
 * @returns {Object} - Merged result
 */
export function mergeWithAIResult(instantData, aiResult) {
  if (!aiResult) return instantData;
  
  return {
    ...instantData,
    mood: aiResult.mood_tag || instantData.mood,
    energy: aiResult.energy || instantData.energy,
    valence: aiResult.valence || instantData.valence,
    tempo: aiResult.tempo || instantData.tempo,
    genres: aiResult.genres || instantData.genres,
    isInstant: false,
    aiRefined: true,
    moodData: aiResult
  };
}
