/**
 * app.ts — The renderer-side logic for the Synkromium settings window.
 *
 * This runs inside the Electron browser window (sandboxed).
 * It communicates with the main process ONLY through the
 * window.synkromium bridge (defined in preload.ts).
 *
 * Responsibilities:
 * - Page navigation (sidebar clicks)
 * - Loading and displaying settings from the main process
 * - Saving user changes back to the main process
 * - Showing connection test results
 * - Updating sync status in real-time
 */

// Type declarations for window.synkromium are in global.d.ts.

// ─── Page Navigation ────────────────────────────────────────────

const navItems = document.querySelectorAll<HTMLElement>('.nav-item');
const pages = document.querySelectorAll<HTMLElement>('.page');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const targetPage = item.getAttribute('data-page');
    if (!targetPage) return;

    // Update sidebar active state.
    navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');

    // Show the target page, hide the rest.
    pages.forEach(page => {
      if (page.id === `page-${targetPage}`) {
        page.classList.add('active');
      } else {
        page.classList.remove('active');
      }
    });
  });
});

// ─── DOM Element References ─────────────────────────────────────

// Dashboard
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

// GitHub Setup
const githubUsernameInput = document.getElementById('github-username') as HTMLInputElement;
const githubTokenInput = document.getElementById('github-token') as HTMLInputElement;
const repoNameInput = document.getElementById('repo-name') as HTMLInputElement;
const toggleTokenBtn = document.getElementById('toggle-token');
const testConnectionBtn = document.getElementById('btn-test-connection');
const saveGithubBtn = document.getElementById('btn-save-github');
const connectionResult = document.getElementById('connection-result');

// Sync Settings
const syncSettingsCheck = document.getElementById('sync-settings') as HTMLInputElement;
const syncExtensionsCheck = document.getElementById('sync-extensions') as HTMLInputElement;
const syncBookmarksCheck = document.getElementById('sync-bookmarks') as HTMLInputElement;
const autoSyncCheck = document.getElementById('auto-sync') as HTMLInputElement;
const syncOnStartupCheck = document.getElementById('sync-on-startup') as HTMLInputElement;
const pollIntervalInput = document.getElementById('poll-interval') as HTMLInputElement;
const saveSyncBtn = document.getElementById('btn-save-sync');

// Browser
const browserOptionsEl = document.getElementById('browser-options');
const profileNameInput = document.getElementById('profile-name') as HTMLInputElement;
const saveBrowserBtn = document.getElementById('btn-save-browser');

// ─── State ──────────────────────────────────────────────────────

let currentSettings: Record<string, unknown> = {};
let selectedBrowser = 'chrome';
let installedBrowsers: string[] = [];

// ─── Status Updates ─────────────────────────────────────────────

function updateSyncStatus(status: string, message: string): void {
  // Update main status display.
  if (statusDot) {
    statusDot.className = 'status-dot-lg';
    statusDot.classList.add(status);
  }
  if (statusText) statusText.textContent = message;

  // Update sidebar mini status.
  if (sidebarStatusDot) {
    sidebarStatusDot.className = 'status-dot';
    sidebarStatusDot.classList.add(status);
  }
  if (sidebarStatusText) sidebarStatusText.textContent = message;
}

function updateLastSync(timestamp: string): void {
  if (!lastSyncEl) return;
  if (timestamp) {
    const date = new Date(timestamp);
    lastSyncEl.textContent = `Last synced: ${date.toLocaleString()}`;
  } else {
    lastSyncEl.textContent = 'Last synced: Never';
  }
}

// ─── Token Visibility Toggle ────────────────────────────────────

toggleTokenBtn?.addEventListener('click', () => {
  if (githubTokenInput.type === 'password') {
    githubTokenInput.type = 'text';
    toggleTokenBtn.textContent = '🙈';
  } else {
    githubTokenInput.type = 'password';
    toggleTokenBtn.textContent = '👁';
  }
});

// ─── GitHub Setup Actions ───────────────────────────────────────

