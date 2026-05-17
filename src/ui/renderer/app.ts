// Renderer-side logic for the Synkromium settings window.
// Communicates with main process only through window.synkromium (see preload.ts).

const navItems = document.querySelectorAll<HTMLElement>('.nav-item');
const pages = document.querySelectorAll<HTMLElement>('.page');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const targetPage = item.getAttribute('data-page');
    if (!targetPage) return;

    navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');

    pages.forEach(page => {
      page.classList.toggle('active', page.id === `page-${targetPage}`);
    });
  });
});

// DOM references
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const lastSyncEl = document.getElementById('last-sync');
const deviceNameEl = document.getElementById('device-name');
const deviceIdEl = document.getElementById('device-id');
const devicePlatformEl = document.getElementById('device-platform');
const browserListEl = document.getElementById('browser-list');
const syncNowBtn = document.getElementById('btn-sync-now');
const sidebarStatusDot = document.getElementById('sidebar-status-dot');
const sidebarStatusText = document.getElementById('sidebar-status-text');

const githubUsernameInput = document.getElementById('github-username') as HTMLInputElement;
const githubTokenInput = document.getElementById('github-token') as HTMLInputElement;
const repoNameInput = document.getElementById('repo-name') as HTMLInputElement;
const toggleTokenBtn = document.getElementById('toggle-token');
const testConnectionBtn = document.getElementById('btn-test-connection');
const saveGithubBtn = document.getElementById('btn-save-github');
const connectionResult = document.getElementById('connection-result');

const syncSettingsCheck = document.getElementById('sync-settings') as HTMLInputElement;
const syncExtensionsCheck = document.getElementById('sync-extensions') as HTMLInputElement;
const syncBookmarksCheck = document.getElementById('sync-bookmarks') as HTMLInputElement;
const autoSyncCheck = document.getElementById('auto-sync') as HTMLInputElement;
const syncOnStartupCheck = document.getElementById('sync-on-startup') as HTMLInputElement;
const pollIntervalInput = document.getElementById('poll-interval') as HTMLInputElement;
const saveSyncBtn = document.getElementById('btn-save-sync');

const browserOptionsEl = document.getElementById('browser-options');
const profileNameInput = document.getElementById('profile-name') as HTMLInputElement;
const customBrowserPathInput = document.getElementById('custom-browser-path') as HTMLInputElement;
const validatePathBtn = document.getElementById('btn-validate-path');
const pathValidationResult = document.getElementById('path-validation-result');
const saveBrowserBtn = document.getElementById('btn-save-browser');

let currentSettings: Record<string, unknown> = {};
let selectedBrowser = 'chrome';
let installedBrowsers: string[] = [];

function updateSyncStatus(status: string, message: string): void {
  if (statusDot) {
    statusDot.className = 'status-dot-lg';
    statusDot.classList.add(status);
  }
  if (statusText) statusText.textContent = message;

  if (sidebarStatusDot) {
    sidebarStatusDot.className = 'status-dot';
    sidebarStatusDot.classList.add(status);
  }
  if (sidebarStatusText) sidebarStatusText.textContent = message;
}

function updateLastSync(timestamp: string): void {
  if (!lastSyncEl) return;
  lastSyncEl.textContent = timestamp
    ? `Last synced: ${new Date(timestamp).toLocaleString()}`
    : 'Last synced: Never';
}

toggleTokenBtn?.addEventListener('click', () => {
  if (githubTokenInput.type === 'password') {
    githubTokenInput.type = 'text';
    toggleTokenBtn.textContent = '🙈';
  } else {
    githubTokenInput.type = 'password';
    toggleTokenBtn.textContent = '👁';
  }
});

