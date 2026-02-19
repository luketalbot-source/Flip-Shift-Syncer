// ============================================================
// Sync Orchestrator — runs the full sync lifecycle
// ============================================================

import { SyncConfig, FlipShift, SyncProgress, SyncRunOptions } from "../types";
import { startSync, sendShifts, completeSync, cancelSync, FlipApiError } from "./flipApiService";

/** Callback for progress updates during sync */
export type ProgressCallback = (progress: SyncProgress) => void;

/** Result of a successful sync run */
export interface SyncResult {
  syncId: string;
  shiftsCount: number;
  durationMs: number;
}

/**
 * Execute the complete sync workflow:
 * 1. Start sync → get sync_id
 * 2. Send shifts (in a single batch for v1)
 * 3. Complete sync
 *
 * If any step fails, attempt to cancel the sync session.
 * The `abortSignal` allows cancellation from the UI.
 */
export async function executeSyncWorkflow(
  config: SyncConfig,
  shifts: FlipShift[],
  options: SyncRunOptions,
  onProgress: ProgressCallback,
  abortSignal?: AbortSignal
): Promise<SyncResult> {
  // Guard: never start a sync with zero shifts — completing an empty sync
  // deletes ALL existing shift data in the scope!
  if (shifts.length === 0) {
    const errorMsg = "No shifts to sync. The spreadsheet has no valid data rows.";
    onProgress({ step: "error", message: errorMsg, error: errorMsg });
    throw new Error(errorMsg);
  }

  const startTime = Date.now();
  let syncId: string | undefined;

  const checkAbort = () => {
    if (abortSignal?.aborted) {
      throw new DOMException("Sync cancelled by user", "AbortError");
    }
  };

  try {
    // --- Step 1: Start sync ---
    onProgress({
      step: "starting_sync",
      message: "Starting sync session...",
    });

    checkAbort();

    const startResponse = await startSync(config, {
      userId: options.userId,
      notificationsEnabled: options.notificationsEnabled,
    });

    syncId = startResponse.sync_id;

    onProgress({
      step: "starting_sync",
      message: `Sync session started (ID: ${syncId.substring(0, 8)}...)`,
      syncId,
    });

    // --- Step 2: Send shifts ---
    checkAbort();

    onProgress({
      step: "sending_shifts",
      message: `Sending ${shifts.length} shift(s)...`,
      syncId,
      shiftsSent: 0,
      shiftsTotal: shifts.length,
    });

    // For v1, send all shifts in a single batch
    // Future: implement batching for large datasets
    await sendShifts(config, syncId, shifts);

    onProgress({
      step: "sending_shifts",
      message: `All ${shifts.length} shift(s) sent successfully`,
      syncId,
      shiftsSent: shifts.length,
      shiftsTotal: shifts.length,
    });

    // --- Step 3: Complete sync ---
    checkAbort();

    onProgress({
      step: "completing",
      message: "Completing sync session...",
      syncId,
      shiftsSent: shifts.length,
      shiftsTotal: shifts.length,
    });

    await completeSync(config, syncId);

    const durationMs = Date.now() - startTime;

    onProgress({
      step: "done",
      message: `Sync completed successfully! ${shifts.length} shift(s) synced in ${(durationMs / 1000).toFixed(1)}s`,
      syncId,
      shiftsSent: shifts.length,
      shiftsTotal: shifts.length,
    });

    return {
      syncId,
      shiftsCount: shifts.length,
      durationMs,
    };
  } catch (error) {
    // If we have a syncId and the error isn't a cancellation that we initiated,
    // try to cancel the sync session to clean up
    if (syncId && !(error instanceof DOMException && error.name === "AbortError")) {
      try {
        await cancelSync(config, syncId);
      } catch {
        // Swallow cancel errors — the original error is more important
      }
    }

    // Handle user-initiated cancellation
    if (error instanceof DOMException && error.name === "AbortError") {
      // If we have a sync in progress, cancel it on the server
      if (syncId) {
        try {
          await cancelSync(config, syncId);
        } catch {
          // Swallow
        }
      }

      onProgress({
        step: "cancelled",
        message: "Sync cancelled",
        syncId,
      });
      throw error;
    }

    // Report the error
    const errorMessage = error instanceof FlipApiError ? error.message : String(error);
    onProgress({
      step: "error",
      message: `Sync failed: ${errorMessage}`,
      syncId,
      error: errorMessage,
    });

    throw error;
  }
}

// ============================================================
// Per-User Sync Workflow — runs a user-scoped sync for each employee
// ============================================================

/** Result of a per-user sync run */
export interface PerUserSyncResult {
  /** Results for each successfully synced employee */
  employeeResults: Array<{
    employeeId: string;
    syncId: string;
    shiftsCount: number;
  }>;
  totalShifts: number;
  durationMs: number;
  employeesSynced: number;
  employeesFailed: number;
}

