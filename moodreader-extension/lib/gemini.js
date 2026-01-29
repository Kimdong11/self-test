/**
 * Gemini API Integration Module
 * Handles sentiment analysis and music query generation
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

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

  const url = `${GEMINI_API_BASE}?key=${apiKey}`;

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

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
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

    return {
      mood_tag: result.mood_tag,
      search_query: result.search_query
    };
  } catch (error) {
    console.error('Gemini API call failed:', error);
    throw error;
  }
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