testConnectionBtn?.addEventListener('click', async () => {
  if (!connectionResult) return;

  testConnectionBtn.classList.add('loading');
  testConnectionBtn.setAttribute('disabled', 'true');
  connectionResult.classList.add('hidden');

  await saveGithubSettings();

  try {
    const result = await window.synkromium.testConnection();
    connectionResult.textContent = result.message;
    connectionResult.className = `result-banner ${result.success ? 'success' : 'error'}`;
  } catch {
    connectionResult.textContent = 'Connection test failed unexpectedly.';
    connectionResult.className = 'result-banner error';
  }

  testConnectionBtn.classList.remove('loading');
  testConnectionBtn.removeAttribute('disabled');
});

saveGithubBtn?.addEventListener('click', async () => {
  await saveGithubSettings();
  showBanner(connectionResult, 'Settings saved!', true);
});

async function saveGithubSettings(): Promise<void> {
  const settings: Record<string, unknown> = {
    githubUsername: githubUsernameInput?.value || '',
    repoName: repoNameInput?.value || '',
  };

  // Only update token if user typed a new one (not the masked placeholder)
  const tokenValue = githubTokenInput?.value || '';
  if (tokenValue && !tokenValue.startsWith('•')) {
    settings.githubToken = tokenValue;
  }

  await window.synkromium.saveSettings(settings);
}

saveSyncBtn?.addEventListener('click', async () => {
  await window.synkromium.saveSettings({
    syncOptions: {
      settings: syncSettingsCheck?.checked ?? true,
      extensions: syncExtensionsCheck?.checked ?? true,
      bookmarks: syncBookmarksCheck?.checked ?? true,
    },
    autoSync: autoSyncCheck?.checked ?? true,
    syncOnStartup: syncOnStartupCheck?.checked ?? true,
    pollIntervalMinutes: parseInt(pollIntervalInput?.value || '15', 10),
  });

  showBanner(null, 'Sync settings saved!', true);
});

function renderBrowserOptions(): void {
  if (!browserOptionsEl) return;

  const allBrowsers = [
    { id: 'chrome', name: 'Google Chrome', icon: '🌐' },
    { id: 'chromium', name: 'Chromium', icon: '◉' },
    { id: 'brave', name: 'Brave', icon: '🦁' },
    { id: 'edge', name: 'Microsoft Edge', icon: '🔵' },
    { id: 'helium', name: 'Helium', icon: '☀' },
  ];

  browserOptionsEl.innerHTML = '';

  for (const browser of allBrowsers) {
    const isInstalled = installedBrowsers.includes(browser.id);
    const isSelected = selectedBrowser === browser.id;

    const card = document.createElement('div');
    card.className = `browser-option ${isSelected ? 'selected' : ''}`;
    card.innerHTML = `
      <span style="font-size: 24px;">${browser.icon}</span>
      <div class="browser-name">${browser.name}</div>
      <div class="browser-status ${isInstalled ? 'installed' : ''}">
        ${isInstalled ? '● Installed' : '○ Not found'}
      </div>
    `;

    card.addEventListener('click', () => {
      selectedBrowser = browser.id;
      renderBrowserOptions();
    });

    browserOptionsEl.appendChild(card);
  }
}

validatePathBtn?.addEventListener('click', async () => {
  if (!pathValidationResult) return;

  const customPath = customBrowserPathInput?.value || '';
  if (!customPath.trim()) {
    showBanner(pathValidationResult, 'Enter a path to validate.', false);
    return;
  }

  validatePathBtn.classList.add('loading');
  validatePathBtn.setAttribute('disabled', 'true');
  pathValidationResult.classList.add('hidden');

  try {
    const profileName = profileNameInput?.value || 'Default';
    const result = await window.synkromium.validateBrowserPath(customPath, profileName);
    pathValidationResult.textContent = result.message;
    pathValidationResult.className = `result-banner ${result.valid ? 'success' : 'error'}`;
  } catch {
    pathValidationResult.textContent = 'Validation failed unexpectedly.';
    pathValidationResult.className = 'result-banner error';
  }

  validatePathBtn.classList.remove('loading');
  validatePathBtn.removeAttribute('disabled');
});

saveBrowserBtn?.addEventListener('click', async () => {
  await window.synkromium.saveSettings({
    browser: selectedBrowser,
    profileName: profileNameInput?.value || 'Default',
    customBrowserPath: customBrowserPathInput?.value || '',
  });

  showBanner(pathValidationResult, 'Browser choice saved!', true);
});

