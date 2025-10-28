# LinkedIn People Scraper

Chrome extension for scraping employee data from LinkedIn company pages.

## Installation

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select project directory

## Usage

1. Navigate to `https://www.linkedin.com/company/{company-name}/people/`
2. Click extension icon
3. Click "Start Auto-Scraping" button
4. Extension scrapes continuously and auto-clicks "Show more" every 3 seconds
5. Click "Stop Auto-Scraping" to stop (data is preserved)
6. Click "Export CSV" to download

## Name Cleaning

Removes: emojis, parentheses, commas, PhD, Dr, Jr, Sr, MD, titles

Rejects: single-word names, names ending in single letter (e.g., "John D.")

Splits: First word = First Name, Last word = Last Name

## CSV Format

Columns: First, Last, Position, LinkedIn, Email, Company

Filename: `CompanyName YYYY-MM-DD HH-MM-SS.csv`

Email: Generated from format template (e.g., `first.last@company.com`)

Company: Auto-detected from URL

## Files

- `content.js` - Scraping, DOM monitoring, auto-clicking
- `popup.js` - UI, CSV export
- `background.js` - Storage management
- `manifest.json` - Extension config

## Configuration

Edit `content.js`:

```javascript
const AUTO_SCRAPE_DELAY = 1000;      // Initial delay (ms)
const DEBOUNCE_DELAY = 500;          // DOM change debounce (ms)
const AUTO_CLICK_INTERVAL = 3000;    // Button click interval (ms)
```

## Testing

Open `example page.html` in Chrome, check console (F12) for logs.

## Troubleshooting

Check console for:
- "LinkedIn People Scraper: Content script loaded"
- "Found X people"
- "Clicking 'Show more results' button..."

Check storage:
```javascript
chrome.storage.local.get(['scrapedData'], console.log);
```

## Legal

Use at your own risk. Comply with LinkedIn TOS and data privacy laws.
