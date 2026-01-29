/**
 * MoodReader Caching Module
 * Handles API response caching for better performance
 * 
 * Features:
 * - Text-based analysis caching
 * - Domain-based mood caching (for faster repeat visits)
 * - Uses chrome.alarms for periodic cleanup (Service Worker compatible)
 */

import { Logger } from './logger.js';

const log = Logger.scope('Cache');

// In-memory cache for text analysis
const memoryCache = new Map();

// Domain-based mood cache
const domainCache = new Map();

// Cache configuration
const CACHE_CONFIG = {
  maxSize: 50,
  defaultTTL: 30 * 60 * 1000, // 30 minutes
  domainTTL: 60 * 60 * 1000,  // 1 hour for domain cache
  domainMaxSize: 100,
  cleanupAlarmName: 'moodreader_cache_cleanup'
};

/**
 * Generate cache key from text (improved to reduce collisions)
 * Uses dual hash approach for better distribution
 * @param {string} text - Input text
 * @returns {string} - Cache key
 */
function generateCacheKey(text) {
  const sample = text.substring(0, 300).trim();
  
  // DJB2 hash
  let hash1 = 5381;
  for (let i = 0; i < sample.length; i++) {
    hash1 = ((hash1 << 5) + hash1) + sample.charCodeAt(i);
    hash1 = hash1 & hash1;
  }
  
  // SDBM hash
  let hash2 = 0;
  for (let i = 0; i < sample.length; i++) {
    hash2 = sample.charCodeAt(i) + (hash2 << 6) + (hash2 << 16) - hash2;
    hash2 = hash2 & hash2;
  }
  
  return `mood_${Math.abs(hash1).toString(16)}_${Math.abs(hash2).toString(16)}_${text.length}`;
}

/**
 * Get cached analysis result
 * @param {string} text - Article text
 * @returns {Object|null} - Cached result or null
 */
export function getCachedAnalysis(text) {
  const key = generateCacheKey(text);
  
  if (memoryCache.has(key)) {
    const cached = memoryCache.get(key);
    if (Date.now() < cached.expires) {
      log.debug('Cache hit', { key });
      return cached.data;
    }
    memoryCache.delete(key);
    log.debug('Cache expired', { key });
  }
  
  return null;
}

/**
 * Store analysis result in cache
 * @param {string} text - Article text
 * @param {Object} result - Analysis result
 * @param {number} ttl - Time to live in ms
 */
export function setCachedAnalysis(text, result, ttl = CACHE_CONFIG.defaultTTL) {
  const key = generateCacheKey(text);
  
  memoryCache.set(key, {
    data: result,
    expires: Date.now() + ttl,
    created: Date.now()
  });
  
  // Enforce max size (LRU eviction)
  if (memoryCache.size > CACHE_CONFIG.maxSize) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
    log.debug('Cache eviction (LRU)', { evicted: oldestKey });
  }
  
  log.debug('Cache set', { key });
}

/**
 * Clear all cached data
 */
export function clearCache() {
  const size = memoryCache.size;
  memoryCache.clear();
  log.info(`Cache cleared (${size} entries)`);
}

/**
 * Get cache statistics
 * @returns {Object} - Cache stats
 */
export function getCacheStats() {
  let validCount = 0;
  let expiredCount = 0;
  const now = Date.now();
  
  for (const [, value] of memoryCache) {
    if (now < value.expires) {
      validCount++;
    } else {
      expiredCount++;
    }
  }
  
  return {
    total: memoryCache.size,
    valid: validCount,
    expired: expiredCount
  };
}

/**
 * Remove expired entries from cache
 */
export function cleanExpiredCache() {
  const now = Date.now();
  const keysToDelete = [];
  
  for (const [key, value] of memoryCache) {
    if (now >= value.expires) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => memoryCache.delete(key));
  
  if (keysToDelete.length > 0) {
    log.info(`Cleaned ${keysToDelete.length} expired cache entries`);
  }
}

/**
 * Initialize cache cleanup alarm (Service Worker compatible)
 * Call this from background.js on install/startup
 */