syncNowBtn?.addEventListener('click', async () => {
  syncNowBtn.setAttribute('disabled', 'true');
  syncNowBtn.classList.add('loading');
  updateSyncStatus('pushing', 'Syncing...');

  try {
    await window.synkromium.syncNow();
    updateSyncStatus('idle', 'Sync complete!');
    updateLastSync(new Date().toISOString());
  } catch {
    updateSyncStatus('error', 'Sync failed.');
  }

  syncNowBtn.removeAttribute('disabled');
  syncNowBtn.classList.remove('loading');
});

function showBanner(bannerEl: HTMLElement | null, message: string, success: boolean): void {
  const target = bannerEl || connectionResult;
  if (!target) return;

  target.textContent = message;
  target.className = `result-banner ${success ? 'success' : 'error'}`;

  setTimeout(() => { target.classList.add('hidden'); }, 3000);
}

async function initialize(): Promise<void> {
  try {
    const settings = await window.synkromium.getSettings();
    currentSettings = settings;

    if (githubUsernameInput) githubUsernameInput.value = (settings.githubUsername as string) || '';
    if (githubTokenInput) githubTokenInput.value = (settings.githubTokenMasked as string) || '';
    if (repoNameInput) repoNameInput.value = (settings.repoName as string) || '';

    const syncOptions = settings.syncOptions as { settings: boolean; extensions: boolean; bookmarks: boolean } | undefined;
    if (syncSettingsCheck && syncOptions) syncSettingsCheck.checked = syncOptions.settings;
    if (syncExtensionsCheck && syncOptions) syncExtensionsCheck.checked = syncOptions.extensions;
    if (syncBookmarksCheck && syncOptions) syncBookmarksCheck.checked = syncOptions.bookmarks;
    if (autoSyncCheck) autoSyncCheck.checked = (settings.autoSync as boolean) ?? true;
    if (syncOnStartupCheck) syncOnStartupCheck.checked = (settings.syncOnStartup as boolean) ?? true;
    if (pollIntervalInput) pollIntervalInput.value = String(settings.pollIntervalMinutes || 15);

    selectedBrowser = (settings.browser as string) || 'chrome';
    if (profileNameInput) profileNameInput.value = (settings.profileName as string) || 'Default';
    if (customBrowserPathInput) customBrowserPathInput.value = (settings.customBrowserPath as string) || '';

    const device = await window.synkromium.getDeviceInfo();
    if (deviceNameEl) deviceNameEl.textContent = device.name;
    if (deviceIdEl) deviceIdEl.textContent = device.id;
    if (devicePlatformEl) devicePlatformEl.textContent = device.platform;

    installedBrowsers = await window.synkromium.getInstalledBrowsers();

    if (browserListEl) {
      browserListEl.innerHTML = '';
      const prettyNames: Record<string, string> = {
        chrome: 'Google Chrome', chromium: 'Chromium',
        brave: 'Brave', edge: 'Microsoft Edge',
        helium: 'Helium',
      };
      if (installedBrowsers.length === 0) {
        browserListEl.innerHTML = '<li class="chip">No browsers detected</li>';
      } else {
        for (const b of installedBrowsers) {
          const li = document.createElement('li');
          li.className = 'chip';
          li.textContent = prettyNames[b] || b;
          browserListEl.appendChild(li);
        }
      }
    }

    renderBrowserOptions();

    const syncStatus = await window.synkromium.getSyncStatus();
    updateSyncStatus(syncStatus.status, syncStatus.message);
    updateLastSync(syncStatus.lastSyncAt);

    window.synkromium.onSyncStatusChanged((status, message) => {
      updateSyncStatus(status, message);
    });

  } catch (err) {
    console.warn('IPC not available — running in standalone mode.', err);
    updateSyncStatus('idle', 'Ready (standalone mode)');
    renderBrowserOptions();
  }
}

initialize();
