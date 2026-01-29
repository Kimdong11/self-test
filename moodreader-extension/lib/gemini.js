/**
 * Gemini API Integration Module
 * Enhanced sentiment analysis with multi-dimensional mood detection
 * 
 * Performance: Request deduplication, timeout handling
 * Security: Input validation, response sanitization
 */

import { Logger } from './logger.js';

const log = Logger.scope('Gemini');

// Available Gemini models to try (in order of preference)
const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash-latest', 
  'gemini-1.5-flash',
  'gemini-pro'
];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const API_TIMEOUT = 15000; // 15 seconds

// Request deduplication - prevent duplicate concurrent requests
const pendingRequests = new Map();

/**
 * Enhanced system prompt for multi-dimensional mood analysis
 */
const SYSTEM_PROMPT = `Persona: You are an expert Music Supervisor and Audio Branding Specialist for films and digital content.

Task: Analyze the provided text and context to determine the most appropriate background music with detailed musical attributes.

Context Information Provided:
- timeOfDay: Current time period (morning/afternoon/evening/night)
- siteCategory: Type of website (news/blog/tech/academic/lifestyle/other)
- articleLength: short (<500), medium (500-1500), or long (>1500 characters)
- language: Detected language of the content

Output Requirements (JSON only):
{
  "mood_tag": "A short, evocative description (e.g., 'Deep Contemplation', 'Energetic Discovery')",
  "energy": 0.0-1.0 (0=very calm, 1=very energetic),
  "valence": 0.0-1.0 (0=melancholic/serious, 1=happy/uplifting),
  "tempo": "slow" | "medium" | "fast",
  "genres": ["primary genre", "secondary genre"],
  "instrumentation": ["instrument1", "instrument2"],
  "search_query": "YouTube-optimized search string"
}

Search Query Rules (Crucial):
- DO NOT use specific artist names or copyrighted song titles
- DO use atmospheric keywords: "Lo-fi", "Ambient", "Cinematic", "Instrumental", "BGM", "Soundscape"
- DO append "no lyrics" or "instrumental" for focus-friendly music
- Match energy level: low energy = ambient/slow, high energy = upbeat/driving
- Consider time of day: morning = gentle/inspiring, night = calm/atmospheric
- Consider article type: tech = electronic/modern, lifestyle = acoustic/warm

Examples:
- Tech article, morning, medium energy → "Modern electronic ambient focus music instrumental"
- News article, evening, low valence → "Atmospheric piano news background ambient no lyrics"
- Blog post, afternoon, high valence → "Uplifting acoustic indie instrumental BGM"

IMPORTANT: Return ONLY valid JSON, no markdown, no code blocks.`;

/**
 * Detect time of day
 * @returns {'morning'|'afternoon'|'evening'|'night'}
 */
export function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Detect site category from URL and meta tags
 * @param {string} url - Current page URL
 * @param {string} title - Page title
 * @returns {'news'|'blog'|'tech'|'academic'|'lifestyle'|'entertainment'|'other'}
 */
export function detectSiteCategory(url, title = '') {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const combined = urlLower + ' ' + titleLower;

  if (/news|times|post|herald|journal|reuters|associated press|cnn|bbc|nyt/i.test(combined)) {
    return 'news';
  }
  if (/tech|developer|programming|coding|github|stackoverflow|hackernews|verge|wired|ars|engadget/i.test(combined)) {
    return 'tech';
  }
  if (/research|academic|journal|paper|study|university|\.edu|arxiv|scholar/i.test(combined)) {
    return 'academic';
  }
  if (/lifestyle|food|recipe|travel|fashion|beauty|health|wellness|fitness/i.test(combined)) {
    return 'lifestyle';
  }
  if (/entertainment|movie|film|tv|series|review|game|gaming/i.test(combined)) {
    return 'entertainment';
  }
  if (/blog|medium\.com|substack|wordpress|blogger|personal|story|thoughts/i.test(combined)) {
    return 'blog';
  }
  
  return 'other';
}

/**
 * Detect language from text
 * @param {string} text - Text to analyze
 * @returns {string} - Detected language code
 */
export function detectLanguage(text) {
  const koreanRegex = /[\uAC00-\uD7AF]/;
  const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
  const chineseRegex = /[\u4E00-\u9FFF]/;
  
  if (koreanRegex.test(text)) return 'ko';
  if (japaneseRegex.test(text)) return 'ja';
  if (chineseRegex.test(text) && !japaneseRegex.test(text)) return 'zh';
  
  return 'en';
}

