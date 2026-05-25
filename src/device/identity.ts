import { randomUUID } from "node:crypto";
import { app } from "electron";
import { hostname, platform } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { DEVICE_ID_FILENAME } from "../config/constants.js";

export interface DeviceIdentity {
  id: string;
  name: string;
  platform: string;
  createdAt: string;
}

function getIdentityFilePath(): string {
  return join(app.getPath("userData"), DEVICE_ID_FILENAME);
}

function createNewIdentity(): DeviceIdentity {
  return {
    id: `device-${randomUUID().slice(0, 8)}`,
    name: hostname() || "unknown-device",
    platform: platform(),
    createdAt: new Date().toISOString(),
  };
}

function saveIdentity(identity: DeviceIdentity): void {
  writeFileSync(getIdentityFilePath(), JSON.stringify(identity, null, 2), "utf-8");
}

function loadIdentity(): DeviceIdentity | null {
  const filePath = getIdentityFilePath();
  if (!existsSync(filePath)) return null;

  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as DeviceIdentity;
  } catch {
    return null;
  }
}

/** Loads existing device identity or creates and persists a new one. */
export function getOrCreateDeviceIdentity(): DeviceIdentity {
  const existing = loadIdentity();
  if (existing) return existing;

  const fresh = createNewIdentity();
  saveIdentity(fresh);
  return fresh;
}
