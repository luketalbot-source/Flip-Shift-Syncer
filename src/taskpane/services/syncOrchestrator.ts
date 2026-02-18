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
