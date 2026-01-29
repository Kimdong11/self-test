/**
 * MoodReader Caching Module
 * Handles API response caching for better performance
 */

// In-memory cache
const memoryCache = new Map();

// Cache configuration
const CACHE_CONFIG = {
  maxSize: 50,
  defaultTTL: 30 * 60 * 1000, // 30 minutes
  storageKey: 'moodreader_cache'
};

/**
 * Generate cache key from text
 * @param {string} text - Input text
 * @returns {string} - Cache key
 */
function generateCacheKey(text) {
  // Use first 200 chars + length for key
  const sample = text.substring(0, 200).trim();
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `mood_${Math.abs(hash).toString(16)}_${text.length}`;
}

/**
 * Get cached analysis result
 * @param {string} text - Article text
 * @returns {Object|null} - Cached result or null
 */
export function getCachedAnalysis(text) {
  const key = generateCacheKey(text);
  
  // Check memory cache first
  if (memoryCache.has(key)) {
    const cached = memoryCache.get(key);
    if (Date.now() < cached.expires) {
      console.log('Cache hit (memory):', key);
      return cached.data;
    }
    memoryCache.delete(key);
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
  
  // Store in memory cache
  memoryCache.set(key, {
    data: result,
    expires: Date.now() + ttl,
    created: Date.now()
  });
  
  // Enforce max size (LRU eviction)
  if (memoryCache.size > CACHE_CONFIG.maxSize) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }
  
  console.log('Cached analysis:', key);
}

/**
 * Clear all cached data
 */
export function clearCache() {
  memoryCache.clear();
  console.log('Cache cleared');
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
    console.log(`Cleaned ${keysToDelete.length} expired cache entries`);
  }
}

// Clean expired cache periodically
setInterval(cleanExpiredCache, 5 * 60 * 1000); // Every 5 minutes
