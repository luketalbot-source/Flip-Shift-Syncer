// ============================================================
// Config — persist SyncConfig to localStorage
// ============================================================

import { SyncConfig } from "./types";

const STORAGE_KEY = "flip-shift-sync-config";

const DEFAULT_CONFIG: SyncConfig = {
  baseUrl: "",
  organization: "",
  clientId: "",
  clientSecret: "",
};

/**
 * Load the saved configuration from localStorage.
 * Returns defaults if nothing is saved.
 */
export function loadConfig(): SyncConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<SyncConfig>;
      return {
        baseUrl: parsed.baseUrl ?? DEFAULT_CONFIG.baseUrl,
        organization: parsed.organization ?? DEFAULT_CONFIG.organization,
        clientId: parsed.clientId ?? DEFAULT_CONFIG.clientId,
        clientSecret: parsed.clientSecret ?? DEFAULT_CONFIG.clientSecret,
      };
    }
  } catch {
    // If parsing fails, return defaults
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save the configuration to localStorage.
 */
export function saveConfig(config: SyncConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/**
 * Check whether the configuration has the minimum required values.
 */
export function isConfigValid(config: SyncConfig): boolean {
  return (
    config.baseUrl.trim().length > 0 &&
    config.organization.trim().length > 0 &&
    config.clientId.trim().length > 0 &&
    config.clientSecret.trim().length > 0
  );
}
