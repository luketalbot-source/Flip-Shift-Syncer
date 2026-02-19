// ============================================================
// DateRangePicker Component — date range selector with stats
// ============================================================

import React from "react";
import {
  Input,
  Field,
  makeStyles,
  tokens,
  Badge,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import { DateRange } from "../types";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
  },
  dateRow: {
    display: "flex",
    gap: "8px",
    alignItems: "end",
  },
  dateField: {
    flex: 1,
    minWidth: "120px",
  },
  statsRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginTop: "4px",
  },
});

interface DateRangePickerProps {
  /** Current date range selection */
  range: DateRange;
  /** Called when the user changes either date */
  onChange: (range: DateRange) => void;
  /** Total shifts in the sheet */
  totalShifts: number;
  /** Shifts that fall within the current range */
  shiftsInRange: number;
  /** Number of unique employees affected by the range */
  employeesAffected: number;
  /** Whether the controls should be disabled */
  disabled?: boolean;
  /** Validation error message */
  validationError?: string | null;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  range,
  onChange,
  totalShifts,
  shiftsInRange,
  employeesAffected,
  disabled,
  validationError,
}) => {
  const styles = useStyles();

  return (
    <div className={styles.container}>
      <div className={styles.label}>Date Range</div>

      <div className={styles.dateRow}>
        <div className={styles.dateField}>
          <Field label="From" size="small">
            <Input
              type="date"
              value={range.from}
              onChange={(_e, data) => onChange({ ...range, from: data.value })}
              disabled={disabled}
              size="small"
            />
          </Field>
        </div>
        <div className={styles.dateField}>
          <Field label="To" size="small">
            <Input
              type="date"
              value={range.to}
              onChange={(_e, data) => onChange({ ...range, to: data.value })}
              disabled={disabled}
              size="small"
            />
          </Field>
        </div>
      </div>

      {/* Stats badges */}
      <div className={styles.statsRow}>
        <Badge appearance="tint" color="brand">
          {shiftsInRange} of {totalShifts} shifts in range
        </Badge>
        <Badge appearance="tint" color="informative">
          {employeesAffected} employee{employeesAffected !== 1 ? "s" : ""} to sync
        </Badge>
      </div>

      {/* Validation error */}
      {validationError && (
        <MessageBar intent="error">
          <MessageBarBody>{validationError}</MessageBarBody>
        </MessageBar>
      )}

      {/* Info about per-user sync behavior */}
      <MessageBar intent="info">
        <MessageBarBody>
          Employees with shifts in this range will have <strong>all</strong> their shifts from the
          sheet synced to Flip. Employees outside this range won't be affected.
        </MessageBarBody>
      </MessageBar>
    </div>
  );
};

export default DateRangePicker;
