# LinkedIn People Scraper

Chrome extension that automatically scrapes employee names and positions from LinkedIn company pages.

## Features

- **Automatic Scraping**: Automatically collects data when you visit a LinkedIn company "People" page
- **Auto-Scroll**: Scrolls through the page to load and capture all results
- **CSV Export**: Export collected data to CSV format
- **Real-time Updates**: Shows count on extension badge
- **No Button Required**: Scraping happens automatically in the background

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `/Users/neilthomas/code/linkscrape` directory
5. The extension is now installed!

## Usage

1. Navigate to a LinkedIn company's "People" page:
   - Example: `https://www.linkedin.com/company/{company-name}/people/`
2. The extension will automatically start scraping after 2 seconds
3. Watch the console (F12 → Console) to see progress
4. Click the extension icon to view results
5. Click "Export CSV" to download the data

## Testing

Open the included `example page.html` file in Chrome to test the extension without visiting LinkedIn.

## How It Works

1. **Content Script** (`content.js`): Automatically injected into LinkedIn company people pages
2. **Auto-Scrape**: Waits 2 seconds for page load, then scrapes visible people
3. **Auto-Scroll**: Scrolls to the bottom to load more results (10 scroll attempts)
4. **Data Storage**: Saves results to Chrome storage
5. **Badge Update**: Shows count on extension icon
6. **Popup**: Displays results and allows CSV export

## Files

- `manifest.json` - Extension configuration
- `content.js` - Auto-scraping logic
- `popup.html` - UI interface
- `popup.js` - UI interactions
- `background.js` - Service worker for storage and badges
- `styles.css` - LinkedIn-themed styling
- `example page.html` - Test page
- `icons/` - Extension icons

## Configuration

Edit `content.js` to adjust settings:

```javascript
const AUTO_SCRAPE_DELAY = 2000; // Delay before auto-scrape starts (ms)
const SCROLL_DELAY = 2000;      // Delay between scrolls (ms)
const AUTO_SCROLL_ENABLED = true; // Enable/disable auto-scroll
```

## Permissions

- `activeTab` - Access current tab
- `storage` - Save scraped data
- `scripting` - Inject content script
- `https://www.linkedin.com/*` - Access LinkedIn pages

## Troubleshooting

**Extension not working?**
- Check that you're on a LinkedIn company "People" page
- Open DevTools (F12) and check the Console for errors
- Reload the extension in `chrome://extensions/`

**No data showing?**
- Wait 2 seconds after page load for auto-scrape to start
- Check browser console for log messages
- Try clicking "Start Scraping" button manually

**Console Logs:**
- "LinkedIn People Scraper: Content script loaded" - Script injected
- "Auto-scraping triggered..." - Auto-scrape started
- "Found X elements with selector: ..." - Elements detected
- "✓ Scraped X people automatically!" - Complete

## Notes

This extension is for educational purposes. Always respect LinkedIn's Terms of Service and robots.txt when scraping data.
