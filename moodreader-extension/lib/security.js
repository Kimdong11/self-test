/**
 * MoodReader Security Utilities
 * Handles encryption, sanitization, and security-related functions
 */

/**
 * Simple encryption key derived from extension ID
 * Note: This is obfuscation, not true encryption. For production,
 * consider using chrome.storage.session or a more robust solution.
 */
const ENCRYPTION_SALT = 'MoodReader_v1_';

/**
 * Encode API key for storage (obfuscation)
 * @param {string} apiKey - Plain API key
 * @returns {string} - Encoded key
 */
export function encodeApiKey(apiKey) {
  if (!apiKey) return '';
  
  try {
    // Base64 encode with salt
    const salted = ENCRYPTION_SALT + apiKey;
    const encoded = btoa(unescape(encodeURIComponent(salted)));
    // Reverse and add checksum
    return encoded.split('').reverse().join('') + '_' + generateChecksum(apiKey);
  } catch (error) {
    console.error('Failed to encode API key:', error);
    return apiKey; // Fallback to plain
  }
}

/**
 * Decode API key from storage
 * @param {string} encodedKey - Encoded API key
 * @returns {string} - Plain API key
 */
export function decodeApiKey(encodedKey) {
  if (!encodedKey) return '';
  
  try {
    // Remove checksum
    const parts = encodedKey.split('_');
    if (parts.length < 2) return encodedKey; // Not encoded
    
    const encoded = parts.slice(0, -1).join('_');
    // Reverse and decode
    const reversed = encoded.split('').reverse().join('');
    const decoded = decodeURIComponent(escape(atob(reversed)));
    
    // Remove salt
    if (decoded.startsWith(ENCRYPTION_SALT)) {
      return decoded.substring(ENCRYPTION_SALT.length);
    }
    return encodedKey; // Not properly encoded
  } catch (error) {
    console.error('Failed to decode API key:', error);
    return encodedKey; // Return as-is if decoding fails
  }
}

/**
 * Generate simple checksum for validation
 * @param {string} str - Input string
 * @returns {string} - Checksum
 */
function generateChecksum(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Potentially unsafe text
 * @returns {string} - Escaped text
 */
export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  
  return text.replace(/[&<>"'`=/]/g, char => escapeMap[char]);
}

/**
 * Sanitize object values (for data from API)
 * @param {Object} obj - Object to sanitize
 * @returns {Object} - Sanitized object
 */
export function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = escapeHtml(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(v => typeof v === 'string' ? escapeHtml(v) : v);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Validate API key format
 * @param {string} apiKey - API key to validate
 * @returns {boolean} - Whether key appears valid
 */
export function isValidApiKeyFormat(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return false;
  // Gemini API keys are typically 39 characters
  return apiKey.length >= 30 && apiKey.length <= 50 && /^[A-Za-z0-9_-]+$/.test(apiKey);
}

/**
 * Validate URL to prevent open redirects
 * @param {string} url - URL to validate
 * @returns {boolean} - Whether URL is safe
 */
export function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Create safe element with text content (XSS-safe)
 * @param {string} tag - HTML tag name
 * @param {string} text - Text content
 * @param {Object} attributes - Element attributes
 * @returns {HTMLElement}
 */
export function createSafeElement(tag, text = '', attributes = {}) {
  const element = document.createElement(tag);
  element.textContent = text;
  
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'class') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (!key.startsWith('on')) { // Prevent event handler injection
      element.setAttribute(key, value);
    }
  }
  
  return element;
}
