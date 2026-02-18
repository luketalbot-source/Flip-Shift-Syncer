// ============================================================
// SyncControls Component — main action area
// ============================================================

import React from "react";
import {
  Button,
  makeStyles,
  tokens,
  Switch,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from "@fluentui/react-components";
import {
  DocumentTableSearch24Regular,
  DocumentAdd24Regular,
  ArrowSync24Regular,
  Dismiss24Regular,
} from "@fluentui/react-icons";
import { ExportStep } from "../types";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  buttonRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  options: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "8px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  warning: {
    marginTop: "4px",
  },
});

interface SyncControlsProps {
  step: ExportStep;
  hasData: boolean;
  configValid: boolean;
  notificationsEnabled: boolean;
  onNotificationsChange: (enabled: boolean) => void;
  onReadSheet: () => void;
  onSync: () => void;
  onCancel: () => void;
  onGenerateTemplate: () => void;
}

const SyncControls: React.FC<SyncControlsProps> = ({
  step,
  hasData,
  configValid,
  notificationsEnabled,
  onNotificationsChange,
  onReadSheet,
  onSync,
  onCancel,
  onGenerateTemplate,
}) => {
  const styles = useStyles();
  const isBusy = ["reading", "starting_sync", "sending_shifts", "completing", "validating"].includes(step);
  const canSync = hasData && configValid && !isBusy;
  const canCancel = ["starting_sync", "sending_shifts"].includes(step);
  const canRead = !isBusy;

  return (
    <div className={styles.container}>
      {!configValid && (
        <MessageBar intent="warning">
          <MessageBarBody>
            <MessageBarTitle>Not configured</MessageBarTitle>
            Go to the Settings tab to configure your Flip API connection.
          </MessageBarBody>
        </MessageBar>
      )}

      {/* Options */}
      <div className={styles.options}>
        <Switch
          label="Send notifications to users"
          checked={notificationsEnabled}
          onChange={(_e, data) => onNotificationsChange(data.checked)}
          disabled={isBusy}
        />
      </div>

      {/* Action buttons */}
      <div className={styles.buttonRow}>
        <Button
          appearance="secondary"
          icon={<DocumentAdd24Regular />}
          onClick={onGenerateTemplate}
          disabled={isBusy}
        >
          Generate Template
        </Button>

        <Button
          appearance="secondary"
          icon={<DocumentTableSearch24Regular />}
          onClick={onReadSheet}
          disabled={!canRead}
        >
          {step === "reading" ? "Reading..." : "Read Sheet"}
        </Button>

        <Button
          appearance="primary"
          icon={<ArrowSync24Regular />}
          onClick={onSync}
          disabled={!canSync}
        >
          Sync to Flip
        </Button>

        {canCancel && (
          <Button
            appearance="secondary"
            icon={<Dismiss24Regular />}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>

      {/* Warning about data replacement */}
      {hasData && configValid && !isBusy && (
        <div className={styles.warning}>
          <MessageBar intent="warning">
            <MessageBarBody>
              Completing a sync <strong>replaces all previously synced shift data</strong> in the sync scope.
              Make sure this sheet contains the complete dataset.
            </MessageBarBody>
          </MessageBar>
        </div>
      )}
    </div>
  );
};

export default SyncControls;
