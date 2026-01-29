# MoodReader - Chrome Extension

MoodReader is a Chrome Extension (Manifest V3) that analyzes the sentiment of web articles and automatically plays background music via YouTube that matches the mood of the text to enhance reader immersion.

## Features

- **Automatic Mood Detection**: Analyzes article content using Google Gemini AI to detect the tone and genre
- **YouTube Integration**: Plays mood-appropriate background music via hidden YouTube player
- **Floating Widget**: Beautiful, draggable widget with play/pause, skip, and volume controls
- **Manual Mood Selection**: Quick buttons for Focus, Relax, Sad, Energetic, Cinematic, and Nature moods
- **Domain Exclusions**: Automatically disabled on video streaming sites (YouTube, Netflix, Spotify, etc.)
- **Persistent Settings**: Remembers your volume and excluded domains

## Installation

### Developer Mode (Recommended for Testing)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked"
5. Select the `moodreader-extension` folder

### Setup Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Click the MoodReader extension icon in Chrome
4. Enter your API key in the settings popup
5. Click "Save API Key"

## File Structure

```
moodreader-extension/
├── manifest.json          # Extension configuration (Manifest V3)
├── background.js          # Service worker - handles API calls & state
├── content.js             # Content script - text extraction & widget
├── popup/
│   ├── popup.html         # Settings popup UI
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup interactions
├── lib/
│   ├── gemini.js          # Gemini API integration
│   └── youtube.js         # YouTube search & player utilities
├── styles/
│   └── widget.css         # Floating widget styles
├── icons/
│   ├── icon16.png         # 16x16 icon
│   ├── icon48.png         # 48x48 icon
│   └── icon128.png        # 128x128 icon
└── README.md              # This file
```

## Usage

### Automatic Analysis

1. Navigate to any article page
2. Click the "Analyze Mood" button in the floating widget
3. Wait for the AI to analyze the content
4. Enjoy mood-matched background music!

### Manual Mood Selection

1. Open the floating widget or extension popup
2. Click one of the mood buttons:
   - 🎯 **Focus** - Lo-fi hip hop study beats
   - 😌 **Relax** - Calm acoustic ambient music
   - 😢 **Sad** - Melancholic piano solo
   - ⚡ **Energy** - Upbeat electronic motivation
   - 🎬 **Cinematic** - Epic orchestral soundtracks
   - 🌿 **Nature** - Nature sounds and ambient relaxation

### Player Controls

- **Play/Pause**: Toggle music playback
- **Skip**: Find another track with similar mood
- **Volume Slider**: Adjust playback volume

## Configuration

### Excluded Domains

By default, MoodReader is disabled on:
- youtube.com
- netflix.com
- spotify.com
- music.youtube.com
- soundcloud.com

You can add/remove domains in the extension popup settings.

### Auto-Analyze (Coming Soon)

Enable automatic mood analysis when page loads (disabled by default).

## Technical Details

### Permissions Required

- `activeTab` - Access current tab content
- `scripting` - Inject content scripts
- `storage` - Store settings and state

### Host Permissions

- `<all_urls>` - Read content from any webpage
- `https://generativelanguage.googleapis.com/*` - Gemini API calls

### Gemini Prompt

The extension uses a carefully crafted prompt for the Gemini API:

- Acts as a professional Music Supervisor
- Returns YouTube-optimized search queries
- Avoids copyrighted content (no artist names or song titles)
- Uses atmospheric keywords (Lo-fi, Ambient, Cinematic, Instrumental)
- Appends modifiers for continuous background music

## Development

### Prerequisites

- Google Chrome (version 88+)
- Node.js (optional, for development tools)

### Local Development

1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the MoodReader card
4. Test your changes

### Building for Production

The extension is ready to use without a build step. Simply zip all files (excluding `.git` and development files) for distribution.

## Troubleshooting

### "API key not configured" Error

Make sure you've entered a valid Gemini API key in the extension settings.

### No Music Playing

1. Check if the current domain is in the excluded list
2. Ensure the page has enough text content (minimum 50 characters)
3. Check your browser's console for errors

### Widget Not Appearing

1. Refresh the page
2. Check if the domain is excluded
3. Try clicking the extension icon and selecting "Toggle Widget"

## Privacy

- Text content is sent to Google Gemini API for analysis
- No personal data is collected or stored externally
- All settings are stored locally in Chrome storage

## License

MIT License - Feel free to use and modify!

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

---

Made with ❤️ for immersive reading
