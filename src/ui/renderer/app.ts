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
const pushNowBtn = document.getElementById('btn-push-now');
const pullNowBtn = document.getElementById('btn-pull-now');
const sidebarStatusDot = document.getElementById('sidebar-status-dot');
const sidebarStatusText = document.getElementById('sidebar-status-text');

// OAuth DOM references
const oauthIdleEl = document.getElementById('oauth-idle');
const oauthAwaitingEl = document.getElementById('oauth-awaiting');
const oauthSuccessEl = document.getElementById('oauth-success');
const oauthErrorEl = document.getElementById('oauth-error');
const oauthUserCodeEl = document.getElementById('oauth-user-code');
const oauthUsernameEl = document.getElementById('oauth-username');
const oauthErrorMsgEl = document.getElementById('oauth-error-msg');
const btnOAuthStart = document.getElementById('btn-oauth-start');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnOAuthDisconnect = document.getElementById('btn-oauth-disconnect');
const btnOAuthRetry = document.getElementById('btn-oauth-retry');

// PAT / repo DOM references
const githubUsernameInput = document.getElementById('github-username') as HTMLInputElement;
const githubTokenInput = document.getElementById('github-token') as HTMLInputElement;
const repoNameInput = document.getElementById('repo-name') as HTMLInputElement;
const toggleTokenBtn = document.getElementById('toggle-token');
const testConnectionBtn = document.getElementById('btn-test-connection');
const saveGithubBtn = document.getElementById('btn-save-github');
const connectionResult = document.getElementById('connection-result');
const savePatBtn = document.getElementById('btn-save-pat');

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

// --- OAuth UI ---

function showOAuthState(state: 'idle' | 'awaiting' | 'success' | 'error'): void {
  oauthIdleEl?.classList.toggle('hidden', state !== 'idle');
  oauthAwaitingEl?.classList.toggle('hidden', state !== 'awaiting');
  oauthSuccessEl?.classList.toggle('hidden', state !== 'success');
  oauthErrorEl?.classList.toggle('hidden', state !== 'error');
}

