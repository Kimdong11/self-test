/**
 * MoodReader Content Script
 * Handles text extraction and widget injection
 * 
 * Security: XSS-safe DOM manipulation
 * Performance: Optimized text extraction with TreeWalker
 */

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__moodReaderInitialized) return;
  window.__moodReaderInitialized = true;

  // ============================================
  // CONSTANTS
  // ============================================
  const TIMING = {
    DYNAMIC_CONTENT_DELAY: 500,     // Reduced for faster instant play
    AUTO_MINIMIZE_DELAY: 800,       // Faster minimize
    PLAYER_INIT_DELAY: 800,         // Faster player init
    AI_TRANSITION_DELAY: 2000       // Delay before AI transition prompt
  };

  const TEXT_CONFIG = {
    MAX_LENGTH: 1500,
    MIN_LENGTH: 50,
    MIN_PARAGRAPH_LENGTH: 20,
    MIN_ARTICLE_LENGTH: 100
  };

  const EXCLUDED_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG',
    'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'FORM',
    'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'
  ]);

  // ============================================
  // SIMPLE LOGGER (Content script can't import modules)
  // ============================================
  
  const log = {
    info: (msg, extra) => console.info(`[MoodReader] ${msg}`, extra || ''),
    warn: (msg, extra) => console.warn(`[MoodReader] ${msg}`, extra || ''),
    error: (msg, err) => console.error(`[MoodReader] ${msg}`, err || '')
  };

  // ============================================
  // SECURITY UTILITIES
  // ============================================
  
  /**
   * Escape HTML to prevent XSS attacks
   */
  function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Create safe element with text content (XSS-safe)
   */
  function createSafeElement(tag, text = '', className = '') {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  /**
   * Safely set element text content
   */
  function safeSetText(elementId, text) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = text;
  }

  // ============================================
  // STATE MANAGEMENT
  // ============================================
  let widget = null;
  let player = null;
  let isMinimized = false;
  let currentVolume = 50;
  let dragCleanup = null; // For cleaning up drag event listeners
  let pendingAIRefinement = null; // Stores AI refinement data for user acceptance
  let isInstantPlayback = false; // Track if current playback is instant mode

  // ============================================
  // CONTEXT BUILDING
  // Note: This function is duplicated from gemini.js because
  // content scripts cannot use ES modules. Keep in sync!
  // ============================================
  
  function buildContext() {
    const hour = new Date().getHours();
    let timeOfDay;
    if (hour >= 5 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
    else timeOfDay = 'night';

    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const combined = url + ' ' + title;

    let siteCategory = 'other';
    if (/news|times|post|herald|reuters|cnn|bbc/i.test(combined)) siteCategory = 'news';
    else if (/tech|developer|programming|github|stackoverflow|verge|wired/i.test(combined)) siteCategory = 'tech';
    else if (/research|academic|journal|\.edu|arxiv|scholar/i.test(combined)) siteCategory = 'academic';
    else if (/lifestyle|food|travel|fashion|health|wellness/i.test(combined)) siteCategory = 'lifestyle';
    else if (/blog|medium\.com|substack|wordpress/i.test(combined)) siteCategory = 'blog';

    const text = extractArticleText();
    let articleLength;
    if (text.length < 500) articleLength = 'short';
    else if (text.length < 1500) articleLength = 'medium';
    else articleLength = 'long';

    const koreanRegex = /[\uAC00-\uD7AF]/;
    const language = koreanRegex.test(text) ? 'ko' : 'en';

    return {
      timeOfDay,
      siteCategory,
      articleLength,
      language,
      url: window.location.href,
      title: document.title
    };
  }

  // ============================================
  // OPTIMIZED TEXT EXTRACTION (TreeWalker)
  // ============================================

  /**
   * Extract text using TreeWalker (more efficient than cloneNode)
   */
  function extractTextFromElementFast(element) {
    const textParts = [];
    
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Check if any parent is excluded
          let parent = node.parentElement;
          while (parent && parent !== element) {
            if (EXCLUDED_TAGS.has(parent.tagName)) {
              return NodeFilter.FILTER_REJECT;
            }
            parent = parent.parentElement;
          }
          
          // Only accept non-empty text
          const text = node.textContent.trim();
          if (text.length > 0) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    while (walker.nextNode()) {
      textParts.push(walker.currentNode.textContent.trim());
    }

    return textParts.join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Extract main article text from the page
   */
  function extractArticleText() {
    let text = '';

    // Priority 1: Look for <article> element
    const article = document.querySelector('article');
    if (article) {
      text = extractTextFromElementFast(article);
      if (text.length >= TEXT_CONFIG.MIN_ARTICLE_LENGTH) {
        return text.substring(0, TEXT_CONFIG.MAX_LENGTH);
      }
    }

    // Priority 2: Look for main content area
    const mainSelectors = [
      'main',
      '[role="main"]',
      '.content',
      '.post-content',
      '.entry-content',
      '.article-content',
      '.article-body',
      '#content'
    ];
    
    for (const selector of mainSelectors) {
      const mainContent = document.querySelector(selector);
      if (mainContent) {
        text = extractTextFromElementFast(mainContent);
        if (text.length >= TEXT_CONFIG.MIN_ARTICLE_LENGTH) {
          return text.substring(0, TEXT_CONFIG.MAX_LENGTH);
        }
      }
    }

    // Priority 3: Collect from all paragraphs
    const paragraphs = document.querySelectorAll('p');
    const paragraphTexts = [];
    
    for (const p of paragraphs) {
      // Quick check if parent is excluded
      if (!isExcludedElement(p)) {
        const pText = p.textContent.trim();
        if (pText.length > TEXT_CONFIG.MIN_PARAGRAPH_LENGTH) {
          paragraphTexts.push(pText);
          // Early exit if we have enough text
          if (paragraphTexts.join(' ').length > TEXT_CONFIG.MAX_LENGTH) {
            break;
          }
        }
      }
    }

    text = paragraphTexts.join(' ');
    return text.substring(0, TEXT_CONFIG.MAX_LENGTH);
  }

  /**
   * Check if element should be excluded (optimized)
   */
  function isExcludedElement(element) {
    let parent = element;
    let depth = 0;
    const maxDepth = 10; // Prevent infinite loops
    
    while (parent && depth < maxDepth) {
      if (EXCLUDED_TAGS.has(parent.tagName)) {
        return true;
      }
      parent = parent.parentElement;
      depth++;
    }
    return false;
  }

  // ============================================
  // WIDGET CREATION
  // ============================================

  function createWidget() {
    if (widget) return;

    widget = document.createElement('div');
    widget.id = 'moodreader-widget';
    widget.innerHTML = `
      <div class="moodreader-container" id="moodreader-container">
        <div class="moodreader-header" id="moodreader-header">
          <div class="moodreader-logo">
            <span class="moodreader-icon">🎵</span>
            <span class="moodreader-title">MoodReader</span>
          </div>
          <div class="moodreader-header-controls">
            <button class="moodreader-btn-icon" id="moodreader-minimize" title="Minimize">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <button class="moodreader-btn-icon" id="moodreader-close" title="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <div class="moodreader-loading" id="moodreader-loading" style="display: none;">
          <div class="moodreader-spinner"></div>
          <p id="moodreader-loading-text">Reading the mood of the page...</p>
        </div>

        <div class="moodreader-content" id="moodreader-content">
          <div class="moodreader-mood" id="moodreader-mood-section" style="display: none;">
            <div class="moodreader-mood-tag" id="moodreader-mood-tag">--</div>
            <div class="moodreader-mood-details" id="moodreader-mood-details"></div>
            <div class="moodreader-video-title" id="moodreader-video-title">No music playing</div>
          </div>

          <div class="moodreader-player-wrapper" id="moodreader-player-wrapper" style="display: none;">
            <div id="moodreader-player"></div>
          </div>

          <div class="moodreader-controls" id="moodreader-controls" style="display: none;">
            <button class="moodreader-btn-control" id="moodreader-play-pause" title="Play/Pause">
              <svg id="moodreader-icon-play" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <svg id="moodreader-icon-pause" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            </button>
            <button class="moodreader-btn-control" id="moodreader-skip" title="Skip Song">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 4 15 12 5 20 5 4"></polygon>
                <rect x="15" y="4" width="4" height="16"></rect>
              </svg>
            </button>
            <button class="moodreader-btn-control moodreader-btn-unmute" id="moodreader-unmute" title="Unmute (click if no sound)">
              <svg id="moodreader-icon-muted" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
              </svg>
              <svg id="moodreader-icon-unmuted" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </button>
            <div class="moodreader-volume-wrapper">
              <input type="range" id="moodreader-volume" class="moodreader-volume-slider" min="0" max="100" value="50">
            </div>
          </div>

          <div class="moodreader-analyze-section" id="moodreader-analyze-section">
            <p class="moodreader-analyze-hint">Analyze this page to find the perfect background music</p>
            <button class="moodreader-btn-primary" id="moodreader-analyze-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              Analyze Mood
            </button>
          </div>

          <div class="moodreader-moods" id="moodreader-moods-section">
            <p class="moodreader-section-title">Or choose a mood:</p>
            <div class="moodreader-mood-buttons">
              <button class="moodreader-mood-btn" data-mood="focus" title="Focus">🎯 Focus</button>
              <button class="moodreader-mood-btn" data-mood="relax" title="Relax">😌 Relax</button>
              <button class="moodreader-mood-btn" data-mood="sad" title="Sad">😢 Sad</button>
              <button class="moodreader-mood-btn" data-mood="energetic" title="Energetic">⚡ Energy</button>
            </div>
          </div>

          <div class="moodreader-error" id="moodreader-error" style="display: none;">
            <p id="moodreader-error-text"></p>
            <button class="moodreader-btn-secondary" id="moodreader-retry-btn">Retry</button>
          </div>
        </div>
      </div>

      <div class="moodreader-minimized" id="moodreader-minimized" style="display: none;">
        <span class="moodreader-mini-icon">🎵</span>
        <div class="moodreader-mini-info">
          <span class="moodreader-mini-mood" id="moodreader-mini-mood">--</span>
        </div>
        <button class="moodreader-btn-icon" id="moodreader-mini-play-pause">
          <svg id="moodreader-mini-icon-play" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <svg id="moodreader-mini-icon-pause" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
        </button>
        <button class="moodreader-btn-icon" id="moodreader-expand" title="Expand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(widget);
    initializeWidgetListeners();
    loadStoredVolume();
  }

  // ============================================
  // EVENT LISTENERS (with cleanup support)
  // ============================================

  function initializeWidgetListeners() {
    // Use event delegation for better performance
    const container = document.getElementById('moodreader-widget');
    if (!container) return;

    container.addEventListener('click', handleWidgetClick);
    
    // Volume slider
    const volumeSlider = document.getElementById('moodreader-volume');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', handleVolumeChange);
    }

    // Make widget draggable with cleanup
    dragCleanup = makeDraggable(
      document.getElementById('moodreader-container'),
      document.getElementById('moodreader-header')
    );
  }

  /**
   * Event delegation handler for widget clicks
   */
  function handleWidgetClick(e) {
    const target = e.target.closest('button');
    if (!target) return;

    const id = target.id;
    const mood = target.dataset?.mood;

    if (mood) {
      selectManualMood(mood);
    } else {
      switch (id) {
        case 'moodreader-analyze-btn':
        case 'moodreader-retry-btn':
          analyzePageMood(false);
          break;
        case 'moodreader-play-pause':
        case 'moodreader-mini-play-pause':
          togglePlayPause();
          break;
        case 'moodreader-skip':
          skipSong();
          break;
        case 'moodreader-unmute':
          manualUnmute();
          break;
        case 'moodreader-minimize':
          minimizeWidget();
          break;
        case 'moodreader-expand':
          expandWidget();
          break;
        case 'moodreader-close':
          closeWidget();
          break;
      }
    }
  }

  function handleVolumeChange(e) {
    setVolume(parseInt(e.target.value, 10));
  }

  /**
   * Make an element draggable with proper cleanup
   * @returns {Function} Cleanup function
   */
  function makeDraggable(element, handle) {
    if (!element || !handle) return () => {};

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let isDragging = false;

    function dragMouseDown(e) {
      if (e.target.closest('button')) return; // Don't drag when clicking buttons
      
      e.preventDefault();
      isDragging = true;
      pos3 = e.clientX;
      pos4 = e.clientY;
      
      document.addEventListener('mouseup', closeDragElement);
      document.addEventListener('mousemove', elementDrag);
    }

    function elementDrag(e) {
      if (!isDragging) return;
      
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      
      const newTop = element.offsetTop - pos2;
      const newLeft = element.offsetLeft - pos1;
      
      // Keep within viewport
      const maxTop = window.innerHeight - element.offsetHeight;
      const maxLeft = window.innerWidth - element.offsetWidth;
      
      element.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
      element.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    }

    function closeDragElement() {
      isDragging = false;
      document.removeEventListener('mouseup', closeDragElement);
      document.removeEventListener('mousemove', elementDrag);
    }

    handle.addEventListener('mousedown', dragMouseDown);

    // Return cleanup function
    return () => {
      handle.removeEventListener('mousedown', dragMouseDown);
      document.removeEventListener('mouseup', closeDragElement);
      document.removeEventListener('mousemove', elementDrag);
    };
  }

  // ============================================
  // ANALYSIS & PLAYBACK
  // ============================================

  async function analyzePageMood(isAuto = false) {
    const context = buildContext();
    showLoading(isAuto ? `🎵 Analyzing ${escapeHtml(context.siteCategory)} content...` : 'Reading the mood of the page...');
    hideError();

    const text = extractArticleText();
    
    if (text.length < TEXT_CONFIG.MIN_LENGTH) {
      if (isAuto) {
        hideLoading();
        console.log('MoodReader: Not enough text for auto-analysis');
      } else {
        showError('Not enough text content found on this page.');
      }
      return;
    }

    try {
      console.log('MoodReader: Analyzing with context:', context);
      
      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_TEXT',
        text: text,
        context: context
      });

      if (!response.success) {
        if (isAuto && response.error?.includes('API key')) {
          hideLoading();
        } else {
          showError(response.error || 'Analysis failed');
        }
      }
    } catch (error) {
      if (isAuto) {
        hideLoading();
        console.error('MoodReader auto-analysis error:', error);
      } else {
        showError(error.message || 'Failed to analyze page');
      }
    }
  }

  async function selectManualMood(mood) {
    const context = buildContext();
    showLoading(`Setting ${escapeHtml(mood)} mood...`);
    hideError();

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'MANUAL_MOOD',
        mood: mood,
        context: context
      });

      if (!response.success) {
        showError(response.error || 'Failed to set mood');
      }
    } catch (error) {
      showError(error.message || 'Failed to set mood');
    }
  }

  /**
   * Play music with given data (XSS-safe)
   */
  function playMusic(data) {
    hideLoading();
    hideError();
    hideAnalyzeSection();
    showPlayerControls();
    showMoodSection();
    hideAIRefinementBanner();

    // Track instant playback mode
    isInstantPlayback = data.isInstant || false;

    // Safely update text content (XSS-safe)
    safeSetText('moodreader-mood-tag', data.mood || '--');
    safeSetText('moodreader-mini-mood', data.mood || '--');
    safeSetText('moodreader-video-title', truncateText(data.videoTitle || 'Unknown', 40));

    // Build mood details safely (XSS-safe)
    const detailsEl = document.getElementById('moodreader-mood-details');
    if (detailsEl) {
      // Clear existing content
      detailsEl.innerHTML = '';
      
      if (data.energy !== undefined) {
        const energySpan = createSafeElement('span', `⚡${Math.round(data.energy * 100)}%`, 'moodreader-energy');
        energySpan.title = `Energy: ${Math.round(data.energy * 100)}%`;
        detailsEl.appendChild(energySpan);
      }
      
      if (data.tempo) {
        const tempoSpan = createSafeElement('span', data.tempo, 'moodreader-tempo');
        tempoSpan.title = 'Tempo';
        detailsEl.appendChild(document.createTextNode(' '));
        detailsEl.appendChild(tempoSpan);
      }
      
      if (data.genres?.length) {
        const genreText = data.genres.slice(0, 2).join(' · ');
        const genreSpan = createSafeElement('span', genreText, 'moodreader-genres');
        detailsEl.appendChild(document.createTextNode(' '));
        detailsEl.appendChild(genreSpan);
      }
      
      // Show instant indicator if in instant mode with AI loading
      if (data.isInstant && data.loadingAI) {
        const instantSpan = createSafeElement('span', '⚡ Quick', 'moodreader-instant-badge');
        instantSpan.title = 'Quick play mode - AI analysis in progress';
        detailsEl.appendChild(document.createTextNode(' '));
        detailsEl.appendChild(instantSpan);
      }
      
      detailsEl.style.display = 'flex';
    }

    // Create YouTube iframe
    createYouTubePlayer(data.videoId);
    updatePlayPauseIcon(true);

    // Auto-minimize
    setTimeout(minimizeWidget, TIMING.AUTO_MINIMIZE_DELAY);
  }

  /**
   * Show AI refinement banner for mood transition
   */
  function showAIRefinementBanner(data) {
    pendingAIRefinement = data;
    
    let banner = document.getElementById('moodreader-ai-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'moodreader-ai-banner';
      banner.className = 'moodreader-ai-banner';
      
      const container = document.getElementById('moodreader-content');
      if (container) {
        container.insertBefore(banner, container.firstChild);
      }
    }

    // Build banner content safely
    banner.innerHTML = '';
    
    const textSpan = createSafeElement('span', `🎯 AI suggests: "${data.mood}"`, 'moodreader-ai-text');
    banner.appendChild(textSpan);
    
    const btnContainer = document.createElement('div');
    btnContainer.className = 'moodreader-ai-btns';
    
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'moodreader-btn-small moodreader-btn-accept';
    acceptBtn.textContent = 'Switch';
    acceptBtn.onclick = () => applyAIRefinement();
    
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'moodreader-btn-small moodreader-btn-dismiss';
    dismissBtn.textContent = '✕';
    dismissBtn.onclick = () => hideAIRefinementBanner();
    
    btnContainer.appendChild(acceptBtn);
    btnContainer.appendChild(dismissBtn);
    banner.appendChild(btnContainer);
    
    banner.style.display = 'flex';
    log.info('AI refinement available', { newMood: data.mood });
  }

  /**
   * Hide AI refinement banner
   */
  function hideAIRefinementBanner() {
    const banner = document.getElementById('moodreader-ai-banner');
    if (banner) {
      banner.style.display = 'none';
    }
    pendingAIRefinement = null;
  }

  /**
   * Apply pending AI refinement
   */
  function applyAIRefinement() {
    if (!pendingAIRefinement) return;
    
    log.info('Applying AI refinement', { mood: pendingAIRefinement.mood });
    playMusic(pendingAIRefinement);
    hideAIRefinementBanner();
  }

  /**
   * Update mood display when AI confirms instant choice
   */
  function handleAIConfirmed(data) {
    // Remove instant badge if present
    const instantBadge = document.querySelector('.moodreader-instant-badge');
    if (instantBadge) {
      instantBadge.remove();
    }
    
    // Add confirmed badge briefly
    const detailsEl = document.getElementById('moodreader-mood-details');
    if (detailsEl) {
      const confirmedSpan = createSafeElement('span', '✓ AI confirmed', 'moodreader-confirmed-badge');
      detailsEl.appendChild(document.createTextNode(' '));
      detailsEl.appendChild(confirmedSpan);
      
      // Remove after a few seconds
      setTimeout(() => {
        if (confirmedSpan.parentNode) {
          confirmedSpan.remove();
        }
      }, 3000);
    }
    
    isInstantPlayback = false;
    log.info('AI confirmed instant mood selection');
  }

  // ============================================
  // YOUTUBE PLAYER
  // ============================================

  let playerReady = false;
  let unmuteAttempted = false;

  function createYouTubePlayer(videoId) {
    const wrapper = document.getElementById('moodreader-player-wrapper');
    const playerContainer = document.getElementById('moodreader-player');

    if (!wrapper || !playerContainer) {
      log.error('Player container not found');
      return;
    }

    // Remove existing player
    if (player) {
      try {
        player.remove();
      } catch (e) {
        console.warn('Error removing player:', e);
      }
      player = null;
      playerReady = false;
      unmuteAttempted = false;
    }

    // Validate videoId format (security) - allow 10-12 characters
    if (!videoId || !/^[a-zA-Z0-9_-]{10,12}$/.test(videoId)) {
      log.error('Invalid video ID format', { videoId });
      showError('Invalid video ID. Trying fallback...');
      // Use fallback video
      videoId = 'jfKfPfyJRdk'; // lofi hip hop radio
    }

    log.info('Creating YouTube player', { videoId });

    // Key fix: Start MUTED to allow autoplay, then unmute
    const params = new URLSearchParams({
      autoplay: '1',
      mute: '1',              // Start muted to bypass autoplay restrictions
      enablejsapi: '1',
      controls: '0',
      rel: '0',
      modestbranding: '1',
      loop: '1',
      playlist: videoId,
      playsinline: '1',
      fs: '0',
      iv_load_policy: '3',    // Hide annotations
      origin: window.location.origin
    });
    
    const embedUrl = `https://www.youtube.com/embed/${videoId}?${params.toString()}`;

    const iframe = document.createElement('iframe');
    iframe.id = 'moodreader-youtube-iframe';
    iframe.width = '320';
    iframe.height = '180';
    iframe.src = embedUrl;
    iframe.frameBorder = '0';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    
    // Keep iframe visible but tiny (browsers may throttle completely hidden iframes)
    iframe.style.cssText = `
      position: fixed;
      width: 1px;
      height: 1px;
      bottom: 0;
      right: 0;
      opacity: 0.01;
      pointer-events: none;
      z-index: -1;
    `;
    
    iframe.onerror = () => {
      log.error('YouTube iframe failed to load');
      showError('Failed to load music. Trying again...');
      // Retry with fallback video
      setTimeout(() => {
        createYouTubePlayer('jfKfPfyJRdk');
      }, 1000);
    };

    iframe.onload = () => {
      log.info('YouTube iframe loaded');
      playerReady = true;
      
      // Start playback sequence
      startPlaybackSequence();
    };

    playerContainer.innerHTML = '';
    playerContainer.appendChild(iframe);
    wrapper.style.display = 'block';
    player = iframe;

    // Listen for YouTube API messages
    setupYouTubeMessageListener();
  }

  /**
   * Setup listener for YouTube iframe API messages
   */
  function setupYouTubeMessageListener() {
    // Remove existing listener if any
    window.removeEventListener('message', handleYouTubeMessage);
    window.addEventListener('message', handleYouTubeMessage);
  }

  /**
   * Handle messages from YouTube iframe
   */
  function handleYouTubeMessage(event) {
    if (!event.origin.includes('youtube.com')) return;
    
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      
      if (data.event === 'onStateChange') {
        // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering, 5: video cued
        if (data.info === 1) {
          log.info('YouTube: Video is playing');
          // Try to unmute after playback starts
          if (!unmuteAttempted) {
            unmuteAttempted = true;
            setTimeout(attemptUnmute, 500);
          }
        } else if (data.info === 0) {
          log.info('YouTube: Video ended, will loop');
        } else if (data.info === -1 || data.info === 5) {
          log.info('YouTube: Video cued, starting playback');
          sendYouTubeCommand('playVideo');
        }
      } else if (data.event === 'onReady') {
        log.info('YouTube: Player ready');
        sendYouTubeCommand('playVideo');
      } else if (data.event === 'onError') {
        log.error('YouTube: Playback error', { error: data.info });
        handlePlaybackError(data.info);
      }
    } catch (e) {
      // Not a JSON message or not from YouTube
    }
  }

  /**
   * Start the playback sequence
   */
  function startPlaybackSequence() {
    // Wait for iframe to be ready, then send commands
    setTimeout(() => {
      // First, listen for ready state
      sendYouTubeCommand('addEventListener', ['onReady']);
      sendYouTubeCommand('addEventListener', ['onStateChange']);
      sendYouTubeCommand('addEventListener', ['onError']);
      
      // Then try to play
      setTimeout(() => {
        sendYouTubeCommand('playVideo');
        sendYouTubeCommand('setVolume', [currentVolume]);
      }, 500);
      
      // Attempt unmute after a delay
      setTimeout(attemptUnmute, 1500);
    }, TIMING.PLAYER_INIT_DELAY);
  }

  /**
   * Attempt to unmute the video
   */
  function attemptUnmute() {
    if (!player?.contentWindow) return;
    
    log.info('Attempting to unmute video');
    sendYouTubeCommand('unMute');
    sendYouTubeCommand('setVolume', [currentVolume]);
    updateMuteIcon(false);
  }

  /**
   * Send command to YouTube iframe
   */
  function sendYouTubeCommand(func, args = []) {
    if (!player?.contentWindow) return;
    
    try {
      const message = JSON.stringify({
        event: 'command',
        func: func,
        args: args
      });
      player.contentWindow.postMessage(message, '*');
    } catch (e) {
      log.warn('Error sending YouTube command', { func, error: e.message });
    }
  }

  /**
   * Handle YouTube playback errors
   */
  function handlePlaybackError(errorCode) {
    // 2: invalid video ID, 5: HTML5 player error, 100: video not found, 
    // 101/150: video not embeddable
    log.error('YouTube playback error', { errorCode });
    
    if (errorCode === 2 || errorCode === 100) {
      showError('Video not found. Trying fallback...');
    } else if (errorCode === 101 || errorCode === 150) {
      showError('Video not embeddable. Trying fallback...');
    } else {
      showError('Playback error. Trying fallback...');
    }
    
    // Retry with fallback video
    setTimeout(() => {
      createYouTubePlayer('jfKfPfyJRdk');
    }, 1000);
  }

  function togglePlayPause() {
    if (!player?.contentWindow) return;

    const currentlyPlaying = document.getElementById('moodreader-icon-pause')?.style.display !== 'none';
    
    if (currentlyPlaying) {
      sendYouTubeCommand('pauseVideo');
      updatePlayPauseIcon(false);
    } else {
      sendYouTubeCommand('playVideo');
      // Also attempt unmute when user manually plays
      sendYouTubeCommand('unMute');
      sendYouTubeCommand('setVolume', [currentVolume]);
      updatePlayPauseIcon(true);
    }
  }

  function updatePlayPauseIcon(isPlaying) {
    const icons = {
      play: document.getElementById('moodreader-icon-play'),
      pause: document.getElementById('moodreader-icon-pause'),
      miniPlay: document.getElementById('moodreader-mini-icon-play'),
      miniPause: document.getElementById('moodreader-mini-icon-pause')
    };

    if (isPlaying) {
      if (icons.play) icons.play.style.display = 'none';
      if (icons.pause) icons.pause.style.display = 'block';
      if (icons.miniPlay) icons.miniPlay.style.display = 'none';
      if (icons.miniPause) icons.miniPause.style.display = 'block';
    } else {
      if (icons.play) icons.play.style.display = 'block';
      if (icons.pause) icons.pause.style.display = 'none';
      if (icons.miniPlay) icons.miniPlay.style.display = 'block';
      if (icons.miniPause) icons.miniPause.style.display = 'none';
    }
  }

  async function skipSong() {
    showLoading('Finding another track...');
    
    try {
      const response = await chrome.runtime.sendMessage({ type: 'SKIP_SONG' });

      if (!response.success) {
        showError(response.error || 'Failed to skip');
        hideLoading();
      }
    } catch (error) {
      showError(error.message || 'Failed to skip');
      hideLoading();
    }
  }

  function setVolume(volume) {
    currentVolume = volume;
    sendYouTubeCommand('unMute');
    sendYouTubeCommand('setVolume', [volume]);
    updateMuteIcon(false);
    
    chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { volume: volume }
    }).catch(() => {});
  }

  /**
   * Manual unmute - for when autoplay mute bypass fails
   */
  function manualUnmute() {
    log.info('Manual unmute triggered by user');
    sendYouTubeCommand('unMute');
    sendYouTubeCommand('setVolume', [currentVolume]);
    sendYouTubeCommand('playVideo');
    updateMuteIcon(false);
    updatePlayPauseIcon(true);
  }

  /**
   * Update mute/unmute icon
   */
  function updateMuteIcon(isMuted) {
    const mutedIcon = document.getElementById('moodreader-icon-muted');
    const unmutedIcon = document.getElementById('moodreader-icon-unmuted');
    
    if (isMuted) {
      if (mutedIcon) mutedIcon.style.display = 'block';
      if (unmutedIcon) unmutedIcon.style.display = 'none';
    } else {
      if (mutedIcon) mutedIcon.style.display = 'none';
      if (unmutedIcon) unmutedIcon.style.display = 'block';
    }
  }

  async function loadStoredVolume() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response.success && response.settings?.volume !== undefined) {
        currentVolume = response.settings.volume;
        const slider = document.getElementById('moodreader-volume');
        if (slider) slider.value = currentVolume;
      }
    } catch (error) {
      console.error('Failed to load volume:', error);
    }
  }

  function stopMusic() {
    // Remove YouTube message listener
    window.removeEventListener('message', handleYouTubeMessage);
    
    sendYouTubeCommand('stopVideo');
    
    if (player) {
      try {
        player.remove();
      } catch (e) {
        console.warn('Error removing player:', e);
      }
      player = null;
      playerReady = false;
      unmuteAttempted = false;
    }
    updatePlayPauseIcon(false);
  }

  // ============================================
  // WIDGET STATE MANAGEMENT
  // ============================================

  function minimizeWidget() {
    isMinimized = true;
    const container = document.getElementById('moodreader-container');
    const minimized = document.getElementById('moodreader-minimized');
    if (container) container.style.display = 'none';
    if (minimized) minimized.style.display = 'flex';
  }

  function expandWidget() {
    isMinimized = false;
    const container = document.getElementById('moodreader-container');
    const minimized = document.getElementById('moodreader-minimized');
    if (container) container.style.display = 'block';
    if (minimized) minimized.style.display = 'none';
  }

  function closeWidget() {
    stopMusic();
    
    // Cleanup drag listeners
    if (dragCleanup) {
      dragCleanup();
      dragCleanup = null;
    }
    
    if (widget) {
      widget.remove();
      widget = null;
    }
    chrome.runtime.sendMessage({ type: 'STOP_MUSIC' }).catch(() => {});
  }

  // ============================================
  // UI HELPERS
  // ============================================

  function showLoading(message) {
    const loading = document.getElementById('moodreader-loading');
    const content = document.getElementById('moodreader-content');
    if (loading) {
      loading.style.display = 'flex';
      safeSetText('moodreader-loading-text', message);
    }
    if (content) content.style.display = 'none';
  }

  function hideLoading() {
    const loading = document.getElementById('moodreader-loading');
    const content = document.getElementById('moodreader-content');
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';
  }

  function showError(message) {
    hideLoading();
    const errorEl = document.getElementById('moodreader-error');
    if (errorEl) {
      errorEl.style.display = 'block';
      safeSetText('moodreader-error-text', message);
    }
  }

  function hideError() {
    const errorEl = document.getElementById('moodreader-error');
    if (errorEl) errorEl.style.display = 'none';
  }

  function showPlayerControls() {
    const controls = document.getElementById('moodreader-controls');
    if (controls) controls.style.display = 'flex';
  }

  function showMoodSection() {
    const section = document.getElementById('moodreader-mood-section');
    if (section) section.style.display = 'block';
  }

  function hideAnalyzeSection() {
    const section = document.getElementById('moodreader-analyze-section');
    if (section) section.style.display = 'none';
  }

  function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  // ============================================
  // MESSAGE LISTENER
  // ============================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      switch (message.type) {
        case 'PLAY_MUSIC':
          playMusic(message.data);
          sendResponse({ success: true });
          break;

        case 'STOP_MUSIC':
          stopMusic();
          hideAIRefinementBanner();
          sendResponse({ success: true });
          break;

        case 'UPDATE_STATE':
          if (message.state?.isLoading) {
            showLoading(message.state.loadingMessage || 'Loading...');
          }
          if (message.state?.error) {
            showError(message.state.error);
          }
          sendResponse({ success: true });
          break;

        case 'TOGGLE_WIDGET':
          if (widget) {
            if (isMinimized) expandWidget();
            else minimizeWidget();
          } else {
            createWidget();
          }
          sendResponse({ success: true });
          break;

        case 'AI_REFINEMENT':
          // AI has a different/better mood suggestion
          showAIRefinementBanner(message.data);
          sendResponse({ success: true });
          break;

        case 'AI_CONFIRMED':
          // AI confirms the instant mood selection was correct
          handleAIConfirmed(message.data);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  });

  // ============================================
  // INITIALIZATION
  // ============================================

  function hasReadableContent() {
    const text = extractArticleText();
    return text.length >= TEXT_CONFIG.MIN_ARTICLE_LENGTH;
  }

  async function initialize() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_EXCLUDED',
        url: window.location.href
      });

      if (response.excluded) {
        console.log('MoodReader: Domain is excluded');
        return;
      }

      createWidget();

      const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      const settings = settingsResponse.settings || {};

      if (settings.autoAnalyze !== false && settings.apiKey) {
        showLoading('🎵 Detecting page mood...');
        
        setTimeout(() => {
          if (hasReadableContent()) {
            console.log('MoodReader: Auto-analyzing page...');
            analyzePageMood(true);
          } else {
            console.log('MoodReader: Not enough content for auto-analysis');
            hideLoading();
          }
        }, TIMING.DYNAMIC_CONTENT_DELAY);
      }
    } catch (error) {
      console.error('MoodReader initialization error:', error);
    }
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.readyState === 'complete') {
        initialize();
      } else {
        window.addEventListener('load', initialize);
      }
    });
  } else if (document.readyState === 'interactive') {
    window.addEventListener('load', initialize);
  } else {
    initialize();
  }
})();
