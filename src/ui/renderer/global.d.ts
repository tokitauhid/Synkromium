/**
 * global.d.ts — Type declarations for the renderer environment.
 *
 * This tells TypeScript about the `window.synkromium` bridge
 * that the preload script exposes. Without this file, TypeScript
 * would complain that `window.synkromium` doesn't exist.
 */

interface SynkromiumBridge {
  getSettings(): Promise<Record<string, unknown>>;
  saveSettings(settings: Record<string, unknown>): Promise<{ success: boolean; settings: Record<string, unknown> }>;
  testConnection(): Promise<{ success: boolean; message: string }>;
  syncNow(): Promise<void>;
  getSyncStatus(): Promise<{ status: string; message: string; lastSyncAt: string }>;
  getDeviceInfo(): Promise<{ id: string; name: string; platform: string }>;
  getInstalledBrowsers(): Promise<string[]>;
  onSyncStatusChanged(callback: (status: string, message: string) => void): void;
}

interface Window {
  synkromium: SynkromiumBridge;
}
