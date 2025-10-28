// Background service worker for LinkedIn People Scraper

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('LinkedIn People Scraper installed');

  // Disable the extension icon by default
  chrome.action.disable();

  // Set up rules to enable the icon only on LinkedIn pages
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostEquals: 'www.linkedin.com' }
          })
        ],
        actions: [new chrome.declarativeContent.ShowAction()]
      }
    ]);
  });
});

// Also update icon state when tabs change
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (tab.url.includes('linkedin.com')) {
      chrome.action.enable(tabId);
    } else {
      chrome.action.disable(tabId);
    }
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.url && tab.url.includes('linkedin.com')) {
      chrome.action.enable(activeInfo.tabId);
    } else {
      chrome.action.disable(activeInfo.tabId);
    }
  });
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getData') {
    chrome.storage.local.get(['scrapedData'], (result) => {
      sendResponse({ data: result.scrapedData || [] });
    });
    return true;
  }

  if (request.action === 'saveData') {
    chrome.storage.local.set({ scrapedData: request.data }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'clearData') {
    chrome.storage.local.remove(['scrapedData'], () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'updateBadge') {
    const count = request.count || 0;
    if (count > 0) {
      chrome.action.setBadgeText({ text: count.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#0a66c2' });
    }
    sendResponse({ success: true });
    return true;
  }
});

// Optional: Update badge with count of scraped people
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.scrapedData) {
    const count = changes.scrapedData.newValue?.length || 0;
    if (count > 0) {
      chrome.action.setBadgeText({ text: count.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#0a66c2' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }
});
