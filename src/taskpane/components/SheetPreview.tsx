// ============================================================
// SheetPreview Component — shows parsed data before syncing
// ============================================================

import React from "react";
import {
  makeStyles,
  tokens,
  MessageBar,
  MessageBarBody,
  Badge,
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
} from "@fluentui/react-components";
import { Warning24Regular } from "@fluentui/react-icons";
import { SheetReadResult } from "../types";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  statsRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  tableWrapper: {
    overflowX: "auto",
    maxHeight: "300px",
    overflowY: "auto",
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  warningList: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    maxHeight: "150px",
    overflowY: "auto",
  },
  warningItem: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorPaletteYellowForeground2,
  },
  truncated: {
    maxWidth: "120px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const MAX_PREVIEW_ROWS = 10;

interface SheetPreviewProps {
  data: SheetReadResult;
  /** Number of shifts in the active date range (omit if no date range) */
  shiftsInRange?: number;
}

const SheetPreview: React.FC<SheetPreviewProps> = ({ data, shiftsInRange }) => {
  const styles = useStyles();
  const { rows, totalRows, warnings } = data;
  const previewRows = rows.slice(0, MAX_PREVIEW_ROWS);
  const hasMore = rows.length > MAX_PREVIEW_ROWS;
  const errorWarnings = warnings.filter(
    (w) => w.message.includes("Missing") || w.message.includes("does not look like")
  );

  return (
    <div className={styles.container}>
      {/* Stats */}
      <div className={styles.statsRow}>
        <Badge appearance="filled" color="informative">
          {rows.length} valid rows
        </Badge>
        {totalRows !== rows.length && (
          <Badge appearance="tint" color="warning">
            {totalRows - rows.length} skipped
          </Badge>
        )}
        {shiftsInRange !== undefined && (
          <Badge appearance="tint" color="brand">
            {shiftsInRange} in date range
          </Badge>
        )}
        {errorWarnings.length > 0 && (
          <Badge appearance="tint" color="warning">
            {errorWarnings.length} warnings
          </Badge>
        )}
      </div>

      {/* Warnings */}
      {errorWarnings.length > 0 && (
        <div className={styles.warningList}>
          {errorWarnings.slice(0, 5).map((w, i) => (
            <div key={i} className={styles.warningItem}>
              <Warning24Regular fontSize={14} />
              <span>
                Row {w.row}, {w.column}: {w.message}
              </span>
            </div>
          ))}
          {errorWarnings.length > 5 && (
            <div className={styles.warningItem}>...and {errorWarnings.length - 5} more warnings</div>
          )}
        </div>
      )}

      {/* Data table preview */}
      {rows.length > 0 && (
        <div className={styles.tableWrapper}>
          <Table size="extra-small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Row</TableHeaderCell>
                <TableHeaderCell>Employee ID</TableHeaderCell>
                <TableHeaderCell>Start</TableHeaderCell>
                <TableHeaderCell>End</TableHeaderCell>
                <TableHeaderCell>Location</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row._rowNumber}</TableCell>
                  <TableCell>
                    <span className={styles.truncated} title={row.employee_id}>
                      {row.employee_id ? `${row.employee_id.substring(0, 8)}...` : "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {row.start_date} {row.start_time}
                  </TableCell>
                  <TableCell>
                    {row.end_date} {row.end_time}
                  </TableCell>
                  <TableCell>{row.location || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {hasMore && (
        <MessageBar intent="info">
          <MessageBarBody>
            Showing first {MAX_PREVIEW_ROWS} of {rows.length} rows
          </MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
};

export default SheetPreview;
