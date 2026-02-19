// ============================================================
// Date Range Service — utilities for date-range filtering
// ============================================================

import { FlipShift, DateRange } from "../types";

/**
 * Extract just the date portion (YYYY-MM-DD) from an ISO 8601 timestamp
 * like "2026-02-17T08:00:00.000Z".
 */
export function extractDate(isoTimestamp: string): string {
  return isoTimestamp.substring(0, 10);
}

/**
 * Compute the min start date and max end date from a set of shifts.
 * Returns null if the shifts array is empty.
 */
export function computeDateRange(shifts: FlipShift[]): DateRange | null {
  if (shifts.length === 0) return null;

  let minDate = extractDate(shifts[0].starts_at.date);
  let maxDate = extractDate(shifts[0].ends_at.date);

  for (const shift of shifts) {
    const startDate = extractDate(shift.starts_at.date);
    const endDate = extractDate(shift.ends_at.date);

    if (startDate < minDate) minDate = startDate;
    if (endDate > maxDate) maxDate = endDate;
  }

  return { from: minDate, to: maxDate };
}

/**
 * Check whether a shift falls within the given date range.
 * A shift is "in range" if its start date is >= from AND <= to.
 * Uses lexicographic comparison on YYYY-MM-DD strings.
 */
export function isShiftInRange(shift: FlipShift, range: DateRange): boolean {
  const startDate = extractDate(shift.starts_at.date);
  return startDate >= range.from && startDate <= range.to;
}

/**
 * Get the set of unique employee IDs that have at least one shift
 * within the given date range.
 */
export function getAffectedEmployees(shifts: FlipShift[], range: DateRange): Set<string> {
  const affected = new Set<string>();
  for (const shift of shifts) {
    if (isShiftInRange(shift, range)) {
      affected.add(shift.employee);
    }
  }
  return affected;
}

/**
 * Group shifts by employee ID.
 * Returns a Map from employee UUID to their array of shifts.
 */
export function groupShiftsByEmployee(shifts: FlipShift[]): Map<string, FlipShift[]> {
  const groups = new Map<string, FlipShift[]>();
  for (const shift of shifts) {
    const existing = groups.get(shift.employee);
    if (existing) {
      existing.push(shift);
    } else {
      groups.set(shift.employee, [shift]);
    }
  }
  return groups;
}

/**
 * Get shifts for per-user sync: returns a Map from employee UUID to
 * ALL of their shifts from the sheet — but only for employees who have
 * at least one shift within the given date range.
 *
 * This ensures affected employees get their complete schedule synced,
 * while employees outside the date range are left untouched.
 */
export function getShiftsForPerUserSync(
  shifts: FlipShift[],
  range: DateRange
): Map<string, FlipShift[]> {
  const affected = getAffectedEmployees(shifts, range);
  const allGroups = groupShiftsByEmployee(shifts);

  const result = new Map<string, FlipShift[]>();
  for (const employeeId of affected) {
    const employeeShifts = allGroups.get(employeeId);
    if (employeeShifts) {
      result.set(employeeId, employeeShifts);
    }
  }
  return result;
}

/**
 * Count how many shifts fall within the date range (for preview display).
 */
export function countShiftsInRange(shifts: FlipShift[], range: DateRange): number {
  let count = 0;
  for (const shift of shifts) {
    if (isShiftInRange(shift, range)) {
      count++;
    }
  }
  return count;
}

/**
 * Validate a date range. Returns an error message string if invalid,
 * or null if valid.
 */
export function validateDateRange(range: DateRange): string | null {
  if (!range.from || !range.to) {
    return "Both From and To dates are required.";
  }
  if (range.from > range.to) {
    return "From date must be before or equal to To date.";
  }
  return null;
}
