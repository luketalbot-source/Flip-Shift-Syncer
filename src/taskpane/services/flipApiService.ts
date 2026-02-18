// ============================================================
// Flip API Service — communicates with the Flip Integration Shifts API
// ============================================================

import {
  SyncConfig,
  SyncStartRequest,
  SyncStartResponse,
  SyncStatusResponse,
  FlipShift,
  FlipUser,
  FlipErrorCode,
} from "../types";
import { getAccessToken } from "./authService";

const API_PATH = "/api/hr/v4/integration/shifts/sync";

/** Custom error class for Flip API errors */
export class FlipApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode?: FlipErrorCode;
  public readonly responseBody?: string;

  constructor(message: string, statusCode: number, errorCode?: FlipErrorCode, responseBody?: string) {
    super(message);
    this.name = "FlipApiError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.responseBody = responseBody;
  }
}

/** Build the full URL for an API endpoint.
 *  - If proxyUrl is configured (hosted deployment): route through Cloudflare Worker
 *  - If running on localhost (dev): route through webpack dev server proxy
 *  - Otherwise: attempt direct call (may fail with CORS)
 */
function buildUrl(config: SyncConfig, path: string): string {
  if (config.proxyUrl) {
    return `${config.proxyUrl.replace(/\/+$/, "")}${path}`;
  }
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `/proxy${path}`;
  }
  return `${config.baseUrl.replace(/\/+$/, "")}${path}`;
}

/** Build common headers for all API requests (async — obtains/refreshes OAuth token) */
async function buildHeaders(config: SyncConfig): Promise<HeadersInit> {
  const token = await getAccessToken(config);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  // Include X-Proxy-Target when routing through a proxy (worker or dev server)
  if (config.proxyUrl || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    headers["X-Proxy-Target"] = config.baseUrl.replace(/\/+$/, "");
  }
  return headers;
}

/** Parse error response from Flip API */
async function handleErrorResponse(response: Response): Promise<never> {
  let body = "";
  let errorCode: FlipErrorCode | undefined;

  try {
    body = await response.text();
    const json = JSON.parse(body);
    errorCode = json.code || json.error_code;
  } catch {
    // body stays as text
  }

  let message: string;

  switch (response.status) {
    case 401:
      message = "Authentication failed. Please check your bearer token.";
      break;
    case 403:
      message = "Access denied. Your API client may not have the SHIFT_MANAGEMENT role.";
      break;
    case 404:
      message = "API endpoint not found. Please check the base URL.";
      break;
    case 409:
      if (errorCode === "SYNC_ALREADY_IN_PROGRESS") {
        message = "A sync is already in progress for this scope. Cancel it first or wait for it to complete.";
      } else {
        message = `Conflict: ${body}`;
      }
      break;
    default:
      message = `API request failed (HTTP ${response.status}): ${body}`;
  }

  throw new FlipApiError(message, response.status, errorCode, body);
}

// --- Public API methods ---

/**
 * Start a new sync session.
 * POST /api/hr/v4/integration/shifts/sync/start
 */
export async function startSync(
  config: SyncConfig,
  options?: { userId?: string; notificationsEnabled?: boolean }
): Promise<SyncStartResponse> {
  const body: SyncStartRequest = {
    notifications_enabled: options?.notificationsEnabled ?? false,
  };

  if (options?.userId) {
    body.user_id = options.userId;
  }

  const response = await fetch(buildUrl(config, `${API_PATH}/start`), {
    method: "POST",
    headers: await buildHeaders(config),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await handleErrorResponse(response);
  }

  return (await response.json()) as SyncStartResponse;
}

/**
 * Send a batch of shifts to an active sync session.
 * POST /api/hr/v4/integration/shifts/sync/{syncId}
 */
export async function sendShifts(config: SyncConfig, syncId: string, shifts: FlipShift[]): Promise<void> {
  const response = await fetch(buildUrl(config, `${API_PATH}/${syncId}`), {
    method: "POST",
    headers: await buildHeaders(config),
    body: JSON.stringify({ shifts }),
  });

  if (!response.ok) {
    await handleErrorResponse(response);
  }
}

/**
 * Complete (finalize) a sync session. This replaces ALL previously synced data
 * within the sync scope with the data submitted during this session.
 * POST /api/hr/v4/integration/shifts/sync/{syncId}/complete
 */
export async function completeSync(config: SyncConfig, syncId: string): Promise<void> {
  const response = await fetch(buildUrl(config, `${API_PATH}/${syncId}/complete`), {
    method: "POST",
    headers: await buildHeaders(config),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    await handleErrorResponse(response);
  }
}

/**
 * Cancel an active sync session. Discards all submitted batches.
 * POST /api/hr/v4/integration/shifts/sync/{syncId}/cancel
 */
export async function cancelSync(config: SyncConfig, syncId: string): Promise<void> {
  const response = await fetch(buildUrl(config, `${API_PATH}/${syncId}/cancel`), {
    method: "POST",
    headers: await buildHeaders(config),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    await handleErrorResponse(response);
  }
}

/**
 * Cancel a user-scoped sync for a specific user.
 * POST /api/hr/v4/integration/shifts/sync/user/{userId}/cancel
 */
export async function cancelUserSync(config: SyncConfig, userId: string): Promise<void> {
  const response = await fetch(buildUrl(config, `${API_PATH}/user/${userId}/cancel`), {
    method: "POST",
    headers: await buildHeaders(config),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    await handleErrorResponse(response);
  }
}

/**
 * Get the current status of a sync session.
 * GET /api/hr/v4/integration/shifts/sync/{syncId}
 */
export async function getSyncStatus(config: SyncConfig, syncId: string): Promise<SyncStatusResponse> {
  const response = await fetch(buildUrl(config, `${API_PATH}/${syncId}`), {
    method: "GET",
    headers: await buildHeaders(config),
  });

  if (!response.ok) {
    await handleErrorResponse(response);
  }

  return (await response.json()) as SyncStatusResponse;
}

// --- Users API (v4 Admin) ---

const USERS_API_PATH = "/api/admin/users/v4/users";

/**
 * Look up a single Flip user by their username.
 * GET /api/admin/users/v4/users?username={username}
 *
 * Returns the matching FlipUser or null if not found.
 */
export async function fetchUserByUsername(config: SyncConfig, username: string): Promise<FlipUser | null> {
  const queryParam = encodeURIComponent(username.trim());
  const response = await fetch(buildUrl(config, `${USERS_API_PATH}?username=${queryParam}`), {
    method: "GET",
    headers: await buildHeaders(config),
  });

  if (!response.ok) {
    await handleErrorResponse(response);
  }

  const data = await response.json();

  // Extract the users array — the API may return it directly or nested
  let rawUsers: Record<string, unknown>[];
  if (Array.isArray(data)) {
    rawUsers = data;
  } else if (data && Array.isArray(data.users)) {
    rawUsers = data.users;
  } else if (data && Array.isArray(data.data)) {
    rawUsers = data.data;
  } else {
    console.warn("[fetchUserByUsername] Unexpected response shape. Top-level keys:", data ? Object.keys(data) : "null");
    return null;
  }

  if (rawUsers.length === 0) {
    return null;
  }

  // Normalise — the UUID field may be "id", "user_id", "uuid", or "flipId"
  const u = rawUsers[0];
  return {
    id: String(u.id || u.user_id || u.uuid || u.flipId || ""),
    username: String(u.username || ""),
    external_id: u.external_id ? String(u.external_id) : undefined,
    first_name: u.first_name ? String(u.first_name) : undefined,
    last_name: u.last_name ? String(u.last_name) : undefined,
  };
}
