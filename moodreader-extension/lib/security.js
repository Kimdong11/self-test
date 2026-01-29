/**
 * MoodReader Security Utilities
 * Handles encryption, sanitization, and security-related functions
 */

import { Logger } from './logger.js';

const log = Logger.scope('Security');

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
    const salted = ENCRYPTION_SALT + apiKey;
    const encoded = btoa(unescape(encodeURIComponent(salted)));
    return encoded.split('').reverse().join('') + '_' + generateChecksum(apiKey);
  } catch (error) {
    log.error('Failed to encode API key', error);
    return apiKey;
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
    const parts = encodedKey.split('_');
    if (parts.length < 2) return encodedKey;
    
    const encoded = parts.slice(0, -1).join('_');
    const reversed = encoded.split('').reverse().join('');
    const decoded = decodeURIComponent(escape(atob(reversed)));
    
    if (decoded.startsWith(ENCRYPTION_SALT)) {
      return decoded.substring(ENCRYPTION_SALT.length);
    }
    return encodedKey;
  } catch (error) {
    log.error('Failed to decode API key', error);
    return encodedKey;
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
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Validate API key format (enhanced validation)
 * Gemini API keys start with "AIza" and are 39 characters
 * @param {string} apiKey - API key to validate
 * @returns {boolean} - Whether key appears valid
 */
export function isValidApiKeyFormat(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return false;
  
  // Gemini API keys typically:
  // - Start with "AIza"
  // - Are 39 characters long
  // - Contain only alphanumeric, underscore, and hyphen
  const isValidPrefix = apiKey.startsWith('AIza');
  const isValidLength = apiKey.length >= 35 && apiKey.length <= 45;
  const isValidChars = /^[A-Za-z0-9_-]+$/.test(apiKey);
  
  if (!isValidPrefix) {
    log.warn('API key does not start with expected prefix');
  }
  
  return isValidPrefix && isValidLength && isValidChars;
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
 * Validate YouTube video ID format
 * @param {string} videoId - Video ID to validate
 * @returns {boolean} - Whether video ID is valid format
 */
export function isValidVideoId(videoId) {
  if (!videoId || typeof videoId !== 'string') return false;
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
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
  
  // Whitelist of safe attributes
  const safeAttributes = ['class', 'id', 'title', 'data-', 'aria-', 'role'];
  
  for (const [key, value] of Object.entries(attributes)) {
    // Block event handlers and dangerous attributes
    if (key.startsWith('on') || key === 'href' || key === 'src') {
      log.warn(`Blocked potentially dangerous attribute: ${key}`);
      continue;
    }
    
    if (key === 'class') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (safeAttributes.some(safe => key === safe || key.startsWith(safe))) {
      element.setAttribute(key, escapeHtml(String(value)));
    }
  }
  
  return element;
}

/**
 * Sanitize domain for exclusion list
 * @param {string} domain - Domain to sanitize
 * @returns {string|null} - Sanitized domain or null if invalid
 */
export function sanitizeDomain(domain) {
  if (!domain || typeof domain !== 'string') return null;
  
  // Remove protocol and path
  let cleaned = domain
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .replace(/\/.*$/, '')
    .trim();
  
  // Validate domain format
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(cleaned)) {
    return null;
  }
  
  return cleaned;
}
