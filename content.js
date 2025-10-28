// Content script for scraping LinkedIn company people pages
// Continuously scrapes as new people load

console.log('LinkedIn People Scraper: Content script loaded');

// Global state
const scrapedPeople = new Map(); // Use Map to avoid duplicates
let observer = null;
let isObserving = false;
let autoClickInterval = null;

// Settings
const AUTO_SCRAPE_DELAY = 1000; // Wait 1 second for initial page load
const DEBOUNCE_DELAY = 500; // Debounce delay for DOM changes
const AUTO_CLICK_INTERVAL = 3000; // Try to click "Show more" every 3 seconds

// Clean name by removing titles and credentials
function cleanName(rawName) {
  if (!rawName) return null;

  let name = rawName.trim();

  // Remove emojis (comprehensive Unicode emoji ranges)
  name = name.replace(/[\u{1F600}-\u{1F64F}]/gu, ''); // Emoticons
  name = name.replace(/[\u{1F300}-\u{1F5FF}]/gu, ''); // Misc Symbols and Pictographs
  name = name.replace(/[\u{1F680}-\u{1F6FF}]/gu, ''); // Transport and Map
  name = name.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, ''); // Flags
  name = name.replace(/[\u{2600}-\u{26FF}]/gu, '');   // Misc symbols
  name = name.replace(/[\u{2700}-\u{27BF}]/gu, '');   // Dingbats
  name = name.replace(/[\u{1F900}-\u{1F9FF}]/gu, ''); // Supplemental Symbols and Pictographs
  name = name.replace(/[\u{1FA00}-\u{1FA6F}]/gu, ''); // Chess Symbols
  name = name.replace(/[\u{1FA70}-\u{1FAFF}]/gu, ''); // Symbols and Pictographs Extended-A
  name = name.replace(/[\u{FE00}-\u{FE0F}]/gu, '');   // Variation Selectors
  name = name.replace(/[\u{200D}]/gu, '');            // Zero Width Joiner

  // Remove parentheses and everything inside them
  name = name.replace(/\([^)]*\)/g, '').trim();

  // Remove everything after comma (titles like ", MBA", ", CPA", etc.)
  if (name.includes(',')) {
    name = name.split(',')[0].trim();
  }

  // Remove PhD variants (Ph.D., PhD, Ph.D, PHD, etc.)
  name = name.replace(/\b(Ph\.?D\.?|PHD)\b/gi, '').trim();

  // Remove DR/Dr./dr. variants (with word boundary to avoid partial matches)
  name = name.replace(/\b(DR|Dr|dr)\.?\s*/gi, '').trim();

  // Remove other common suffixes/titles
  name = name.replace(/\b(Jr\.?|Sr\.?|II|III|IV|Esq\.?|M\.?D\.?|DDS|DVM)\b/gi, '').trim();

  // Remove standalone periods at the beginning
  name = name.replace(/^\.+\s*/, '').trim();

  // Clean up multiple spaces
  name = name.replace(/\s+/g, ' ').trim();

  return name;
}

// Validate name - check if last name is valid
function isValidName(name) {
  if (!name) return false;

  // Reject if name contains "linkedin" (case-insensitive)
  if (/linkedin/i.test(name)) {
    return false;
  }

  const parts = name.trim().split(/\s+/);

  // Need at least 2 parts (first and last name)
  if (parts.length < 2) return false;

  // Get last name (last part)
  const lastName = parts[parts.length - 1];

  // Check if last name is just one character followed by a dot (e.g., "M.")
  if (/^[A-Za-z]\.?$/.test(lastName)) {
    return false;
  }

  return true;
}

// Function to scrape visible people cards
function scrapeCurrentView() {
  // LinkedIn uses different selectors, we'll try multiple patterns
  const selectors = [
    '.org-people-profile-card',
    '.scaffold-finite-scroll__content li'
  ];

  let personElements = [];
  for (const selector of selectors) {
    personElements = document.querySelectorAll(selector);
    if (personElements.length > 0) {
      break;
    }
  }

  let newCount = 0;

  personElements.forEach(element => {
    try {
      let name = null;
      let position = null;
      let profileUrl = null;

      // Extract name - look for link with data-anonymize or in title
      const nameElement = element.querySelector('.artdeco-entity-lockup__title a') ||
                        element.querySelector('a[data-anonymize="person-name"]') ||
                        element.querySelector('.artdeco-entity-lockup__title');

      if (nameElement) {
        const rawName = nameElement.textContent.trim();
        name = cleanName(rawName);
      }

      // Validate name before proceeding
      if (!isValidName(name)) {
        return; // Skip this person
      }

      // Extract position
      const positionElement = element.querySelector('.artdeco-entity-lockup__subtitle');

      if (positionElement) {
        position = positionElement.textContent.trim();
      }

      // Extract profile URL
      const linkElement = element.querySelector('a[href*="/in/"]');
      if (linkElement) {
        profileUrl = linkElement.href.split('?')[0]; // Remove query params
      }

      if (name) {
        // Use profile URL as unique key, or name if URL not available
        const key = profileUrl || name;

        if (!scrapedPeople.has(key)) {
          scrapedPeople.set(key, {
            name,
            position,
            profileUrl
          });
          newCount++;
        }
      }
    } catch (e) {
      console.error('Error scraping individual element:', e);
    }
  });

  if (newCount > 0) {
    console.log(`Found ${newCount} new people (Total: ${scrapedPeople.size})`);
    saveData();
  }

  return newCount;
}

