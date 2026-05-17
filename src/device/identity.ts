/**
 * identity.ts — "Who is this computer?"
 *
 * Every device that uses Synkromium needs a unique identity so we
 * can tell them apart. This module figures out:
 * - A unique ID for this machine (generated once, saved forever)
 * - What operating system it's running
 * - A friendly name (like "Work Laptop" or "tokit-desktop")
 *
 * The identity is stored in a tiny file in the user's home directory.
 * That way, even if you uninstall and reinstall Synkromium, the device
 * keeps the same identity — no duplicate entries, no confusion.
 */

import { randomUUID } from "node:crypto";
import { hostname, platform, userInfo } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { DEVICE_ID_FILENAME } from "../config/constants.js";

// ─── Types ──────────────────────────────────────────────────────

/** Everything we need to know about this particular computer. */
export interface DeviceIdentity {
  /** A unique ID like "device-a1b2c3d4" — generated once, never changes. */
  id: string;

  /** A human-friendly name like "tokit-laptop" so you can tell devices apart. */
  name: string;

  /** Which OS this device runs: "linux", "darwin" (macOS), or "win32". */
  platform: string;

  /** When this identity was first created. */
  createdAt: string;
}

// ─── Where the identity file lives ──────────────────────────────

/**
 * We store the device identity in the user's home directory.
 * This keeps it safe from app reinstalls and project cleanups.
 */
function getIdentityFilePath(): string {
  const homeDir = userInfo().homedir;
  return join(homeDir, DEVICE_ID_FILENAME);
}

// ─── Creating a brand new identity ──────────────────────────────

/**
 * Generates a fresh identity for a device that's never been registered.
 *
 * The name is built from the computer's hostname so it's immediately
 * recognizable. If your hostname is "tokit-laptop", that's what you'll
 * see in the device list — no cryptic UUIDs in the UI.
 */
function createNewIdentity(): DeviceIdentity {
  const deviceId = `device-${randomUUID().slice(0, 8)}`;
  const friendlyName = hostname() || "unknown-device";

  const identity: DeviceIdentity = {
    id: deviceId,
    name: friendlyName,
    platform: platform(),
    createdAt: new Date().toISOString(),
  };

  return identity;
}

// ─── Saving and loading ─────────────────────────────────────────

/**
 * Saves the device identity to disk so it survives app restarts.
 * The file is plain JSON — you can open it in any text editor
 * if you're curious what's stored.
 */
function saveIdentity(identity: DeviceIdentity): void {
  const filePath = getIdentityFilePath();
  const prettyJson = JSON.stringify(identity, null, 2);
  writeFileSync(filePath, prettyJson, "utf-8");
}

/**
 * Loads a previously saved identity from disk.
 * Returns null if the file doesn't exist (meaning this is a first run).
 */
function loadIdentity(): DeviceIdentity | null {
  const filePath = getIdentityFilePath();

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as DeviceIdentity;
  } catch {
    // If the file is corrupted somehow, treat it as a fresh start.
    // Better to create a new identity than crash the app.
    return null;
  }
}

// ─── The main function everyone else calls ──────────────────────

/**
 * Gets the identity of this device.
 *
 * - If we've seen this device before, loads the saved identity.
 * - If this is the first run, creates a new identity and saves it.
 *
 * This is the only function you need to call from outside this module.
 *
 * Example:
 *   const myDevice = getOrCreateDeviceIdentity();
 *   console.log(myDevice.name); // "tokit-laptop"
 *   console.log(myDevice.id);   // "device-a1b2c3d4"
 */
export function getOrCreateDeviceIdentity(): DeviceIdentity {
  // First, check if we already have an identity saved.
  const existing = loadIdentity();

  if (existing) {
    return existing;
  }

  // Nope — this is a first run. Let's create one and save it.
  const fresh = createNewIdentity();
  saveIdentity(fresh);

  return fresh;
}
