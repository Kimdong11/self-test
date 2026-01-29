/**
 * Gemini API Integration Module
 * Enhanced sentiment analysis with multi-dimensional mood detection
 * 
 * Performance: Request deduplication, timeout handling
 * Security: Input validation, response sanitization
 */

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

  // News sites
  if (/news|times|post|herald|journal|reuters|associated press|cnn|bbc|nyt/i.test(combined)) {
    return 'news';
  }
  
  // Tech sites
  if (/tech|developer|programming|coding|github|stackoverflow|hackernews|verge|wired|ars|engadget/i.test(combined)) {
    return 'tech';
  }
  
  // Academic
  if (/research|academic|journal|paper|study|university|\.edu|arxiv|scholar/i.test(combined)) {
    return 'academic';
  }
  
  // Lifestyle
  if (/lifestyle|food|recipe|travel|fashion|beauty|health|wellness|fitness/i.test(combined)) {
    return 'lifestyle';
  }
  
  // Entertainment
  if (/entertainment|movie|film|tv|series|review|game|gaming/i.test(combined)) {
    return 'entertainment';
  }
  
  // Blog indicators
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
  // Simple detection based on character sets
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
 * Generate request key for deduplication
 */
function generateRequestKey(text) {
  const sample = text.substring(0, 100);
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    hash = ((hash << 5) - hash) + sample.charCodeAt(i);
    hash = hash & hash;
  }
  return `req_${Math.abs(hash)}`;
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

  // Request deduplication - return existing promise if same request is pending
  const requestKey = generateRequestKey(text);
  if (pendingRequests.has(requestKey)) {
    console.log('Returning existing pending request');
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
${text.substring(0, 1500)}`; // Limit text length

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
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      }
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
          console.log(`Trying Gemini model: ${model}`);
          
          // Create AbortController for timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
          
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || 'Unknown error';
        
        // If model not found, try the next one
        if (response.status === 404) {
          console.warn(`Model ${model} not available, trying next...`);
          lastError = new Error(`Model ${model} not found`);
          continue;
        }
        
        throw new Error(`Gemini API error: ${response.status} - ${errorMsg}`);
      }

      const data = await response.json();
      
      // Extract the text content from the response
      const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textContent) {
        throw new Error('No content in Gemini response');
      }

      // Parse the JSON response
      let result;
      try {
        // Clean up the response in case it has markdown code blocks
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
        console.error('Failed to parse Gemini response:', textContent);
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

          console.log(`Successfully analyzed with model: ${model}`, normalizedResult);
          return normalizedResult;
          
        } catch (error) {
          console.error(`Gemini API call failed with model ${model}:`, error);
          lastError = error;
          
          // If it's a timeout or network error, try next model
          if (error.name === 'AbortError') {
            console.warn(`Model ${model} timed out, trying next...`);
            continue;
          }
          
          // If it's not a 404, don't try other models
          if (!error.message.includes('not found') && !error.message.includes('404')) {
            throw error;
          }
        }
      }

      // If all models failed
      throw lastError || new Error('All Gemini models failed');
    } finally {
      // Clean up pending request
      pendingRequests.delete(requestKey);
    }
  })();

  // Store the promise for deduplication
  pendingRequests.set(requestKey, analysisPromise);
  
  return analysisPromise;
}

/**
 * Enhanced fallback music queries based on context
 * @param {string} mood - The mood type
 * @param {Object} context - Context information
 * @returns {Object} - Music query data
 */
export function getFallbackMusicQuery(mood, context = {}) {
  const timeOfDay = context.timeOfDay || getTimeOfDay();
  const siteCategory = context.siteCategory || 'other';
  
  // Base mood queries
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

  let query = moodQueries[mood] || moodQueries.focus;
  
  // Adjust based on time of day
  if (timeOfDay === 'night') {
    query = {
      ...query,
      energy: Math.max(0.1, query.energy - 0.2),
      search_query: query.search_query + ' calm night'
    };
  } else if (timeOfDay === 'morning') {
    query = {
      ...query,
      valence: Math.min(1, query.valence + 0.1),
      search_query: query.search_query + ' morning'
    };
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
 * @param {Object} currentMood - Current mood analysis result
 * @param {number} skipCount - Number of times skipped
 * @returns {string} - Alternative search query
 */
export function generateAlternativeQuery(currentMood, skipCount = 0) {
  const variations = [
    'mix', 'playlist', 'compilation', '2024', 'best', 
    'deep', 'chill', 'smooth', 'soft', 'ambient mix'
  ];
  
  const variation = variations[skipCount % variations.length];
  const baseQuery = currentMood.search_query || 'ambient instrumental';
  
  // Modify query based on energy/valence if user keeps skipping
  if (skipCount > 3) {
    // Try different energy level
    const energyMod = currentMood.energy > 0.5 ? 'calm' : 'upbeat';
    return `${energyMod} ${baseQuery} ${variation}`;
  }
  
  return `${baseQuery} ${variation}`;
}
