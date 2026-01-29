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
 * Now with multiple options for variety
 */
const SITE_MOOD_MAP = {
  news: ['focus', 'cinematic'],
  tech: ['focus', 'electronic', 'energetic'],
  academic: ['focus', 'piano', 'ambient'],
  lifestyle: ['relax', 'jazz', 'nature'],
  entertainment: ['cinematic', 'electronic', 'energetic'],
  blog: ['relax', 'focus', 'jazz'],
  other: ['focus', 'relax', 'jazz', 'ambient', 'piano'] // More variety for uncategorized sites
};

/**
 * Time of day to mood preference with multiple options
 */
const TIME_MOOD_MAP = {
  morning: { moods: ['relax', 'focus', 'nature'], energy: 0.4 },
  afternoon: { moods: ['focus', 'energetic', 'jazz'], energy: 0.6 },
  evening: { moods: ['relax', 'cinematic', 'jazz', 'piano'], energy: 0.4 },
  night: { moods: ['relax', 'ambient', 'piano', 'nature'], energy: 0.2 }
};

/**
 * Pick random item from array
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

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
  
  // If no strong keyword match, use site category default with variety
  if (!detectedMood || maxScore < 1.5) {
    const siteMoods = SITE_MOOD_MAP[siteCategory] || SITE_MOOD_MAP.other;
    detectedMood = pickRandom(siteMoods);
    log.info('Using site category mood (random)', { siteCategory, mood: detectedMood, options: siteMoods });
  } else {
    log.info('Keyword-based mood detection', { mood: detectedMood, score: maxScore });
  }
  
  // Adjust based on time of day (sometimes override with time-appropriate mood)
  const timePrefs = TIME_MOOD_MAP[timeOfDay] || TIME_MOOD_MAP.afternoon;
  
  // 30% chance to use time-based mood instead for variety
  if (maxScore < 2 && Math.random() < 0.3) {
    detectedMood = pickRandom(timePrefs.moods);
    log.info('Using time-based mood override', { timeOfDay, mood: detectedMood });
  }
  
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
 * Now with improved variety to avoid repetition
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
    // Use site category with random selection from options
    const siteMoods = SITE_MOOD_MAP[siteCategory] || SITE_MOOD_MAP.other;
    mood = pickRandom(siteMoods);
    
    // Time-based adjustment (30% chance to override)
    const timePrefs = TIME_MOOD_MAP[timeOfDay];
    if (timePrefs && Math.random() < 0.3) {
      mood = pickRandom(timePrefs.moods);
    }
  }
  
  // Get curated video for this mood (now avoids recently played)
  const video = getRandomCuratedVideo(mood);
  
  // Build mood data
  const moodData = buildInstantMoodData(mood, context);
  
  log.info('Instant playback data generated', { mood, videoId: video.videoId, category: siteCategory });
  
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
    },
    // New moods for variety
    piano: {
      mood_tag: 'Piano Serenity',
      energy: 0.25,
      valence: 0.55,
      tempo: 'slow',
      genres: ['classical', 'piano'],
      instrumentation: ['piano'],
      search_query: 'Beautiful piano music relaxing instrumental'
    },
    jazz: {
      mood_tag: 'Smooth Jazz',
      energy: 0.4,
      valence: 0.65,
      tempo: 'medium',
      genres: ['jazz', 'cafe'],
      instrumentation: ['piano', 'saxophone', 'bass'],
      search_query: 'Smooth jazz coffee shop background music'
    },
    ambient: {
      mood_tag: 'Ambient Space',
      energy: 0.15,
      valence: 0.5,
      tempo: 'slow',
      genres: ['ambient', 'atmospheric'],
      instrumentation: ['synth', 'pad'],
      search_query: 'Deep ambient music atmospheric soundscape'
    },
    nature: {
      mood_tag: 'Nature Sounds',
      energy: 0.1,
      valence: 0.6,
      tempo: 'slow',
      genres: ['nature', 'ambient'],
      instrumentation: ['nature sounds'],
      search_query: 'Nature sounds rain forest relaxing'
    },
    electronic: {
      mood_tag: 'Electronic Vibes',
      energy: 0.7,
      valence: 0.65,
      tempo: 'medium',
      genres: ['electronic', 'synthwave'],
      instrumentation: ['synth', 'drums'],
      search_query: 'Electronic chill music focus instrumental'
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
