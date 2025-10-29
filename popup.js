let scrapedData = [];

document.addEventListener('DOMContentLoaded', async () => {
  const toggleBtn = document.getElementById('toggleBtn');
  const exportBtn = document.getElementById('exportBtn');
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
    if (!stored.isScrapingActive) {
      toggleBtn.textContent = 'Start Auto-Scraping';
    }

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
    toggleBtn.disabled = true;
    toggleBtn.textContent = 'Navigate to a Company\'s People Page';
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

      try {
        // Clear previously scraped data
        scrapedData = [];
        await chrome.storage.local.set({ scrapedData: [] });
        updateUI();
        console.log('Cleared previously scraped data from storage');

        // Auto-detect and set company name from LinkedIn URL
        if (tab.url.includes('linkedin.com/company/')) {
          const urlMatch = tab.url.match(/linkedin\.com\/company\/([^\/]+)/);
          if (urlMatch && urlMatch[1]) {
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

        // Ensure content script is injected
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }).catch(() => {
          // Content script may already be injected, ignore error
        });

        // Wait a moment for script to load
        await new Promise(resolve => setTimeout(resolve, 100));

        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'startMonitoring'
        });

        if (response && response.success) {
          isScrapingActive = true;
          await chrome.storage.local.set({ isScrapingActive: true });
          toggleBtn.textContent = 'Stop Auto-Scraping';
          toggleBtn.className = 'btn-danger';
        }
      } catch (error) {
        console.error('Error starting:', error);
      }

      toggleBtn.disabled = false;
    } else {
      // Stop scraping
      toggleBtn.disabled = true;

      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'stopMonitoring'
        });

        if (response && response.success) {
          isScrapingActive = false;
          await chrome.storage.local.set({ isScrapingActive: false });
          toggleBtn.textContent = 'Start Auto-Scraping';
          toggleBtn.className = 'btn-primary';
        }
      } catch (error) {
        console.error('Error stopping:', error);
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

      // Get first and last initials
      const firstInitial = firstName ? firstName.charAt(0).toLowerCase() : '';
      const lastInitial = lastName ? lastName.charAt(0).toLowerCase() : '';

      // Convert to lowercase and replace placeholders
      const email = format
        .replace(/first_initial/gi, firstInitial)
        .replace(/last_initial/gi, lastInitial)
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
