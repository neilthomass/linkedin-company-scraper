// Content script for scraping LinkedIn company people pages
// Continuously scrapes as new people load

console.log('LinkedIn People Scraper: Content script loaded');

// Global state
const scrapedPeople = new Map(); // Use Map to avoid duplicates
let observer = null;
let isObserving = false;

// Settings
const AUTO_SCRAPE_DELAY = 1000; // Wait 1 second for initial page load
const DEBOUNCE_DELAY = 500; // Debounce delay for DOM changes

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
        name = nameElement.textContent.trim();
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

// Set up continuous monitoring with MutationObserver
function startContinuousMonitoring() {
  if (isObserving) return;

  console.log('Starting continuous monitoring...');

  // Initial scrape
  const initialCount = scrapeCurrentView();
  console.log(`Initial scrape: Found ${initialCount} people`);

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
    }
  });

  // Start observing
  observer.observe(container, {
    childList: true,
    subtree: true
  });

  isObserving = true;
  console.log('Continuous monitoring active');
}

// Stop monitoring
function stopContinuousMonitoring() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  isObserving = false;
  console.log('Continuous monitoring stopped');
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startScraping') {
    // Manual scrape
    const count = scrapeCurrentView();
    const data = Array.from(scrapedPeople.values());
    sendResponse({ success: true, data });
    return true;
  }

  if (request.action === 'getData') {
    const data = Array.from(scrapedPeople.values());
    sendResponse({ success: true, data });
    return true;
  }

  if (request.action === 'stopMonitoring') {
    stopContinuousMonitoring();
    sendResponse({ success: true });
    return true;
  }
});

// AUTO-START: Begin continuous monitoring after page loads
setTimeout(() => {
  console.log('Auto-starting continuous scraper...');
  startContinuousMonitoring();
}, AUTO_SCRAPE_DELAY);

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