export async function initializeCacheCleanup() {
  try {
    // Clear any existing alarm
    await chrome.alarms.clear(CACHE_CONFIG.cleanupAlarmName);
    
    // Create periodic alarm (every 5 minutes)
    await chrome.alarms.create(CACHE_CONFIG.cleanupAlarmName, {
      periodInMinutes: 5
    });
    
    log.info('Cache cleanup alarm initialized');
  } catch (error) {
    log.warn('Failed to create cache cleanup alarm', { error: error.message });
  }
}

/**
 * Handle alarm event for cache cleanup
 * @param {chrome.alarms.Alarm} alarm
 */
export function handleCacheAlarm(alarm) {
  if (alarm.name === CACHE_CONFIG.cleanupAlarmName) {
    cleanExpiredCache();
    cleanExpiredDomainCache();
  }
}

// ============================================
// DOMAIN-BASED CACHING
// ============================================

/**
 * Extract domain from URL
 * @param {string} url - Full URL
 * @returns {string} - Domain name
 */
function extractDomain(url) {
  try {
    const { hostname } = new URL(url);
    // Remove www. prefix
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Generate domain cache key
 * @param {string} url - Page URL
 * @param {string} siteCategory - Site category
 * @returns {string} - Cache key
 */
function generateDomainKey(url, siteCategory = '') {
  const domain = extractDomain(url);
  return `domain_${domain}_${siteCategory}`;
}

/**
 * Get cached mood for a domain
 * @param {string} url - Page URL
 * @param {string} siteCategory - Site category
 * @returns {Object|null} - Cached mood data or null
 */
export function getDomainMood(url, siteCategory = '') {
  const key = generateDomainKey(url, siteCategory);
  
  if (domainCache.has(key)) {
    const cached = domainCache.get(key);
    if (Date.now() < cached.expires) {
      log.debug('Domain cache hit', { key });
      // Update access count for frequency tracking
      cached.accessCount = (cached.accessCount || 0) + 1;
      return cached.data;
    }
    domainCache.delete(key);
    log.debug('Domain cache expired', { key });
  }
  
  return null;
}

/**
 * Store mood data for a domain
 * @param {string} url - Page URL
 * @param {string} siteCategory - Site category
 * @param {Object} moodData - Mood analysis result
 * @param {number} ttl - Time to live in ms
 */
export function setDomainMood(url, siteCategory = '', moodData, ttl = CACHE_CONFIG.domainTTL) {
  const key = generateDomainKey(url, siteCategory);
  
  domainCache.set(key, {
    data: moodData,
    expires: Date.now() + ttl,
    created: Date.now(),
    accessCount: 1
  });
  
  // Enforce max size (LRU eviction)
  if (domainCache.size > CACHE_CONFIG.domainMaxSize) {
    // Find least accessed entry
    let minAccess = Infinity;
    let oldestKey = null;
    
    for (const [k, v] of domainCache) {
      if (v.accessCount < minAccess) {
        minAccess = v.accessCount;
        oldestKey = k;
      }
    }
    
    if (oldestKey) {
      domainCache.delete(oldestKey);
      log.debug('Domain cache eviction (LRU)', { evicted: oldestKey });
    }
  }
  
  log.debug('Domain cache set', { key });
}

/**
 * Clean expired domain cache entries
 */
export function cleanExpiredDomainCache() {
  const now = Date.now();
  const keysToDelete = [];
  
  for (const [key, value] of domainCache) {
    if (now >= value.expires) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => domainCache.delete(key));
  
  if (keysToDelete.length > 0) {
    log.info(`Cleaned ${keysToDelete.length} expired domain cache entries`);
  }
}

/**
 * Get domain cache statistics
 * @returns {Object} - Domain cache stats
 */
export function getDomainCacheStats() {
  let validCount = 0;
  let expiredCount = 0;
  const now = Date.now();
  
  for (const [, value] of domainCache) {
    if (now < value.expires) {
      validCount++;
    } else {
      expiredCount++;
    }
  }
  
  return {
    total: domainCache.size,
    valid: validCount,
    expired: expiredCount
  };
}

/**
 * Clear domain cache
 */
export function clearDomainCache() {
  const size = domainCache.size;
  domainCache.clear();
  log.info(`Domain cache cleared (${size} entries)`);
}