/**
 * Execute per-user sync workflow:
 * For each employee in the employeeShifts map, run a user-scoped sync
 * (start → send → complete) sequentially.
 *
 * Fail-forward strategy: if one employee's sync fails, cancel it and
 * continue with the next. Partial success is reported at the end.
 *
 * @param config - API configuration
 * @param employeeShifts - Map from employee UUID to their full shift array
 * @param notificationsEnabled - Whether to send Flip notifications
 * @param onProgress - Progress callback with per-employee details
 * @param abortSignal - Cancellation signal
 */
export async function executePerUserSyncWorkflow(
  config: SyncConfig,
  employeeShifts: Map<string, FlipShift[]>,
  notificationsEnabled: boolean,
  onProgress: ProgressCallback,
  abortSignal?: AbortSignal
): Promise<PerUserSyncResult> {
  const employees = Array.from(employeeShifts.entries());

  if (employees.length === 0) {
    const errorMsg = "No employees to sync.";
    onProgress({ step: "error", message: errorMsg, error: errorMsg });
    throw new Error(errorMsg);
  }

  const startTime = Date.now();
  const results: PerUserSyncResult["employeeResults"] = [];
  const failures: Array<{ employeeId: string; error: string }> = [];
  let totalShiftsSent = 0;
  const totalShiftsToSend = employees.reduce((sum, [, shifts]) => sum + shifts.length, 0);

  const checkAbort = () => {
    if (abortSignal?.aborted) {
      throw new DOMException("Sync cancelled by user", "AbortError");
    }
  };

  for (let i = 0; i < employees.length; i++) {
    const [employeeId, shifts] = employees[i];
    const label = employeeId.substring(0, 8) + "...";
    let syncId: string | undefined;

    try {
      checkAbort();

      onProgress({
        step: "syncing_users",
        message: `Syncing employee ${i + 1} of ${employees.length} (${label})`,
        currentEmployee: i + 1,
        totalEmployees: employees.length,
        shiftsSent: totalShiftsSent,
        shiftsTotal: totalShiftsToSend,
      });

      // Start user-scoped sync
      const startResponse = await startSync(config, {
        userId: employeeId,
        notificationsEnabled,
      });
      syncId = startResponse.sync_id;

      checkAbort();

      // Send all shifts for this employee
      await sendShifts(config, syncId, shifts);
      totalShiftsSent += shifts.length;

      checkAbort();

      // Complete
      await completeSync(config, syncId);

      results.push({ employeeId, syncId, shiftsCount: shifts.length });
    } catch (error) {
      // Handle user-initiated abort
      if (error instanceof DOMException && error.name === "AbortError") {
        if (syncId) {
          try {
            await cancelSync(config, syncId);
          } catch {
            // Swallow
          }
        }
        onProgress({
          step: "cancelled",
          message: `Sync cancelled after ${results.length} of ${employees.length} employee(s).`,
          currentEmployee: i + 1,
          totalEmployees: employees.length,
          shiftsSent: totalShiftsSent,
          shiftsTotal: totalShiftsToSend,
        });
        throw error;
      }

      // Non-abort error: cancel this sync session, record failure, continue
      if (syncId) {
        try {
          await cancelSync(config, syncId);
        } catch {
          // Swallow
        }
      }

      const errorMessage = error instanceof FlipApiError ? error.message : String(error);
      failures.push({ employeeId, error: errorMessage });

      onProgress({
        step: "syncing_users",
        message: `Employee ${label} failed: ${errorMessage}. Continuing...`,
        currentEmployee: i + 1,
        totalEmployees: employees.length,
        shiftsSent: totalShiftsSent,
        shiftsTotal: totalShiftsToSend,
      });
    }
  }

  const durationMs = Date.now() - startTime;
  const durationStr = (durationMs / 1000).toFixed(1);

  if (failures.length > 0 && results.length > 0) {
    // Partial success
    onProgress({
      step: "done",
      message: `Sync partially complete: ${results.length} employee(s) synced, ${failures.length} failed in ${durationStr}s.`,
      shiftsSent: totalShiftsSent,
      shiftsTotal: totalShiftsToSend,
      currentEmployee: employees.length,
      totalEmployees: employees.length,
    });
  } else if (failures.length > 0) {
    // All failed
    const errorMsg = `All ${failures.length} employee sync(s) failed.`;
    onProgress({
      step: "error",
      message: errorMsg,
      error: errorMsg,
      currentEmployee: employees.length,
      totalEmployees: employees.length,
    });
    throw new Error(errorMsg);
  } else {
    // All succeeded
    onProgress({
      step: "done",
      message: `Sync complete! ${results.length} employee(s), ${totalShiftsSent} shift(s) in ${durationStr}s.`,
      shiftsSent: totalShiftsSent,
      shiftsTotal: totalShiftsToSend,
      currentEmployee: employees.length,
      totalEmployees: employees.length,
    });
  }

  return {
    employeeResults: results,
    totalShifts: totalShiftsSent,
    durationMs,
    employeesSynced: results.length,
    employeesFailed: failures.length,
  };
}
