/**
 * MoodReader Popup Script
 * Handles settings and quick actions
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize UI
  await loadSettings();
  await loadCurrentState();
  initializeEventListeners();
});

/**
 * Load and display current settings
 */
async function loadSettings() {
  try {
    // Use GET_SETTINGS_FULL to get the actual API key for the popup
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS_FULL' });
    if (response.success) {
      const settings = response.settings;

      // API Key - show actual key in popup for editing
      const apiKeyInput = document.getElementById('api-key-input');
      if (apiKeyInput) {
        apiKeyInput.value = settings.apiKey || '';
      }

      // Volume
      const volumeSlider = document.getElementById('volume-slider');
      const volumeValue = document.getElementById('volume-value');
      if (volumeSlider) volumeSlider.value = settings.volume || 50;
      if (volumeValue) volumeValue.textContent = `${settings.volume || 50}%`;

      // Auto-analyze
      const autoAnalyze = document.getElementById('auto-analyze');
      if (autoAnalyze) autoAnalyze.checked = settings.autoAnalyze !== false;

      // Instant Play Mode
      const instantPlay = document.getElementById('instant-play');
      if (instantPlay) instantPlay.checked = settings.instantPlayEnabled !== false;

      // Excluded domains
      renderExcludedDomains(settings.excludedDomains || []);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

/**
 * Load current playback state
 */
async function loadCurrentState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (response.success && response.state) {
      updateStatusDisplay(response.state);
    }
  } catch (error) {
    console.error('Failed to load state:', error);
  }
}

/**
 * Update status display
 */
function updateStatusDisplay(state) {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const currentMood = document.getElementById('current-mood');
  const moodValue = document.getElementById('mood-value');

  if (state.isPlaying && state.currentMood) {
    statusDot.classList.remove('inactive', 'loading');
    statusText.textContent = 'Playing';
    currentMood.style.display = 'flex';
    moodValue.textContent = state.currentMood;
  } else {
    statusDot.classList.add('inactive');
    statusText.textContent = 'Ready';
    currentMood.style.display = 'none';
  }
}

/**
 * Render excluded domains list
 */
function renderExcludedDomains(domains) {
  const list = document.getElementById('excluded-list');
  list.innerHTML = '';

  domains.forEach(domain => {
    const tag = document.createElement('span');
    tag.className = 'excluded-tag';
    tag.innerHTML = `
      ${domain}
      <button data-domain="${domain}" title="Remove">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;
    list.appendChild(tag);
  });

  // Add remove listeners
  list.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => removeDomain(btn.dataset.domain));
  });
}

/**
 * Initialize event listeners
 */
function initializeEventListeners() {
  // Analyze button
  document.getElementById('analyze-btn').addEventListener('click', analyzeCurrentPage);

  // Toggle widget button
  document.getElementById('toggle-widget-btn').addEventListener('click', toggleWidget);

  // Mood buttons
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => selectMood(btn.dataset.mood));
  });

  // API key toggle visibility
  document.getElementById('toggle-api-key').addEventListener('click', toggleApiKeyVisibility);

  // Save API key
  document.getElementById('save-api-key').addEventListener('click', saveApiKey);

  // Volume slider
  document.getElementById('volume-slider').addEventListener('input', (e) => {
    const value = e.target.value;
    document.getElementById('volume-value').textContent = `${value}%`;
    saveSettings({ volume: parseInt(value) });
  });

  // Auto-analyze toggle
  document.getElementById('auto-analyze').addEventListener('change', (e) => {
    saveSettings({ autoAnalyze: e.target.checked });
  });

  // Instant Play toggle
  document.getElementById('instant-play').addEventListener('change', (e) => {
    saveSettings({ instantPlayEnabled: e.target.checked });
  });

  // Add domain button
  document.getElementById('add-domain-btn').addEventListener('click', addDomain);

  // Add domain on Enter
  document.getElementById('new-domain-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addDomain();
  });
}

/**
 * Analyze current page
 */
async function analyzeCurrentPage() {
  const btn = document.getElementById('analyze-btn');
  btn.classList.add('loading');
  btn.textContent = 'Analyzing...';

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send message to content script to analyze
    await chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE_PAGE' });

    // Close popup
    window.close();
  } catch (error) {
    console.error('Failed to analyze:', error);
    btn.classList.remove('loading');
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      Analyze Page
    `;
  }
}

/**
 * Toggle widget visibility
 */
async function toggleWidget() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_WIDGET' });
    window.close();
  } catch (error) {
    console.error('Failed to toggle widget:', error);
  }
}

/**
 * Select manual mood
 */
async function selectMood(mood) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.runtime.sendMessage({
      type: 'MANUAL_MOOD',
      mood: mood,
      tabId: tab.id
    });
    window.close();
  } catch (error) {
    console.error('Failed to select mood:', error);
  }
}

/**
 * Toggle API key visibility
 */
function toggleApiKeyVisibility() {
  const input = document.getElementById('api-key-input');
  input.type = input.type === 'password' ? 'text' : 'password';
}

/**
 * Save API key
 */
async function saveApiKey() {
  const apiKey = document.getElementById('api-key-input').value.trim();
  
  const btn = document.getElementById('save-api-key');
  const originalText = btn.textContent;
  
  try {
    await saveSettings({ apiKey });
    btn.textContent = 'Saved!';
    btn.style.background = 'rgba(34, 197, 94, 0.2)';
    btn.style.color = '#22c55e';
    btn.style.borderColor = 'rgba(34, 197, 94, 0.3)';
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
    }, 2000);
  } catch (error) {
    console.error('Failed to save API key:', error);
    btn.textContent = 'Error!';
    btn.style.background = 'rgba(239, 68, 68, 0.2)';
    btn.style.color = '#ef4444';
  }
}

/**
 * Add domain to exclusion list
 */
async function addDomain() {
  const input = document.getElementById('new-domain-input');
  let domain = input.value.trim().toLowerCase();

  if (!domain) return;

  // Clean up domain
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');

  if (!domain) return;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const currentDomains = response.settings?.excludedDomains || [];

    if (!currentDomains.includes(domain)) {
      const newDomains = [...currentDomains, domain];
      await saveSettings({ excludedDomains: newDomains });
      renderExcludedDomains(newDomains);
    }

    input.value = '';
  } catch (error) {
    console.error('Failed to add domain:', error);
  }
}

/**
 * Remove domain from exclusion list
 */
async function removeDomain(domain) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const currentDomains = response.settings?.excludedDomains || [];
    const newDomains = currentDomains.filter(d => d !== domain);

    await saveSettings({ excludedDomains: newDomains });
    renderExcludedDomains(newDomains);
  } catch (error) {
    console.error('Failed to remove domain:', error);
  }
}

/**
 * Save settings to storage
 */
async function saveSettings(updates) {
  try {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: updates
    });
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
}
