// ============================================================
// User Lookup Service — resolves usernames to Flip user UUIDs
// ============================================================
//
// When the spreadsheet has a "username" column but the "employee_id" is
// empty, this service calls GET /api/admin/users/v4/users?username=...
// for each unique username to find their Flip UUID, then fills in the
// missing employee IDs and writes them back to the Excel sheet.
// ============================================================

import { SyncConfig, SheetRow, ValidationWarning } from "../types";
import { fetchUserByUsername } from "./flipApiService";
import { writeEmployeeIds } from "./excelService";

export interface UserLookupResult {
  /** Rows with employee_id populated where possible */
  rows: SheetRow[];
  /** Warnings for unresolvable usernames */
  warnings: ValidationWarning[];
  /** Number of employee IDs successfully resolved */
  lookupCount: number;
}

/**
 * For rows missing employee_id but having a username, look up the Flip
 * user UUID via the Users API and populate it in both memory and the
 * Excel sheet.
 *
 * Uses per-username queries (GET /api/admin/users/v4/users?username=...)
 * with deduplication so each unique username is only queried once.
 *
 * @param rows - Sheet rows from readShiftData()
 * @param config - Flip API config (for auth + base URL)
 * @param sheetName - Name of the active worksheet (for write-back)
 * @param employeeIdColIndex - 0-based column index of the employee_id column
 */
export async function resolveEmployeeIds(
  rows: SheetRow[],
  config: SyncConfig,
  sheetName: string,
  employeeIdColIndex: number
): Promise<UserLookupResult> {
  const warnings: ValidationWarning[] = [];

  // Find rows that need lookup
  const needsLookup = rows.filter((r) => !r.employee_id && r.username);
  if (needsLookup.length === 0) {
    return { rows, warnings, lookupCount: 0 };
  }

  // Collect unique usernames to avoid duplicate API calls
  const uniqueUsernames = [...new Set(needsLookup.map((r) => r.username!.toLowerCase()))];

  // Look up each unique username and cache the result
  const usernameToId = new Map<string, string>();

  for (const username of uniqueUsernames) {
    try {
      const user = await fetchUserByUsername(config, username);
      if (user && user.id) {
        usernameToId.set(username, user.id);
      }
    } catch (error) {
      warnings.push({
        row: 0,
        column: "employee_id",
        message: `Failed to look up username "${username}": ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // Resolve employee IDs
  let lookupCount = 0;
  const excelUpdates: Array<{ rowNumber: number; value: string }> = [];

  for (const row of rows) {
    if (!row.employee_id && row.username) {
      const flipId = usernameToId.get(row.username.toLowerCase());
      if (flipId) {
        row.employee_id = flipId;
        lookupCount++;
        excelUpdates.push({ rowNumber: row._rowNumber, value: flipId });
      } else {
        warnings.push({
          row: row._rowNumber,
          column: "username",
          message: `No Flip user found for username "${row.username}"`,
        });
      }
    }
  }

  // Write resolved IDs back to the Excel sheet
  if (excelUpdates.length > 0) {
    try {
      await writeEmployeeIds(sheetName, employeeIdColIndex, excelUpdates);
    } catch (error) {
      warnings.push({
        row: 0,
        column: "employee_id",
        message: `Resolved ${lookupCount} user(s) but failed to write back to Excel: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { rows, warnings, lookupCount };
}
