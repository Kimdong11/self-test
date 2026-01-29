/**
 * MoodReader Content Script
 * Handles text extraction and widget injection
 */

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__moodReaderInitialized) return;
  window.__moodReaderInitialized = true;

  // Configuration
  const MAX_TEXT_LENGTH = 1500; // Increased for better analysis
  const EXCLUDED_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'NAV', 'HEADER', 'FOOTER', 'ASIDE'];

  /**
   * Build context for enhanced analysis
   */
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

    // Detect language
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

  // Widget state
  let widget = null;
  let player = null;
  let isMinimized = false;
  let currentVolume = 50;

  /**
   * Extract main article text from the page
   */
  function extractArticleText() {
    let text = '';

    // Priority 1: Look for <article> element
    const article = document.querySelector('article');
    if (article) {
      text = extractTextFromElement(article);
      if (text.length >= 100) {
        return text.substring(0, MAX_TEXT_LENGTH);
      }
    }

    // Priority 2: Look for main content area
    const mainContent = document.querySelector('main, [role="main"], .content, .post-content, .entry-content, .article-content');
    if (mainContent) {
      text = extractTextFromElement(mainContent);
      if (text.length >= 100) {
        return text.substring(0, MAX_TEXT_LENGTH);
      }
    }

    // Priority 3: Collect from all paragraphs
    const paragraphs = document.querySelectorAll('p');
    const paragraphTexts = [];
    
    for (const p of paragraphs) {
      if (!isExcludedElement(p)) {
        const pText = p.textContent.trim();
        if (pText.length > 20) {
          paragraphTexts.push(pText);
        }
      }
    }

    text = paragraphTexts.join(' ');
    return text.substring(0, MAX_TEXT_LENGTH);
  }

  /**
   * Extract text from an element, excluding unwanted tags
   */
  function extractTextFromElement(element) {
    const clone = element.cloneNode(true);
    
    // Remove excluded elements
    EXCLUDED_TAGS.forEach(tag => {
      clone.querySelectorAll(tag).forEach(el => el.remove());
    });

    return clone.textContent
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if element should be excluded
   */
  function isExcludedElement(element) {
    let parent = element;
    while (parent) {
      if (EXCLUDED_TAGS.includes(parent.tagName)) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }

  /**
   * Create and inject the floating widget
   */
  function createWidget() {
    if (widget) return;

    widget = document.createElement('div');
    widget.id = 'moodreader-widget';
    widget.innerHTML = `
      <div class="moodreader-container" id="moodreader-container">
        <!-- Header with drag handle -->
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

        <!-- Loading State -->
        <div class="moodreader-loading" id="moodreader-loading" style="display: none;">
          <div class="moodreader-spinner"></div>
          <p id="moodreader-loading-text">Reading the mood of the page...</p>
        </div>

        <!-- Main Content -->
        <div class="moodreader-content" id="moodreader-content">
          <!-- Mood Display -->
          <div class="moodreader-mood" id="moodreader-mood-section" style="display: none;">
            <div class="moodreader-mood-tag" id="moodreader-mood-tag">--</div>
            <div class="moodreader-mood-details" id="moodreader-mood-details"></div>
            <div class="moodreader-video-title" id="moodreader-video-title">No music playing</div>
          </div>

          <!-- YouTube Player Container (hidden) -->
          <div class="moodreader-player-wrapper" id="moodreader-player-wrapper" style="display: none;">
            <div id="moodreader-player"></div>
          </div>

          <!-- Player Controls -->
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
            <div class="moodreader-volume-wrapper">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
              <input type="range" id="moodreader-volume" class="moodreader-volume-slider" min="0" max="100" value="50">
            </div>
          </div>

          <!-- Analyze Button (Initial State) -->
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

          <!-- Manual Mood Selection -->
          <div class="moodreader-moods" id="moodreader-moods-section">
            <p class="moodreader-section-title">Or choose a mood:</p>
            <div class="moodreader-mood-buttons">
              <button class="moodreader-mood-btn" data-mood="focus" title="Focus">🎯 Focus</button>
              <button class="moodreader-mood-btn" data-mood="relax" title="Relax">😌 Relax</button>
              <button class="moodreader-mood-btn" data-mood="sad" title="Sad">😢 Sad</button>
              <button class="moodreader-mood-btn" data-mood="energetic" title="Energetic">⚡ Energy</button>
            </div>
          </div>

          <!-- Error Message -->
          <div class="moodreader-error" id="moodreader-error" style="display: none;">
            <p id="moodreader-error-text"></p>
            <button class="moodreader-btn-secondary" id="moodreader-retry-btn">Retry</button>
          </div>
        </div>
      </div>

      <!-- Minimized State -->
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

  /**
   * Initialize widget event listeners
   */
  function initializeWidgetListeners() {
    // Analyze button (manual analysis)
    document.getElementById('moodreader-analyze-btn')?.addEventListener('click', () => analyzePageMood(false));
    document.getElementById('moodreader-retry-btn')?.addEventListener('click', () => analyzePageMood(false));

    // Manual mood buttons
    document.querySelectorAll('.moodreader-mood-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mood = e.currentTarget.dataset.mood;
        selectManualMood(mood);
      });
    });

    // Player controls
    document.getElementById('moodreader-play-pause')?.addEventListener('click', togglePlayPause);
    document.getElementById('moodreader-mini-play-pause')?.addEventListener('click', togglePlayPause);
    document.getElementById('moodreader-skip')?.addEventListener('click', skipSong);

    // Volume slider
    document.getElementById('moodreader-volume')?.addEventListener('input', (e) => {
      setVolume(parseInt(e.target.value));
    });

    // Minimize/Expand
    document.getElementById('moodreader-minimize')?.addEventListener('click', minimizeWidget);
    document.getElementById('moodreader-expand')?.addEventListener('click', expandWidget);

    // Close
    document.getElementById('moodreader-close')?.addEventListener('click', closeWidget);

    // Make widget draggable
    makeDraggable(
      document.getElementById('moodreader-container'),
      document.getElementById('moodreader-header')
    );
  }

  /**
   * Make an element draggable
   */
  function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      element.style.top = (element.offsetTop - pos2) + "px";
      element.style.left = (element.offsetLeft - pos1) + "px";
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  /**
   * Analyze page mood
   * @param {boolean} isAuto - Whether this is an automatic analysis
   */
  async function analyzePageMood(isAuto = false) {
    const context = buildContext();
    showLoading(isAuto ? `🎵 Analyzing ${context.siteCategory} content...` : 'Reading the mood of the page...');
    hideError();

    const text = extractArticleText();
    
    if (text.length < 50) {
      if (isAuto) {
        // For auto-analysis, just hide loading and show normal UI
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
          // For auto-analysis without API key, just show normal UI
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

  /**
   * Select manual mood
   */
  async function selectManualMood(mood) {
    const context = buildContext();
    showLoading(`Setting ${mood} mood...`);
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
   * Play music with given data
   */
  function playMusic(data) {
    hideLoading();
    hideError();
    hideAnalyzeSection();
    showPlayerControls();
    showMoodSection();

    // Update mood tag
    document.getElementById('moodreader-mood-tag').textContent = data.mood;
    document.getElementById('moodreader-mini-mood').textContent = data.mood;
    document.getElementById('moodreader-video-title').textContent = truncateText(data.videoTitle, 40);

    // Show enhanced mood details if available
    const detailsEl = document.getElementById('moodreader-mood-details');
    if (detailsEl && (data.energy !== undefined || data.genres)) {
      const energyBar = data.energy !== undefined 
        ? `<span class="moodreader-energy" title="Energy: ${Math.round(data.energy * 100)}%">⚡${Math.round(data.energy * 100)}%</span>` 
        : '';
      const tempoText = data.tempo ? `<span class="moodreader-tempo" title="Tempo">${data.tempo}</span>` : '';
      const genreText = data.genres?.length ? `<span class="moodreader-genres">${data.genres.slice(0, 2).join(' · ')}</span>` : '';
      
      detailsEl.innerHTML = [energyBar, tempoText, genreText].filter(Boolean).join(' ');
      detailsEl.style.display = 'flex';
    }

    // Create YouTube iframe
    createYouTubePlayer(data.videoId);
    updatePlayPauseIcon(true);

    // Auto-minimize widget after music starts (with small delay for smooth UX)
    setTimeout(() => {
      minimizeWidget();
    }, 1200);
  }

  /**
   * Create YouTube iframe player
   */
  function createYouTubePlayer(videoId) {
    const wrapper = document.getElementById('moodreader-player-wrapper');
    const playerContainer = document.getElementById('moodreader-player');

    // Build embed URL
    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&controls=0&rel=0&modestbranding=1&loop=1&playlist=${videoId}`;

    playerContainer.innerHTML = `
      <iframe
        id="moodreader-youtube-iframe"
        width="1"
        height="1"
        src="${embedUrl}"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        style="position: absolute; opacity: 0; pointer-events: none;"
      ></iframe>
    `;

    wrapper.style.display = 'block';
    player = document.getElementById('moodreader-youtube-iframe');
  }

  /**
   * Toggle play/pause
   */
  function togglePlayPause() {
    if (!player) return;

    // Use postMessage to control YouTube player
    const currentlyPlaying = document.getElementById('moodreader-icon-pause').style.display !== 'none';
    
    if (currentlyPlaying) {
      player.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
      updatePlayPauseIcon(false);
    } else {
      player.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
      updatePlayPauseIcon(true);
    }
  }

  /**
   * Update play/pause icon
   */
  function updatePlayPauseIcon(isPlaying) {
    const playIcon = document.getElementById('moodreader-icon-play');
    const pauseIcon = document.getElementById('moodreader-icon-pause');
    const miniPlayIcon = document.getElementById('moodreader-mini-icon-play');
    const miniPauseIcon = document.getElementById('moodreader-mini-icon-pause');

    if (isPlaying) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
      miniPlayIcon.style.display = 'none';
      miniPauseIcon.style.display = 'block';
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      miniPlayIcon.style.display = 'block';
      miniPauseIcon.style.display = 'none';
    }
  }

  /**
   * Skip to next song
   */
  async function skipSong() {
    showLoading('Finding another track...');
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SKIP_SONG'
      });

      if (!response.success) {
        showError(response.error || 'Failed to skip');
        hideLoading();
      }
    } catch (error) {
      showError(error.message || 'Failed to skip');
      hideLoading();
    }
  }

  /**
   * Set volume
   */
  function setVolume(volume) {
    currentVolume = volume;
    if (player) {
      player.contentWindow.postMessage(`{"event":"command","func":"setVolume","args":[${volume}]}`, '*');
    }
    // Save to storage
    chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { volume: volume }
    });
  }

  /**
   * Load stored volume
   */
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

  /**
   * Stop music
   */
  function stopMusic() {
    if (player) {
      player.contentWindow.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
      player.remove();
      player = null;
    }
    updatePlayPauseIcon(false);
  }

  /**
   * Minimize widget
   */
  function minimizeWidget() {
    isMinimized = true;
    document.getElementById('moodreader-container').style.display = 'none';
    document.getElementById('moodreader-minimized').style.display = 'flex';
  }

  /**
   * Expand widget
   */
  function expandWidget() {
    isMinimized = false;
    document.getElementById('moodreader-container').style.display = 'block';
    document.getElementById('moodreader-minimized').style.display = 'none';
  }

  /**
   * Close widget
   */
  function closeWidget() {
    stopMusic();
    if (widget) {
      widget.remove();
      widget = null;
    }
    chrome.runtime.sendMessage({ type: 'STOP_MUSIC' });
  }

  // UI Helper functions
  function showLoading(message) {
    document.getElementById('moodreader-loading').style.display = 'flex';
    document.getElementById('moodreader-loading-text').textContent = message;
    document.getElementById('moodreader-content').style.display = 'none';
  }

  function hideLoading() {
    document.getElementById('moodreader-loading').style.display = 'none';
    document.getElementById('moodreader-content').style.display = 'block';
  }

  function showError(message) {
    hideLoading();
    document.getElementById('moodreader-error').style.display = 'block';
    document.getElementById('moodreader-error-text').textContent = message;
  }

  function hideError() {
    document.getElementById('moodreader-error').style.display = 'none';
  }

  function showPlayerControls() {
    document.getElementById('moodreader-controls').style.display = 'flex';
  }

  function showMoodSection() {
    document.getElementById('moodreader-mood-section').style.display = 'block';
  }

  function hideAnalyzeSection() {
    document.getElementById('moodreader-analyze-section').style.display = 'none';
  }

  function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Listen for messages from background script
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'PLAY_MUSIC':
        playMusic(message.data);
        sendResponse({ success: true });
        break;

      case 'STOP_MUSIC':
        stopMusic();
        sendResponse({ success: true });
        break;

      case 'UPDATE_STATE':
        if (message.state.isLoading) {
          showLoading(message.state.loadingMessage || 'Loading...');
        }
        if (message.state.error) {
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
    }
    return true;
  });

  /**
   * Check if the page has enough readable content
   */
  function hasReadableContent() {
    const text = extractArticleText();
    return text.length >= 100; // Minimum 100 characters for meaningful analysis
  }

  /**
   * Check if domain is excluded before initializing
   */
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

      // Create widget on page load
      createWidget();

      // Check settings for auto-analyze
      const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      const settings = settingsResponse.settings || {};

      // Auto-analyze if enabled and API key is set
      if (settings.autoAnalyze !== false && settings.apiKey) {
        // Show loading state immediately
        showLoading('🎵 Detecting page mood...');
        
        // Wait a bit for dynamic content to load
        setTimeout(() => {
          if (hasReadableContent()) {
            console.log('MoodReader: Auto-analyzing page...');
            analyzePageMood(true); // Pass true for auto-analysis
          } else {
            console.log('MoodReader: Not enough content for auto-analysis');
            hideLoading();
          }
        }, 1000); // 1 second delay to allow dynamic content to load
      }
    } catch (error) {
      console.error('MoodReader initialization error:', error);
    }
  }

  // Initialize when DOM is ready and page is fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Wait for page to fully render
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
