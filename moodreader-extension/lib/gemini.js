/**
 * Gemini API Integration Module
 * Handles sentiment analysis and music query generation
 */

// Available Gemini models to try (in order of preference)
const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash-latest', 
  'gemini-1.5-flash',
  'gemini-pro'
];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * System prompt for Gemini - Professional Music Supervisor persona
 */
const SYSTEM_PROMPT = `Persona: You are a professional Music Supervisor for films and digital content.

Task: Analyze the provided text and determine the most appropriate background music.

Output Requirements (JSON only):
- mood_tag: A short string representing the vibe (e.g., "Deep & Technical", "Melancholic Reflection").
- search_query: A YouTube-optimized search string.

Search Query Rules (Crucial):
- DO NOT return specific artist names or copyrighted song titles (e.g., No "Taylor Swift", No "Interstellar OST").
- DO use atmospheric keywords: "Lo-fi", "Ambient", "Cinematic", "Instrumental", "BGM", "Soundscape".
- DO append "-live" or "no lyrics" to ensure continuous, non-distracting background music.

Examples:
- Instead of "Interstellar", use "Epic cinematic space ambient instrumental".
- Instead of "Jazz music", use "Coffee shop jazz piano background music no lyrics".
- Instead of "Sad song", use "Melancholic solo cello dark academia BGM".

IMPORTANT: Return ONLY valid JSON, no markdown, no code blocks, just the JSON object.`;

/**
 * Analyze text and get music recommendation from Gemini
 * @param {string} text - The article text to analyze
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<{mood_tag: string, search_query: string}>}
 */
export async function analyzeSentiment(text, apiKey) {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('No text provided for analysis');
  }

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `${SYSTEM_PROMPT}\n\nInput Text:\n${text}`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 256,
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

  // Try each model until one works
  for (const model of GEMINI_MODELS) {
    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
    
    try {
      console.log(`Trying Gemini model: ${model}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

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

      // Validate the response structure
      if (!result.mood_tag || !result.search_query) {
        throw new Error('Incomplete response from Gemini');
      }

      console.log(`Successfully used model: ${model}`);
      return {
        mood_tag: result.mood_tag,
        search_query: result.search_query
      };
      
    } catch (error) {
      console.error(`Gemini API call failed with model ${model}:`, error);
      lastError = error;
      
      // If it's not a 404, don't try other models
      if (!error.message.includes('not found') && !error.message.includes('404')) {
        throw error;
      }
    }
  }

  // If all models failed
  throw lastError || new Error('All Gemini models failed');
}

/**
 * Get a fallback music query based on manual mood selection
 * @param {string} mood - The mood type (focus, relax, sad, energetic)
 * @returns {{mood_tag: string, search_query: string}}
 */
export function getFallbackMusicQuery(mood) {
  const moodQueries = {
    focus: {
      mood_tag: 'Deep Focus',
      search_query: 'Lo-fi hip hop study beats instrumental no lyrics 1 hour'
    },
    relax: {
      mood_tag: 'Calm & Peaceful',
      search_query: 'Calm acoustic guitar ambient relaxing instrumental BGM'
    },
    sad: {
      mood_tag: 'Melancholic Reflection',
      search_query: 'Melancholic piano solo emotional ambient no lyrics'
    },
    energetic: {
      mood_tag: 'High Energy',
      search_query: 'Upbeat electronic instrumental workout motivation BGM'
    },
    cinematic: {
      mood_tag: 'Epic Cinematic',
      search_query: 'Epic cinematic orchestral soundtrack instrumental no lyrics'
    },
    nature: {
      mood_tag: 'Nature & Ambient',
      search_query: 'Nature sounds forest rain ambient relaxation soundscape'
    }
  };

  return moodQueries[mood] || moodQueries.focus;
}
