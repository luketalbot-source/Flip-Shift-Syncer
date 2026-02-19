// ============================================================
// Excel Service — reads shift data from the active worksheet
// ============================================================

import { SheetRow, SheetReadResult, ColumnMapping, ValidationWarning } from "../types";

/* global Excel */

/** Required column names (case-insensitive match) */
const REQUIRED_COLUMNS = ["employee_id", "start_date", "start_time", "end_date", "end_time"] as const;
/** Optional column names */
const OPTIONAL_COLUMNS = ["username", "external_id", "location"] as const;
/** All recognised column names */
const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS] as const;

/**
 * Convert an Excel date serial number to an ISO date string (YYYY-MM-DD).
 * Excel's epoch is 1900-01-01, but it incorrectly treats 1900 as a leap year,
 * so the offset from the Unix epoch is 25569 days.
 */
function excelSerialToDateString(serial: number): string {
  const utcMs = (serial - 25569) * 86400000;
  const d = new Date(utcMs);
  return d.toISOString().split("T")[0];
}

/**
 * Convert an Excel time fraction (0..1) to a time string (HH:MM).
 * e.g. 0.3333 → "08:00"
 */
function excelTimeToString(fraction: number): string {
  const totalMinutes = Math.round(fraction * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Normalise a cell value to a string.
 * Handles Excel date serials, time fractions, numbers, booleans, and strings.
 */
function normaliseCell(value: unknown, columnName: string): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  // If it's a number and the column is a date column, assume Excel serial
  if (typeof value === "number") {
    if (columnName === "start_date" || columnName === "end_date") {
      // Whole number ≥ 1 → likely a date serial
      if (value >= 1) {
        return excelSerialToDateString(value);
      }
    }
    if (columnName === "start_time" || columnName === "end_time") {
      // Fractional number between 0 and 1 → time fraction
      if (value >= 0 && value < 1) {
        return excelTimeToString(value);
      }
      // Could also be a date+time serial (e.g. 46069.333)
      if (value >= 1) {
        const fraction = value - Math.floor(value);
        return excelTimeToString(fraction);
      }
    }
    return String(value);
  }

  return String(value).trim();
}

/**
 * Discover column mapping from the header row.
 * Returns null for columns not found in the sheet.
 */
function mapColumns(headers: string[]): { mapping: ColumnMapping | null; missingRequired: string[] } {
  // Strip trailing *, normalise spaces to underscores, lowercase
  // This allows template headers like "employee_id*" to match "employee_id"
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim().replace(/\*+$/, "").trim().replace(/\s+/g, "_"));
  const mapping: Partial<ColumnMapping> = {};
  const missingRequired: string[] = [];

  for (const col of ALL_COLUMNS) {
    const idx = lowerHeaders.indexOf(col);
    if (idx !== -1) {
      (mapping as Record<string, number>)[col] = idx;
    }
  }

  for (const col of REQUIRED_COLUMNS) {
    if (mapping[col] === undefined) {
      missingRequired.push(col);
    }
  }

  if (missingRequired.length > 0) {
    return { mapping: null, missingRequired };
  }

  return { mapping: mapping as ColumnMapping, missingRequired: [] };
}

/**
 * Read shift data from the used range of the active worksheet.
 * First row is treated as headers.
 */
export async function readShiftData(): Promise<SheetReadResult> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const usedRange = sheet.getUsedRange();
    usedRange.load("values, rowCount, columnCount");
    await context.sync();

    const values = usedRange.values as unknown[][];
    if (!values || values.length < 2) {
      throw new Error("The worksheet must have at least a header row and one data row.");
    }

    const headers = values[0].map((h) => String(h ?? ""));
    const { mapping, missingRequired } = mapColumns(headers);

    if (!mapping) {
      throw new Error(
        `Missing required columns: ${missingRequired.join(", ")}.\n\n` +
          `Expected columns: employee_id, start_date, start_time, end_date, end_time.\n` +
          `Optional: username, external_id, location.`
      );
    }

    const rows: SheetRow[] = [];
    const warnings: ValidationWarning[] = [];

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const rowNumber = i + 1; // 1-based for user display

      const employee_id = normaliseCell(row[mapping.employee_id], "employee_id");
      const start_date = normaliseCell(row[mapping.start_date], "start_date");
      const start_time = normaliseCell(row[mapping.start_time], "start_time");
      const end_date = normaliseCell(row[mapping.end_date], "end_date");
      const end_time = normaliseCell(row[mapping.end_time], "end_time");

      // Read optional username (used for employee ID lookup)
      const username =
        mapping.username !== undefined ? normaliseCell(row[mapping.username], "username") : "";

      // Skip fully empty rows
      if (!employee_id && !username && !start_date && !start_time && !end_date && !end_time) {
        continue;
      }

      // Warn about missing required values
      if (!employee_id && !username) {
        warnings.push({ row: rowNumber, column: "employee_id", message: "Missing employee ID (no username for lookup either)" });
      } else if (!employee_id && username) {
        // Don't warn — will attempt lookup by username
      }
      if (!start_date) {
        warnings.push({ row: rowNumber, column: "start_date", message: "Missing start date" });
      }
      if (!start_time) {
        warnings.push({ row: rowNumber, column: "start_time", message: "Missing start time" });
      }
      if (!end_date) {
        warnings.push({ row: rowNumber, column: "end_date", message: "Missing end date" });
      }
      if (!end_time) {
        warnings.push({ row: rowNumber, column: "end_time", message: "Missing end time" });
      }

      // Validate employee_id looks like a UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (employee_id && !uuidRegex.test(employee_id)) {
        warnings.push({
          row: rowNumber,
          column: "employee_id",
          message: `"${employee_id}" does not look like a valid UUID. Flip requires user UUIDs.`,
        });
      }

      const sheetRow: SheetRow = {
        employee_id,
        start_date,
        start_time,
        end_date,
        end_time,
        _rowNumber: rowNumber,
      };

      if (username) {
        sheetRow.username = username;
      }
      if (mapping.external_id !== undefined) {
        sheetRow.external_id = normaliseCell(row[mapping.external_id], "external_id") || undefined;
      }
      if (mapping.location !== undefined) {
        sheetRow.location = normaliseCell(row[mapping.location], "location") || undefined;
      }

      rows.push(sheetRow);
    }

    // Get the sheet name for write-back operations
    sheet.load("name");
    await context.sync();

    return {
      rows,
      headers,
      totalRows: values.length - 1, // excluding header
      warnings,
      columnMapping: mapping,
      sheetName: sheet.name,
    };
  });
}