// Save data to storage
async function saveData() {
  const data = Array.from(scrapedPeople.values());
  try {
    await chrome.storage.local.set({ scrapedData: data });

    // Update badge
    chrome.runtime.sendMessage({
      action: 'updateBadge',
      count: data.length
    }).catch(() => {
      // Ignore errors if background script isn't ready
    });
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Debounce function to avoid too frequent updates
let debounceTimer = null;
function debouncedScrape() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    scrapeCurrentView();
  }, DEBOUNCE_DELAY);
}

// Auto-click "Show more results" button
function autoClickShowMore() {
  // Try different selectors for "Show more" buttons
  const buttonSelectors = [
    'button:contains("Show more")',
    'button:contains("show more")',
    '.scaffold-finite-scroll__load-button',
    'button[aria-label*="more"]',
    'button.artdeco-button--secondary',
    '.load-more button',
    'button' // Fallback: find any button with "show" or "more" in text
  ];

  // Custom contains selector
  const buttons = Array.from(document.querySelectorAll('button'));
  const showMoreButton = buttons.find(btn => {
    const text = btn.textContent.toLowerCase();
    return text.includes('show') && text.includes('more') ||
           text.includes('load') && text.includes('more') ||
           text.includes('see') && text.includes('more');
  });

  if (showMoreButton && showMoreButton.offsetParent !== null) {
    console.log('Clicking "Show more results" button...');
    showMoreButton.click();
    return true;
  }

  return false;
}

// Set up continuous monitoring with MutationObserver
function startContinuousMonitoring() {
  if (isObserving) return;

  console.log('Starting continuous monitoring...');

  // Initial scrape
  const initialCount = scrapeCurrentView();
  console.log(`Initial scrape: Found ${initialCount} people`);

  // Try to auto-click "Show more" button after initial scrape
  setTimeout(() => {
    autoClickShowMore();
  }, 1000);

  // Find the container to observe
  const container = document.querySelector('.scaffold-finite-scroll__content') ||
                   document.querySelector('main') ||
                   document.body;

  if (!container) {
    console.warn('Could not find container to observe');
    return;
  }

  // Create observer for DOM changes
  observer = new MutationObserver((mutations) => {
    // Check if any new nodes were added
    let hasNewContent = false;

    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        hasNewContent = true;
        break;
      }
    }

    if (hasNewContent) {
      debouncedScrape();

      // Try to click "Show more" button after new content loads
      setTimeout(() => {
        autoClickShowMore();
      }, 1000);
    }
  });

  // Start observing
  observer.observe(container, {
    childList: true,
    subtree: true
  });

  isObserving = true;
  console.log('Continuous monitoring active');

  // Set up periodic auto-click for "Show more" button (every 3 seconds)
  function scheduleNextClick() {
    if (autoClickInterval) {
      clearTimeout(autoClickInterval);
    }

    autoClickInterval = setTimeout(() => {
      const clicked = autoClickShowMore();
      if (clicked) {
        console.log('Button clicked, scheduling next attempt...');
      }
      // Schedule next click regardless of whether button was found
      scheduleNextClick();
    }, AUTO_CLICK_INTERVAL);
  }

  scheduleNextClick();
  console.log('Auto-click scheduler started (3 second intervals)');
}

// Stop monitoring
function stopContinuousMonitoring() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  if (autoClickInterval) {
    clearTimeout(autoClickInterval);
    autoClickInterval = null;
  }

  isObserving = false;
  console.log('Continuous monitoring stopped');
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startMonitoring') {
    console.log('Starting monitoring from user action...');
    // Clear previously scraped data
    scrapedPeople.clear();
    console.log('Cleared previously scraped data');
    startContinuousMonitoring();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'stopMonitoring') {
    stopContinuousMonitoring();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'getData') {
    const data = Array.from(scrapedPeople.values());
    sendResponse({ success: true, data });
    return true;
  }
});

// DO NOT auto-start - wait for user to click Start button
console.log('Content script ready. Click "Start Auto-Scraping" to begin.');

// Also scrape on scroll events (for infinite scroll pages)
let scrollTimer = null;
window.addEventListener('scroll', () => {
  if (scrollTimer) {
    clearTimeout(scrollTimer);
  }

  scrollTimer = setTimeout(() => {
    debouncedScrape();
  }, 300);
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  stopContinuousMonitoring();
});

console.log('Auto-scraper initialized - will start in ' + AUTO_SCRAPE_DELAY + 'ms');
