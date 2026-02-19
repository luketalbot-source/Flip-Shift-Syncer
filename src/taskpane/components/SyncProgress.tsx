// ============================================================
// SyncProgress Component — shows step-by-step sync progress
// ============================================================

import React from "react";
import { makeStyles, tokens, Spinner, MessageBar, MessageBarBody, MessageBarTitle } from "@fluentui/react-components";
import {
  CheckmarkCircle24Filled,
  Circle24Regular,
  DismissCircle24Filled,
  ArrowSync24Filled,
  Record24Regular,
} from "@fluentui/react-icons";
import { SyncProgress as SyncProgressType, ExportStep } from "../types";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "12px 0",
  },
  stepList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  step: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: tokens.fontSizeBase300,
  },
  stepActive: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
  },
  stepDone: {
    color: tokens.colorPaletteGreenForeground1,
  },
  stepPending: {
    color: tokens.colorNeutralForeground4,
  },
  stepError: {
    color: tokens.colorPaletteRedForeground1,
  },
  message: {
    marginTop: "8px",
  },
});

interface SyncProgressProps {
  progress: SyncProgressType;
}

interface StepDef {
  id: ExportStep;
  label: string;
}

const SINGLE_STEPS: StepDef[] = [
  { id: "starting_sync", label: "Start sync session" },
  { id: "sending_shifts", label: "Send shift data" },
  { id: "completing", label: "Complete sync" },
];

const PER_USER_STEPS: StepDef[] = [
  { id: "syncing_users", label: "Sync employees" },
];

function getStepIndex(step: ExportStep, steps: StepDef[]): number {
  return steps.findIndex((s) => s.id === step);
}

const SyncProgressComponent: React.FC<SyncProgressProps> = ({ progress }) => {
  const styles = useStyles();
  const isPerUser = progress.totalEmployees !== undefined;
  const STEPS = isPerUser ? PER_USER_STEPS : SINGLE_STEPS;
  const currentIndex = getStepIndex(progress.step, STEPS);
  const isDone = progress.step === "done";
  const isError = progress.step === "error";
  const isCancelled = progress.step === "cancelled";

  const getStepState = (index: number) => {
    if (isDone) return "done";
    if (isError || isCancelled) {
      if (index < currentIndex) return "done";
      if (index === currentIndex) return isError ? "error" : "cancelled";
      return "pending";
    }
    if (index < currentIndex) return "done";
    if (index === currentIndex) return "active";
    return "pending";
  };

  const renderIcon = (state: string) => {
    switch (state) {
      case "done":
        return <CheckmarkCircle24Filled className={styles.stepDone} />;
      case "active":
        return <Spinner size="tiny" />;
      case "error":
        return <DismissCircle24Filled className={styles.stepError} />;
      case "cancelled":
        return <Record24Regular className={styles.stepPending} />;
      default:
        return <Circle24Regular className={styles.stepPending} />;
    }
  };

  const getStepClass = (state: string) => {
    switch (state) {
      case "done":
        return styles.stepDone;
      case "active":
        return styles.stepActive;
      case "error":
        return styles.stepError;
      default:
        return styles.stepPending;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.stepList}>
        {STEPS.map((step, i) => {
          const state = getStepState(i);
          return (
            <div key={step.id} className={`${styles.step} ${getStepClass(state)}`}>
              {renderIcon(state)}
              <span>{step.label}</span>
              {step.id === "syncing_users" &&
                progress.totalEmployees !== undefined &&
                progress.currentEmployee !== undefined && (
                  <span>
                    ({progress.currentEmployee}/{progress.totalEmployees}
                    {progress.shiftsTotal !== undefined && progress.shiftsSent !== undefined
                      ? ` — ${progress.shiftsSent}/${progress.shiftsTotal} shifts`
                      : ""})
                  </span>
                )}
              {step.id === "sending_shifts" &&
                progress.shiftsTotal !== undefined &&
                progress.shiftsSent !== undefined && (
                  <span>
                    ({progress.shiftsSent}/{progress.shiftsTotal})
                  </span>
                )}
            </div>
          );
        })}
      </div>

      {/* Result message */}
      <div className={styles.message}>
        {isDone && (
          <MessageBar intent="success">
            <MessageBarBody>
              <MessageBarTitle>Sync Complete</MessageBarTitle>
              {progress.message}
            </MessageBarBody>
          </MessageBar>
        )}
        {isError && (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Sync Failed</MessageBarTitle>
              {progress.error || progress.message}
            </MessageBarBody>
          </MessageBar>
        )}
        {isCancelled && (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>Sync Cancelled</MessageBarTitle>
              The sync was cancelled. No changes were applied.
            </MessageBarBody>
          </MessageBar>
        )}
      </div>
    </div>
  );
};

// Suppress unused import warning for ArrowSync24Filled
void ArrowSync24Filled;

export default SyncProgressComponent;