/**
 * Write employee IDs back to the Excel sheet for rows that were resolved via username lookup.
 * @param sheetName — Name of the worksheet to write to
 * @param employeeIdColIndex — 0-based column index of the employee_id column
 * @param updates — Array of { rowNumber (1-based Excel row), value (Flip user UUID) }
 */
export async function writeEmployeeIds(
  sheetName: string,
  employeeIdColIndex: number,
  updates: Array<{ rowNumber: number; value: string }>
): Promise<void> {
  if (updates.length === 0) return;

  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(sheetName);

    for (const update of updates) {
      // rowNumber is 1-based, column is 0-based
      // Excel getCell is 0-based for both row and column
      const cell = sheet.getCell(update.rowNumber - 1, employeeIdColIndex);
      cell.values = [[update.value]];
    }

    await context.sync();
  });
}

/**
 * Write auto-generated external IDs back to the Excel sheet.
 * If the sheet doesn't have an external_id column yet, one is added
 * after the last column in the used range.
 *
 * @param sheetName — Name of the worksheet to write to
 * @param externalIdColIndex — 0-based column index of the external_id column, or undefined if absent
 * @param updates — Array of { rowNumber (1-based Excel row), externalId (generated value) }
 * @param totalColumns — Total number of columns in the header row (used when adding a new column)
 */
export async function writeExternalIds(
  sheetName: string,
  externalIdColIndex: number | undefined,
  updates: Array<{ rowNumber: number; externalId: string }>,
  totalColumns: number
): Promise<void> {
  if (updates.length === 0) return;

  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(sheetName);
    let colIndex: number;

    if (externalIdColIndex !== undefined) {
      // Column already exists — write directly
      colIndex = externalIdColIndex;
    } else {
      // Add a new "external_id" header at the end of existing columns
      colIndex = totalColumns;
      const headerCell = sheet.getCell(0, colIndex);
      headerCell.values = [["external_id"]];
      headerCell.format.font.bold = true;
    }

    for (const update of updates) {
      // rowNumber is 1-based, getCell is 0-based
      const cell = sheet.getCell(update.rowNumber - 1, colIndex);
      cell.values = [[update.externalId]];
    }

    await context.sync();
  });
}

/**
 * Generate a new template worksheet with the correct column headers and a sample data row.
 * Mandatory columns are marked with an asterisk (*).
 */
export async function generateTemplateSheet(): Promise<string> {
  return Excel.run(async (context) => {
    const sheets = context.workbook.worksheets;
    sheets.load("items/name");
    await context.sync();

    // Find a unique name for the template sheet
    const existingNames = new Set(sheets.items.map((s) => s.name.toLowerCase()));
    let sheetName = "Shift Template";
    let counter = 1;
    while (existingNames.has(sheetName.toLowerCase())) {
      counter++;
      sheetName = `Shift Template ${counter}`;
    }

    // Create the new worksheet
    const newSheet = sheets.add(sheetName);

    // Headers — mandatory fields marked with *
    const headers = [
      "employee_id*",
      "username",
      "start_date*",
      "start_time*",
      "end_date*",
      "end_time*",
      "external_id",
      "location",
    ];

    // Sample data row
    const sampleRow = [
      "ad952350-1808-4c38-b847-726e73e6baa8",
      "jsmith",
      "2026-03-01",
      "08:00",
      "2026-03-01",
      "16:00",
      "shift-001",
      "Office A",
    ];

    // Write headers
    const headerRange = newSheet.getRangeByIndexes(0, 0, 1, headers.length);
    headerRange.values = [headers];
    headerRange.format.font.bold = true;
    headerRange.format.fill.color = "#0F2D96"; // Flip Midnight Blue
    headerRange.format.font.color = "#FFFFFF";

    // Write sample row
    const dataRange = newSheet.getRangeByIndexes(1, 0, 1, sampleRow.length);
    dataRange.values = [sampleRow];

    // Auto-fit columns
    const fullRange = newSheet.getRangeByIndexes(0, 0, 2, headers.length);
    fullRange.format.autofitColumns();

    // Activate the new sheet
    newSheet.activate();

    await context.sync();

    return sheetName;
  });
}
