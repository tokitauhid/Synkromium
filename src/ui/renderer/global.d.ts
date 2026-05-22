interface SynkromiumBridge {
  getSettings(): Promise<Record<string, unknown>>;
  saveSettings(settings: Record<string, unknown>): Promise<{ success: boolean; settings: Record<string, unknown> }>;
  testConnection(): Promise<{ success: boolean; message: string }>;
  startOAuth(): Promise<void>;
  onOAuthStatus(callback: (payload: Record<string, unknown>) => void): void;
  syncNow(): Promise<void>;
  syncPush(): Promise<void>;
  syncPull(): Promise<void>;
  getSyncStatus(): Promise<{ status: string; message: string; lastSyncAt: string }>;
  getDeviceInfo(): Promise<{ id: string; name: string; platform: string }>;
  getInstalledBrowsers(): Promise<string[]>;
  validateBrowserPath(customPath: string, profileName?: string): Promise<{ valid: boolean; message: string }>;
  onSyncStatusChanged(callback: (status: string, message: string) => void): void;
}

interface Window {
  synkromium: SynkromiumBridge;
}
