// ============================================================
// Flip Shift Sync — TypeScript Types
// ============================================================

// --- Flip API types ---

/** A Flip user as returned by GET /api/external/sync/v3/users */
export interface FlipUser {
  /** Flip-internal user UUID */
  id: string;
  /** Username identifier */
  username: string;
  /** External ID set by the client (may be absent for manually created users) */
  external_id?: string;
  first_name?: string;
  last_name?: string;
}

/** A single shift as expected by the Flip Integration Shifts API */
export interface FlipShift {
  /** Flip-internal shift ID. Takes precedence over external_id if provided. */
  id?: string;
  /** Flip user UUID — the employee this shift belongs to */
  employee: string;
  /** Stable identifier from the upstream system (e.g. row ID in spreadsheet) */
  external_id?: string;
  /** Shift start time */
  starts_at: { date: string }; // ISO 8601
  /** Shift end time */
  ends_at: { date: string }; // ISO 8601
  /** Free-form location label */
  location?: string;
}

/** Request body for POST /sync/start */
export interface SyncStartRequest {
  /** If provided, creates a user-scoped sync for this user only */
  user_id?: string;
  /** Whether to send notifications to affected users when sync completes */
  notifications_enabled: boolean;
}

/** Response from POST /sync/start */
export interface SyncStartResponse {
  sync_id: string;
  created_at: string;
}

/** Request body for POST /sync/{syncId} */
export interface SyncShiftsRequest {
  shifts: FlipShift[];
}

/** Possible sync session states */
export type SyncStatus = "IN_PROGRESS" | "COMPLETING" | "COMPLETED" | "CANCELLED";

/** Response from GET /sync/{syncId} */
export interface SyncStatusResponse {
  sync_id: string;
  status: SyncStatus;
}

/** Known Flip API error codes */
export type FlipErrorCode =
  | "FEATURE_UNAVAILABLE"
  | "SYNC_ALREADY_IN_PROGRESS"
  | "SYNC_NOT_FOUND"
  | "SYNC_NOT_IN_PROGRESS";

// --- Configuration ---

/** Plugin configuration persisted to localStorage */
export interface SyncConfig {
  /** Flip tenant base URL, e.g. https://yourtenant.flip-app.com */
  baseUrl: string;
  /** Organization / System ID of the target Flip system, e.g. "mycompany" */
  organization: string;
  /** OAuth2 API Client ID */
  clientId: string;
  /** OAuth2 API Client Secret */
  clientSecret: string;
}

// --- Excel data types ---

/** Raw row data read from the Excel worksheet */
export interface SheetRow {
  /** Flip user UUID */
  employee_id: string;
  /** Username for Flip user lookup (optional — used when employee_id is empty) */
  username?: string;
  /** External ID for this shift (optional) */
  external_id?: string;
  /** Start date string, e.g. "2026-02-17" */
  start_date: string;
  /** Start time string, e.g. "08:00" */
  start_time: string;
  /** End date string, e.g. "2026-02-17" */
  end_date: string;
  /** End time string, e.g. "16:00" */
  end_time: string;
  /** Location label (optional) */
  location?: string;
  /** The original row number in Excel (1-based, for error reporting) */
  _rowNumber: number;
}

/** Column mapping — which Excel columns map to which SheetRow fields */
export interface ColumnMapping {
  employee_id: number;
  username?: number;
  external_id?: number;
  start_date: number;
  start_time: number;
  end_date: number;
  end_time: number;
  location?: number;
}

/** Result of reading and validating Excel data */
export interface SheetReadResult {
  rows: SheetRow[];
  headers: string[];
  totalRows: number;
  warnings: ValidationWarning[];
  /** Column mapping discovered from headers (used for write-back operations) */
  columnMapping: ColumnMapping;
  /** Name of the worksheet that was read */
  sheetName: string;
}

// --- Validation ---

export interface ValidationWarning {
  row: number;
  column: string;
  message: string;
}

// --- UI State ---

export type ExportStep =
  | "idle"
  | "reading"
  | "validating"
  | "starting_sync"
  | "sending_shifts"
  | "completing"
  | "done"
  | "error"
  | "cancelled";

export interface SyncProgress {
  step: ExportStep;
  message: string;
  /** Number of shifts sent so far */
  shiftsSent?: number;
  /** Total shifts to send */
  shiftsTotal?: number;
  /** Sync ID from Flip (available after start) */
  syncId?: string;
  /** Error details if step is "error" */
  error?: string;
}

/** Options for a sync run */
export interface SyncRunOptions {
  /** If set, do a user-scoped sync for this user */
  userId?: string;
  /** Send notifications to users on completion. Default: false */
  notificationsEnabled: boolean;
}