// Test Connection
testConnectionBtn?.addEventListener('click', async () => {
  if (!connectionResult) return;

  testConnectionBtn.classList.add('loading');
  testConnectionBtn.setAttribute('disabled', 'true');
  connectionResult.classList.add('hidden');

  // Save current values first so the test uses them.
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

// Save GitHub settings
saveGithubBtn?.addEventListener('click', async () => {
  await saveGithubSettings();
  showBanner(connectionResult, 'Settings saved!', true);
});

async function saveGithubSettings(): Promise<void> {
  const settings: Record<string, unknown> = {
    githubUsername: githubUsernameInput?.value || '',
    repoName: repoNameInput?.value || '',
  };

  // Only update the token if the user typed a new one.
  // (If they didn't touch it, the masked value would be there.)
  const tokenValue = githubTokenInput?.value || '';
  if (tokenValue && !tokenValue.startsWith('•')) {
    settings.githubToken = tokenValue;
  }

  await window.synkromium.saveSettings(settings);
}

// ─── Sync Settings Actions ──────────────────────────────────────

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

// ─── Browser Selection ──────────────────────────────────────────

function renderBrowserOptions(): void {
  if (!browserOptionsEl) return;

  const allBrowsers = [
    { id: 'chrome', name: 'Google Chrome', icon: '🌐' },
    { id: 'chromium', name: 'Chromium', icon: '◉' },
    { id: 'brave', name: 'Brave', icon: '🦁' },
    { id: 'edge', name: 'Microsoft Edge', icon: '🔵' },
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
      renderBrowserOptions(); // Re-render to update selection.
    });

    browserOptionsEl.appendChild(card);
  }
}

saveBrowserBtn?.addEventListener('click', async () => {
  await window.synkromium.saveSettings({
    browser: selectedBrowser,
    profileName: profileNameInput?.value || 'Default',
  });

  showBanner(null, 'Browser choice saved!', true);
});

// ─── Sync Now Button ────────────────────────────────────────────

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

// ─── Helper: Show a brief success/error banner ──────────────────

function showBanner(
  bannerEl: HTMLElement | null,
  message: string,
  success: boolean
): void {
  // If no specific banner element, use a temporary approach.
  // For now, use the connection result banner if it's the GitHub page.
  const target = bannerEl || connectionResult;
  if (!target) return;

  target.textContent = message;
  target.className = `result-banner ${success ? 'success' : 'error'}`;

  // Auto-hide after 3 seconds.
  setTimeout(() => {
    target.classList.add('hidden');
  }, 3000);
}

// ─── Initialize: Load everything from the main process ──────────

async function initialize(): Promise<void> {
  try {
    // Load settings.
    const settings = await window.synkromium.getSettings();
    currentSettings = settings;

    // Populate GitHub fields.
    if (githubUsernameInput) githubUsernameInput.value = (settings.githubUsername as string) || '';
    if (githubTokenInput) githubTokenInput.value = (settings.githubTokenMasked as string) || '';
    if (repoNameInput) repoNameInput.value = (settings.repoName as string) || '';

    // Populate sync settings.
    const syncOptions = settings.syncOptions as { settings: boolean; extensions: boolean; bookmarks: boolean } | undefined;
    if (syncSettingsCheck && syncOptions) syncSettingsCheck.checked = syncOptions.settings;
    if (syncExtensionsCheck && syncOptions) syncExtensionsCheck.checked = syncOptions.extensions;
    if (syncBookmarksCheck && syncOptions) syncBookmarksCheck.checked = syncOptions.bookmarks;
    if (autoSyncCheck) autoSyncCheck.checked = (settings.autoSync as boolean) ?? true;
    if (syncOnStartupCheck) syncOnStartupCheck.checked = (settings.syncOnStartup as boolean) ?? true;
    if (pollIntervalInput) pollIntervalInput.value = String(settings.pollIntervalMinutes || 15);

    // Populate browser selection.
    selectedBrowser = (settings.browser as string) || 'chrome';
    if (profileNameInput) profileNameInput.value = (settings.profileName as string) || 'Default';

    // Load device info.
    const device = await window.synkromium.getDeviceInfo();
    if (deviceNameEl) deviceNameEl.textContent = device.name;
    if (deviceIdEl) deviceIdEl.textContent = device.id;
    if (devicePlatformEl) devicePlatformEl.textContent = device.platform;

    // Load installed browsers.
    installedBrowsers = await window.synkromium.getInstalledBrowsers();

    // Render browser chips on dashboard.
    if (browserListEl) {
      browserListEl.innerHTML = '';
      const prettyNames: Record<string, string> = {
        chrome: 'Google Chrome', chromium: 'Chromium',
        brave: 'Brave', edge: 'Microsoft Edge',
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

    // Render browser selection cards.
    renderBrowserOptions();

    // Load sync status.
    const syncStatus = await window.synkromium.getSyncStatus();
    updateSyncStatus(syncStatus.status, syncStatus.message);
    updateLastSync(syncStatus.lastSyncAt);

    // Listen for real-time status updates from the main process.
    window.synkromium.onSyncStatusChanged((status, message) => {
      updateSyncStatus(status, message);
    });

  } catch (err) {
    // If IPC isn't available (testing outside Electron), show defaults.
    console.warn('IPC not available — running in standalone mode.', err);
    updateSyncStatus('idle', 'Ready (standalone mode)');
    renderBrowserOptions();
  }
}

// Fire it up!
initialize();
