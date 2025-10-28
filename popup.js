let scrapedData = [];

document.addEventListener('DOMContentLoaded', async () => {
  const toggleBtn = document.getElementById('toggleBtn');
  const exportBtn = document.getElementById('exportBtn');
  const statusEl = document.getElementById('status');
  const countEl = document.getElementById('count');
  const resultsListEl = document.getElementById('results-list');
  const companyNameInput = document.getElementById('companyName');
  const emailFormatInput = document.getElementById('emailFormat');

  let isScrapingActive = false;

  // Load saved data from storage
  const stored = await chrome.storage.local.get(['scrapedData', 'emailFormat', 'companyName', 'isScrapingActive']);
  if (stored.scrapedData && stored.scrapedData.length > 0) {
    scrapedData = stored.scrapedData;
    updateUI();
  }

  if (stored.isScrapingActive) {
    isScrapingActive = true;
    toggleBtn.textContent = 'Stop Auto-Scraping';
    toggleBtn.className = 'btn-danger';
    statusEl.textContent = 'Auto-scraping in progress...';
    statusEl.style.color = '#0a66c2';
  } else {
    statusEl.textContent = 'Click "Start Auto-Scraping" to begin';
    statusEl.style.color = '#666';
  }

  // Load saved company name
  if (stored.companyName) {
    companyNameInput.value = stored.companyName;
  }

  // Load saved email format
  if (stored.emailFormat) {
    emailFormatInput.value = stored.emailFormat;
  }

  // Save company name when changed
  companyNameInput.addEventListener('change', async () => {
    await chrome.storage.local.set({ companyName: companyNameInput.value });
  });

  // Save email format when changed
  emailFormatInput.addEventListener('change', async () => {
    await chrome.storage.local.set({ emailFormat: emailFormatInput.value });
  });

  // Check if current tab is a matching page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isValidPage = tab && tab.url && (
    tab.url.match(/https:\/\/www\.linkedin\.com\/company\/.*\/people/) ||
    tab.url.includes('example') && tab.url.includes('page.html')
  );

  if (isValidPage) {
    toggleBtn.disabled = false;

    // Auto-detect company name from LinkedIn URL
    if (tab.url.includes('linkedin.com/company/')) {
      const urlMatch = tab.url.match(/linkedin\.com\/company\/([^\/]+)/);
      if (urlMatch && urlMatch[1] && !companyNameInput.value) {
        // Convert company slug to readable name (replace dashes with spaces, capitalize)
        const companySlug = urlMatch[1];
        const readableName = companySlug
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        companyNameInput.value = readableName;
        await chrome.storage.local.set({ companyName: readableName });
      }
    }
  } else {
    statusEl.textContent = 'Please navigate to a LinkedIn company "People" page or example page.html';
    statusEl.style.color = '#cc0000';
    toggleBtn.disabled = true;
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

  toggleBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!isScrapingActive) {
      // Start scraping
      toggleBtn.disabled = true;
      statusEl.textContent = 'Starting auto-scraping...';
      statusEl.style.color = '#0a66c2';

      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'startMonitoring'
        });

        if (response && response.success) {
          isScrapingActive = true;
          await chrome.storage.local.set({ isScrapingActive: true });
          toggleBtn.textContent = 'Stop Auto-Scraping';
          toggleBtn.className = 'btn-danger';
          statusEl.textContent = 'Auto-scraping in progress...';
          statusEl.style.color = '#0a66c2';
        } else {
          statusEl.textContent = 'Error starting auto-scraping';
          statusEl.style.color = '#cc0000';
        }
      } catch (error) {
        statusEl.textContent = 'Error: ' + error.message;
        statusEl.style.color = '#cc0000';
      }

      toggleBtn.disabled = false;
    } else {
      // Stop scraping
      toggleBtn.disabled = true;
      statusEl.textContent = 'Stopping auto-scraping...';
      statusEl.style.color = '#cc0000';

      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'stopMonitoring'
        });

        if (response && response.success) {
          isScrapingActive = false;
          await chrome.storage.local.set({ isScrapingActive: false });
          toggleBtn.textContent = 'Start Auto-Scraping';
          toggleBtn.className = 'btn-primary';
          statusEl.textContent = 'Auto-scraping stopped. Data preserved.';
          statusEl.style.color = '#666';
        } else {
          statusEl.textContent = 'Error stopping auto-scraping';
          statusEl.style.color = '#cc0000';
        }
      } catch (error) {
        statusEl.textContent = 'Error: ' + error.message;
        statusEl.style.color = '#cc0000';
      }

      toggleBtn.disabled = false;
    }
  });

  exportBtn.addEventListener('click', () => {
    const emailFormat = emailFormatInput.value.trim();
    const companyName = companyNameInput.value.trim();
    exportToCSV(scrapedData, emailFormat, companyName);
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

  function exportToCSV(data, emailFormat, companyName) {
    if (data.length === 0) return;

    // Split name into first and last name
    function splitName(fullName) {
      if (!fullName) return { firstName: '', lastName: '' };

      const parts = fullName.trim().split(/\s+/);

      if (parts.length === 0) {
        return { firstName: '', lastName: '' };
      } else if (parts.length === 1) {
        return { firstName: parts[0], lastName: '' };
      } else {
        // First word is first name, last word is last name
        const firstName = parts[0];
        const lastName = parts[parts.length - 1];
        return { firstName, lastName };
      }
    }

    // Generate email from format
    function generateEmail(firstName, lastName, format) {
      if (!format) return '';

      // Convert to lowercase and replace placeholders
      const email = format
        .replace(/first/gi, firstName.toLowerCase())
        .replace(/last/gi, lastName.toLowerCase());

      return email;
    }

    // Column order: First, Last, Position, LinkedIn, Email, Company
    const headers = ['First', 'Last', 'Position', 'LinkedIn', 'Email', 'Company'];
    const rows = data
      .map(person => {
        const { firstName, lastName } = splitName(person.name);
        return {
          firstName,
          lastName,
          position: person.position || '',
          profileUrl: person.profileUrl || '',
          email: generateEmail(firstName, lastName, emailFormat),
          company: companyName || ''
        };
      })
      .filter(row => row.firstName && row.lastName) // Skip if first or last name is empty
      .map(row => [
        row.firstName,
        row.lastName,
        row.position,
        row.profileUrl,
        row.email,
        row.company
      ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Generate filename: company date time.csv
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
    const safeCompanyName = companyName ? companyName.replace(/[^a-z0-9]/gi, '_') : 'Company';
    const filename = `${safeCompanyName} ${date} ${time}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
