// ============================================================
// Auth Service — OAuth 2.0 Client Credentials token management
// ============================================================
//
// Flip uses OAuth 2.0 Client Credentials Grant via a Keycloak-based
// token endpoint. This service obtains, caches, and auto-refreshes
// access tokens.
//
// Token endpoint pattern:
//   POST https://$DOMAIN/auth/realms/$ORGANIZATION/protocol/openid-connect/token
//   Content-Type: application/x-www-form-urlencoded
//   Body: grant_type=client_credentials&client_id=...&client_secret=...
//
// Docs: https://www.getflip.dev/api-docs/docs/api-authentication
// ============================================================

import { SyncConfig } from "../types";

/** In-memory token cache */
interface CachedToken {
  accessToken: string;
  /** Timestamp (ms) at which this token should be considered expired */
  expiresAt: number;
  /** Config fingerprint — so we invalidate when credentials change */
  configKey: string;
}

/** Buffer in ms before actual expiry to trigger a refresh (60 seconds) */
const EXPIRY_BUFFER_MS = 60_000;

let cachedToken: CachedToken | null = null;

/**
 * Build a simple fingerprint of the config to detect credential changes.
 */
function configKey(config: SyncConfig): string {
  return `${config.baseUrl}|${config.organization}|${config.clientId}`;
}

/**
 * Build the token endpoint URL for the given config.
 *  - If proxyUrl is configured (hosted deployment): route through Cloudflare Worker
 *  - If running on localhost (dev): route through webpack dev server proxy
 *  - Otherwise: attempt direct call (may fail with CORS)
 */
function buildTokenUrl(config: SyncConfig): string {
  const org = encodeURIComponent(config.organization.trim());
  const path = `/auth/realms/${org}/protocol/openid-connect/token`;
  if (config.proxyUrl) {
    return `${config.proxyUrl.replace(/\/+$/, "")}${path}`;
  }
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `/proxy${path}`;
  }
  return `${config.baseUrl.replace(/\/+$/, "")}${path}`;
}

/**
 * Fetch a new access token from the Flip/Keycloak token endpoint.
 */
async function fetchToken(config: SyncConfig): Promise<{ accessToken: string; expiresIn: number }> {
  const tokenUrl = buildTokenUrl(config);

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId.trim(),
    client_secret: config.clientSecret.trim(),
  });

  const target = config.baseUrl.replace(/\/+$/, "");

  // Build headers — include X-Proxy-Target only when routing through a proxy
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (config.proxyUrl || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    headers["X-Proxy-Target"] = target;
  }

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers,
      body: body.toString(),
    });
  } catch (err) {
    throw new Error(
      `Failed to connect to auth server. Check the Base URL.\n\n` +
        `Target: ${target}\n` +
        `Error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    let detail = "";
    try {
      const text = await response.text();
      const json = JSON.parse(text);
      detail = json.error_description || json.error || text;
    } catch {
      detail = `HTTP ${response.status}`;
    }

    if (response.status === 401 || response.status === 400) {
      throw new Error(
        `Authentication failed: ${detail}\n\nCheck your Client ID and Client Secret.`
      );
    }
    if (response.status === 404) {
      throw new Error(
        `Token endpoint not found (404). Check your Base URL and Organization.\n\n` +
          `Tried: ${tokenUrl}`
      );
    }
    throw new Error(`Token request failed (HTTP ${response.status}): ${detail}`);
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error("Token response did not contain an access_token.");
  }

  return {
    accessToken: data.access_token as string,
    expiresIn: (data.expires_in as number) || 900, // default 15 minutes if missing
  };
}

/**
 * Get a valid access token for the given config.
 *
 * Returns a cached token if still valid, otherwise fetches a new one.
 * This is the main entry point used by flipApiService before each request.
 */
export async function getAccessToken(config: SyncConfig): Promise<string> {
  const key = configKey(config);

  // Check if we have a valid cached token for these credentials
  if (
    cachedToken &&
    cachedToken.configKey === key &&
    cachedToken.expiresAt > Date.now()
  ) {
    return cachedToken.accessToken;
  }

  // Fetch a new token
  const { accessToken, expiresIn } = await fetchToken(config);

  // Cache it with an expiry buffer
  cachedToken = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000 - EXPIRY_BUFFER_MS,
    configKey: key,
  };

  return accessToken;
}

/**
 * Clear the cached token. Useful when the user changes credentials
 * or wants to force re-authentication (e.g. "Test Connection" button).
 */
export function clearTokenCache(): void {
  cachedToken = null;
}