/**
 * Get article length category
 * @param {number} length - Character count
 * @returns {'short'|'medium'|'long'}
 */
export function getArticleLength(length) {
  if (length < 500) return 'short';
  if (length < 1500) return 'medium';
  return 'long';
}

/**
 * Build context object for enhanced analysis
 * @param {string} text - Article text
 * @param {string} url - Page URL
 * @param {string} title - Page title
 * @returns {Object} - Context object
 */
export function buildContext(text, url, title = '') {
  return {
    timeOfDay: getTimeOfDay(),
    siteCategory: detectSiteCategory(url, title),
    articleLength: getArticleLength(text.length),
    language: detectLanguage(text)
  };
}

/**
 * Generate request key for deduplication (improved hash)
 */
function generateRequestKey(text) {
  // Use longer sample and include more entropy
  const sample = text.substring(0, 300).trim();
  let hash1 = 0;
  let hash2 = 0;
  
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    hash1 = ((hash1 << 5) - hash1) + char;
    hash1 = hash1 & hash1;
    hash2 = ((hash2 << 7) - hash2) + char;
    hash2 = hash2 & hash2;
  }
  
  return `req_${Math.abs(hash1).toString(16)}_${Math.abs(hash2).toString(16)}_${text.length}`;
}

/**
 * Analyze text and get music recommendation from Gemini
 * @param {string} text - The article text to analyze
 * @param {string} apiKey - Gemini API key
 * @param {Object} context - Context information
 * @returns {Promise<Object>} - Enhanced mood analysis result
 */
export async function analyzeSentiment(text, apiKey, context = {}) {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('No text provided for analysis');
  }

  // Request deduplication
  const requestKey = generateRequestKey(text);
  if (pendingRequests.has(requestKey)) {
    log.info('Returning existing pending request');
    return pendingRequests.get(requestKey);
  }

  // Build the prompt with context
  const contextString = `
Context:
- Time of Day: ${context.timeOfDay || 'unknown'}
- Site Category: ${context.siteCategory || 'unknown'}
- Article Length: ${context.articleLength || 'unknown'}
- Language: ${context.language || 'en'}

Input Text:
${text.substring(0, 1500)}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `${SYSTEM_PROMPT}\n\n${contextString}`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 512,
      responseMimeType: "application/json"
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
    ]
  };

  let lastError = null;

  // Create the analysis promise
  const analysisPromise = (async () => {
    try {
      // Try each model until one works
      for (const model of GEMINI_MODELS) {
        const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
        
        try {
          log.info(`Trying model: ${model}`);
          
          // Create AbortController for timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
          
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.error?.message || 'Unknown error';
            
            if (response.status === 404) {
              log.warn(`Model ${model} not available, trying next...`);
              lastError = new Error(`Model ${model} not found`);
              continue;
            }
            
            throw new Error(`Gemini API error: ${response.status} - ${errorMsg}`);
          }

          const data = await response.json();
          const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (!textContent) {
            throw new Error('No content in Gemini response');
          }

          // Parse the JSON response
          let result;
          try {
            let cleanedContent = textContent.trim();
            if (cleanedContent.startsWith('```json')) {
              cleanedContent = cleanedContent.slice(7);
            }
            if (cleanedContent.startsWith('```')) {
              cleanedContent = cleanedContent.slice(3);
            }
            if (cleanedContent.endsWith('```')) {
              cleanedContent = cleanedContent.slice(0, -3);
            }
            cleanedContent = cleanedContent.trim();
            
            result = JSON.parse(cleanedContent);
          } catch (parseError) {
            log.error('Failed to parse response', parseError, { textContent });
            throw new Error('Invalid JSON response from Gemini');
          }

          // Validate and normalize the response
          const normalizedResult = {
            mood_tag: result.mood_tag || 'Ambient Focus',
            energy: Math.max(0, Math.min(1, result.energy || 0.5)),
            valence: Math.max(0, Math.min(1, result.valence || 0.5)),
            tempo: ['slow', 'medium', 'fast'].includes(result.tempo) ? result.tempo : 'medium',
            genres: Array.isArray(result.genres) ? result.genres : ['ambient'],
            instrumentation: Array.isArray(result.instrumentation) ? result.instrumentation : ['piano'],
            search_query: result.search_query || 'ambient instrumental background music'
          };

          log.info(`Success with model: ${model}`, normalizedResult);
          return normalizedResult;
          
        } catch (error) {
          log.error(`API call failed with model ${model}`, error);
          lastError = error;
          
          if (error.name === 'AbortError') {
            log.warn(`Model ${model} timed out, trying next...`);
            continue;
          }
          
          if (!error.message.includes('not found') && !error.message.includes('404')) {
            throw error;
          }
        }
      }

      throw lastError || new Error('All Gemini models failed');
    } finally {
      pendingRequests.delete(requestKey);
    }
  })();

  pendingRequests.set(requestKey, analysisPromise);
  return analysisPromise;
}

