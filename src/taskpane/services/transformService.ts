// ============================================================
// Transform Service — converts Excel rows into Flip shift objects
// ============================================================

import { SheetRow, FlipShift } from "../types";

/**
 * Parse a time string into hours and minutes.
 * Handles: "08:00", "8:00", "08:00:00", "8:00:00", "0800"
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const t = timeStr.trim();

  // Try HH:MM or HH:MM:SS
  const colonMatch = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (colonMatch) {
    return { hours: parseInt(colonMatch[1], 10), minutes: parseInt(colonMatch[2], 10) };
  }

  // Try HHMM (e.g. "0800")
  const compactMatch = t.match(/^(\d{2})(\d{2})$/);
  if (compactMatch) {
    return { hours: parseInt(compactMatch[1], 10), minutes: parseInt(compactMatch[2], 10) };
  }

  throw new Error(`Cannot parse time: "${timeStr}"`);
}

/**
 * Combine a date string (YYYY-MM-DD) and time string (HH:MM) into an ISO 8601 timestamp.
 * Returns a UTC timestamp string.
 */
function combineDateAndTime(dateStr: string, timeStr: string): string {
  // Normalise date separators (handle / or -)
  const normDate = dateStr.replace(/\//g, "-").trim();

  // Validate date format
  const dateMatch = normDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!dateMatch) {
    throw new Error(`Cannot parse date: "${dateStr}". Expected YYYY-MM-DD format.`);
  }

  const year = dateMatch[1];
  const month = dateMatch[2].padStart(2, "0");
  const day = dateMatch[3].padStart(2, "0");

  // Parse time into hours and minutes
  const { hours, minutes } = parseTime(timeStr);
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");

  // Build clean ISO 8601 timestamp
  const iso = `${year}-${month}-${day}T${hh}:${mm}:00.000Z`;

  // Validate the result
  const parsed = new Date(iso);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date/time: "${dateStr}" + "${timeStr}" → "${iso}"`);
  }

  return iso;
}

/**
 * Generate a deterministic external_id from shift data.
 * The Flip API requires either an internal `id` or an `external_id` on every
 * shift so it can correctly identify and persist each record. When the
 * spreadsheet doesn't supply one, we derive a stable key from the employee
 * and start timestamp so repeated syncs of the same data are idempotent.
 */
function generateExternalId(employeeId: string, startsAt: string, index: number): string {
  // Use employee + start timestamp + row index for uniqueness
  // (index handles the edge case of two shifts for the same employee at the same time)
  return `excel-${employeeId}-${startsAt.replace(/[^0-9]/g, "")}-${index}`;
}

/**
 * Transform an array of SheetRow objects into FlipShift objects
 * ready for the Flip Integration Shifts API.
 *
 * Rows with missing required fields are skipped (they should have
 * already been flagged as warnings by the Excel service).
 *
 * IMPORTANT: The Flip API requires every shift to include either an internal
 * `id` or an `external_id`. If the spreadsheet row doesn't provide one, a
 * deterministic external_id is auto-generated.
 */
export function transformToFlipShifts(rows: SheetRow[]): FlipShift[] {
  const shifts: FlipShift[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Skip rows with missing required fields
    if (!row.employee_id || !row.start_date || !row.start_time || !row.end_date || !row.end_time) {
      continue;
    }

    const startsAt = combineDateAndTime(row.start_date, row.start_time);
    const endsAt = combineDateAndTime(row.end_date, row.end_time);

    const shift: FlipShift = {
      employee: row.employee_id,
      starts_at: { date: startsAt },
      ends_at: { date: endsAt },
    };

    // The Flip API requires either `id` or `external_id` on every shift.
    // Use the spreadsheet value if provided, otherwise auto-generate one.
    if (row.external_id) {
      shift.external_id = row.external_id;
    } else {
      shift.external_id = generateExternalId(row.employee_id, startsAt, i);
    }

    if (row.location) {
      shift.location = row.location;
    }

    shifts.push(shift);
  }

  return shifts;
}
