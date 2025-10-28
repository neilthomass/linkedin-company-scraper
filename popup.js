let scrapedData = [];

document.addEventListener('DOMContentLoaded', async () => {
  const scrapeBtn = document.getElementById('scrapeBtn');
  const exportBtn = document.getElementById('exportBtn');
  const statusEl = document.getElementById('status');
  const countEl = document.getElementById('count');
  const resultsListEl = document.getElementById('results-list');
  const autoScrollCheckbox = document.getElementById('autoScroll');
  const scrollDelayInput = document.getElementById('scrollDelay');

  // Load saved data from storage
  const stored = await chrome.storage.local.get(['scrapedData']);
  if (stored.scrapedData && stored.scrapedData.length > 0) {
    scrapedData = stored.scrapedData;
    updateUI();
    statusEl.textContent = `Auto-scraped ${scrapedData.length} people!`;
    statusEl.style.color = '#057642';
  } else {
    statusEl.textContent = 'Waiting for auto-scrape to complete...';
    statusEl.style.color = '#666';
  }

  // Check if current tab is a matching page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isValidPage = tab && tab.url && (
    tab.url.match(/https:\/\/www\.linkedin\.com\/company\/.*\/people/) ||
    tab.url.includes('example') && tab.url.includes('page.html')
  );

  if (isValidPage) {
    scrapeBtn.disabled = false;
  } else {
    statusEl.textContent = 'Please navigate to a LinkedIn company "People" page or example page.html';
    statusEl.style.color = '#cc0000';
    scrapeBtn.disabled = true;
  }

  // Listen for storage changes (when content script saves data)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.scrapedData) {
      scrapedData = changes.scrapedData.newValue || [];
      updateUI();
      if (scrapedData.length > 0) {
        statusEl.textContent = `Auto-scraped ${scrapedData.length} people!`;
        statusEl.style.color = '#057642';
      }
    }
  });

  scrapeBtn.addEventListener('click', async () => {
    scrapeBtn.disabled = true;
    statusEl.textContent = 'Manual scraping in progress...';
    statusEl.style.color = '#0a66c2';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const autoScroll = autoScrollCheckbox.checked;
    const scrollDelay = parseInt(scrollDelayInput.value, 10);

    try {
      // Send message to start scraping
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'startScraping',
        autoScroll,
        scrollDelay
      });

      if (response.success) {
        scrapedData = response.data;
        await chrome.storage.local.set({ scrapedData });
        updateUI();
        statusEl.textContent = `Manual scraping complete! Found ${scrapedData.length} people.`;
        statusEl.style.color = '#057642';
      } else {
        statusEl.textContent = 'Error: ' + (response.error || 'Unknown error');
        statusEl.style.color = '#cc0000';
      }
    } catch (error) {
      statusEl.textContent = 'Error: ' + error.message;
      statusEl.style.color = '#cc0000';
    }

    scrapeBtn.disabled = false;
  });

  exportBtn.addEventListener('click', () => {
    exportToCSV(scrapedData);
  });

  function updateUI() {
    countEl.textContent = scrapedData.length;
    exportBtn.disabled = scrapedData.length === 0;

    resultsListEl.innerHTML = '';
    if (scrapedData.length > 0) {
      const preview = scrapedData.slice(0, 10);
      preview.forEach(person => {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `
          <div class="result-name">${escapeHtml(person.name)}</div>
          <div class="result-position">${escapeHtml(person.position || 'N/A')}</div>
        `;
        resultsListEl.appendChild(div);
      });

      if (scrapedData.length > 10) {
        const moreDiv = document.createElement('div');
        moreDiv.className = 'result-item more';
        moreDiv.textContent = `... and ${scrapedData.length - 10} more`;
        resultsListEl.appendChild(moreDiv);
      }
    }
  }

  function exportToCSV(data) {
    if (data.length === 0) return;

    const headers = ['Name', 'Position', 'Profile URL'];
    const rows = data.map(person => [
      person.name,
      person.position || '',
      person.profileUrl || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `linkedin_people_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
