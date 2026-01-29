/**
 * MoodReader Constants and Configuration
 * Centralized configuration management
 */

// Timing constants (in milliseconds)
export const TIMING = {
  DYNAMIC_CONTENT_DELAY: 1000,
  AUTO_MINIMIZE_DELAY: 1200,
  PLAYER_INIT_DELAY: 1000,
  API_TIMEOUT: 5000,
  RETRY_DELAY: 500
};

// Text extraction configuration
export const TEXT_CONFIG = {
  MAX_LENGTH: 1500,
  MIN_LENGTH: 50,
  MIN_PARAGRAPH_LENGTH: 20,
  MIN_ARTICLE_LENGTH: 100
};

// Excluded HTML tags for text extraction
export const EXCLUDED_TAGS = [
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 
  'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'FORM', 
  'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'
];

// Default extension settings
export const DEFAULT_SETTINGS = {
  apiKey: '',
  apiKeyEncrypted: false,
  volume: 50,
  enabled: true,
  excludedDomains: [
    'youtube.com', 
    'netflix.com', 
    'spotify.com', 
    'music.youtube.com', 
    'soundcloud.com', 
    'twitch.tv', 
    'vimeo.com', 
    'dailymotion.com',
    'primevideo.com',
    'disneyplus.com'
  ],
  autoAnalyze: true,
  cacheEnabled: true,
  cacheDuration: 30 * 60 * 1000 // 30 minutes
};

// Mood types
export const MOOD_TYPES = {
  FOCUS: 'focus',
  RELAX: 'relax',
  SAD: 'sad',
  ENERGETIC: 'energetic',
  CINEMATIC: 'cinematic',
  NATURE: 'nature'
};

// Site categories for context detection
export const SITE_CATEGORIES = {
  NEWS: 'news',
  TECH: 'tech',
  ACADEMIC: 'academic',
  LIFESTYLE: 'lifestyle',
  ENTERTAINMENT: 'entertainment',
  BLOG: 'blog',
  OTHER: 'other'
};

// Error codes
export const ERROR_CODES = {
  API_KEY_MISSING: 'API_KEY_MISSING',
  API_ERROR: 'API_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  VIDEO_NOT_FOUND: 'VIDEO_NOT_FOUND',
  INSUFFICIENT_CONTENT: 'INSUFFICIENT_CONTENT'
};