/**
 * Enhanced fallback music queries based on context
 */
export function getFallbackMusicQuery(mood, context = {}) {
  const timeOfDay = context.timeOfDay || getTimeOfDay();
  const siteCategory = context.siteCategory || 'other';
  
  const moodQueries = {
    focus: {
      mood_tag: 'Deep Focus',
      energy: 0.3,
      valence: 0.5,
      tempo: 'slow',
      genres: ['lo-fi', 'ambient'],
      instrumentation: ['piano', 'synth'],
      search_query: 'Lo-fi hip hop study beats instrumental no lyrics 1 hour'
    },
    relax: {
      mood_tag: 'Calm & Peaceful',
      energy: 0.2,
      valence: 0.6,
      tempo: 'slow',
      genres: ['acoustic', 'ambient'],
      instrumentation: ['guitar', 'piano'],
      search_query: 'Calm acoustic guitar ambient relaxing instrumental BGM'
    },
    sad: {
      mood_tag: 'Melancholic Reflection',
      energy: 0.2,
      valence: 0.2,
      tempo: 'slow',
      genres: ['classical', 'ambient'],
      instrumentation: ['piano', 'cello'],
      search_query: 'Melancholic piano solo emotional ambient no lyrics'
    },
    energetic: {
      mood_tag: 'High Energy',
      energy: 0.8,
      valence: 0.7,
      tempo: 'fast',
      genres: ['electronic', 'upbeat'],
      instrumentation: ['synth', 'drums'],
      search_query: 'Upbeat electronic instrumental workout motivation BGM'
    },
    cinematic: {
      mood_tag: 'Epic Cinematic',
      energy: 0.6,
      valence: 0.5,
      tempo: 'medium',
      genres: ['orchestral', 'cinematic'],
      instrumentation: ['orchestra', 'strings'],
      search_query: 'Epic cinematic orchestral soundtrack instrumental no lyrics'
    },
    nature: {
      mood_tag: 'Nature & Ambient',
      energy: 0.1,
      valence: 0.6,
      tempo: 'slow',
      genres: ['nature', 'ambient'],
      instrumentation: ['nature sounds', 'ambient'],
      search_query: 'Nature sounds forest rain ambient relaxation soundscape'
    }
  };

  let query = { ...(moodQueries[mood] || moodQueries.focus) };
  
  // Adjust based on time of day
  if (timeOfDay === 'night') {
    query.energy = Math.max(0.1, query.energy - 0.2);
    query.search_query = query.search_query + ' calm night';
  } else if (timeOfDay === 'morning') {
    query.valence = Math.min(1, query.valence + 0.1);
    query.search_query = query.search_query + ' morning';
  }

  // Adjust based on site category
  if (siteCategory === 'tech') {
    query.search_query = query.search_query.replace('acoustic', 'electronic');
  } else if (siteCategory === 'academic') {
    query.search_query = query.search_query + ' concentration';
  }

  return query;
}

/**
 * Generate alternative search query for skip functionality
 */
export function generateAlternativeQuery(currentMood, skipCount = 0) {
  const variations = [
    'mix', 'playlist', 'compilation', '2024', 'best', 
    'deep', 'chill', 'smooth', 'soft', 'ambient mix'
  ];
  
  const variation = variations[skipCount % variations.length];
  const baseQuery = currentMood.search_query || 'ambient instrumental';
  
  if (skipCount > 3) {
    const energyMod = currentMood.energy > 0.5 ? 'calm' : 'upbeat';
    return `${energyMod} ${baseQuery} ${variation}`;
  }
  
  return `${baseQuery} ${variation}`;
}