btnOAuthStart?.addEventListener('click', async () => {
  btnOAuthStart.classList.add('loading');
  btnOAuthStart.setAttribute('disabled', 'true');

  try {
    await window.synkromium.startOAuth();
  } catch (error: unknown) {
    showOAuthState('error');
    if (oauthErrorMsgEl) {
      oauthErrorMsgEl.textContent = `Failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  btnOAuthStart.classList.remove('loading');
  btnOAuthStart.removeAttribute('disabled');
});

btnCopyCode?.addEventListener('click', () => {
  const code = oauthUserCodeEl?.textContent || '';
  if (code && code !== '————') {
    navigator.clipboard.writeText(code);
    btnCopyCode.textContent = '✓ Copied';
    setTimeout(() => { btnCopyCode.textContent = '📋 Copy'; }, 2000);
  }
});

btnOAuthDisconnect?.addEventListener('click', async () => {
  await window.synkromium.saveSettings({
    githubToken: '',
    githubUsername: '',
    authMethod: 'oauth',
  });
  showOAuthState('idle');
});

btnOAuthRetry?.addEventListener('click', () => {
  showOAuthState('idle');
});

// Listen for OAuth status push events from main
window.synkromium.onOAuthStatus((payload) => {
  const phase = payload.phase as string;

  switch (phase) {
    case 'awaiting_user':
      showOAuthState('awaiting');
      if (oauthUserCodeEl) oauthUserCodeEl.textContent = (payload.userCode as string) || '————';
      break;

    case 'fetching_user':
      // Keep showing awaiting — we're almost done
      break;

    case 'success': {
      const username = payload.username as string;
      if (oauthUsernameEl) oauthUsernameEl.textContent = `@${username}`;
      showOAuthState('success');
      if (githubUsernameInput) githubUsernameInput.value = username;
      break;
    }

    case 'error':
      showOAuthState('error');
      if (oauthErrorMsgEl) oauthErrorMsgEl.textContent = (payload.message as string) || 'OAuth failed.';
      break;
  }
});

// --- PAT section ---

toggleTokenBtn?.addEventListener('click', () => {
  if (githubTokenInput.type === 'password') {
    githubTokenInput.type = 'text';
    toggleTokenBtn.textContent = '🙈';
  } else {
    githubTokenInput.type = 'password';
    toggleTokenBtn.textContent = '👁';
  }
});

savePatBtn?.addEventListener('click', async () => {
  const settings: Record<string, unknown> = {
    githubUsername: githubUsernameInput?.value || '',
    authMethod: 'pat',
  };

  const tokenValue = githubTokenInput?.value || '';
  if (tokenValue && !tokenValue.startsWith('•')) {
    settings.githubToken = tokenValue;
  }

  await window.synkromium.saveSettings(settings);
  showBanner(connectionResult, 'Token saved!', true);

  if (oauthUsernameEl) oauthUsernameEl.textContent = `@${githubUsernameInput?.value || ''}`;
  showOAuthState('success');
});

// --- Repo / Connection ---

testConnectionBtn?.addEventListener('click', async () => {
  if (!connectionResult) return;

  testConnectionBtn.classList.add('loading');
  testConnectionBtn.setAttribute('disabled', 'true');
  connectionResult.classList.add('hidden');

  await window.synkromium.saveSettings({
    repoName: repoNameInput?.value || '',
  });

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
  await window.synkromium.saveSettings({
    repoName: repoNameInput?.value || '',
  });
  showBanner(connectionResult, 'Settings saved!', true);
});

// --- Sync Settings ---

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

// --- Browser ---

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

// --- Dashboard ---

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

pushNowBtn?.addEventListener('click', async () => {
  if (!window.confirm("Warning: Pushing will overwrite the remote sync data with your current local browser settings. This cannot be undone. Are you sure you want to push?")) {
    return;
  }

  pushNowBtn.setAttribute('disabled', 'true');
  pushNowBtn.classList.add('loading');
  updateSyncStatus('pushing', 'Pushing local settings...');

  try {
    await window.synkromium.syncPush();
    updateSyncStatus('idle', 'Push complete!');
    updateLastSync(new Date().toISOString());
  } catch {
    updateSyncStatus('error', 'Push failed.');
  }

  pushNowBtn.removeAttribute('disabled');
  pushNowBtn.classList.remove('loading');
});

pullNowBtn?.addEventListener('click', async () => {
  if (!window.confirm("Warning: Pulling will overwrite your local browser settings with the remote ones. This cannot be undone. Are you sure you want to pull?")) {
    return;
  }

  pullNowBtn.setAttribute('disabled', 'true');
  pullNowBtn.classList.add('loading');
  updateSyncStatus('pulling', 'Pulling remote settings...');

  try {
    await window.synkromium.syncPull();
    updateSyncStatus('idle', 'Pull complete!');
    updateLastSync(new Date().toISOString());
  } catch {
    updateSyncStatus('error', 'Pull failed.');
  }

  pullNowBtn.removeAttribute('disabled');
  pullNowBtn.classList.remove('loading');
});

// --- Utilities ---

function showBanner(bannerEl: HTMLElement | null, message: string, success: boolean): void {
  const target = bannerEl || connectionResult;
  if (!target) return;

  target.textContent = message;
  target.className = `result-banner ${success ? 'success' : 'error'}`;

  setTimeout(() => { target.classList.add('hidden'); }, 3000);
}

// --- Initialize ---

async function initialize(): Promise<void> {
  try {
    const settings = await window.synkromium.getSettings();
    currentSettings = settings;

    // Repo name
    if (repoNameInput) repoNameInput.value = (settings.repoName as string) || '';

    // PAT section
    if (githubUsernameInput) githubUsernameInput.value = (settings.githubUsername as string) || '';
    if (githubTokenInput) githubTokenInput.value = (settings.githubTokenMasked as string) || '';

    // OAuth: show connected state if already authed
    const hasToken = Boolean(settings.githubToken || settings.githubTokenMasked);
    const username = settings.githubUsername as string;
    if (hasToken && username) {
      if (oauthUsernameEl) oauthUsernameEl.textContent = `@${username}`;
      showOAuthState('success');
    } else {
      showOAuthState('idle');
    }

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
