// ============================================================
// App Component — main layout and workflow orchestrator
// ============================================================

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  FluentProvider,
  createLightTheme,
  makeStyles,
  tokens,
  Tab,
  TabList,
  Divider,
} from "@fluentui/react-components";
import type { BrandVariants } from "@fluentui/react-components";
import { ArrowSync24Regular, Settings24Regular } from "@fluentui/react-icons";

// Flip brand ramp built from Midnight Blue #0F2D96
// https://brand.getflip.com/
const flipBrand: BrandVariants = {
  10: "#030818",
  20: "#081640",
  30: "#0B1F5E",
  40: "#0D2677",
  50: "#0F2D96", // Flip Midnight Blue — primary
  60: "#1A3DA6",
  70: "#2B5BF0", // Flip Blue (from logo)
  80: "#4A74F2",
  90: "#6A8DF4",
  100: "#89A6F6",
  110: "#A5BBF8",
  120: "#BFD0FA",
  130: "#D6E2FC",
  140: "#E9EFFD",
  150: "#F4F7FE",
  160: "#FAFBFF",
};
const flipTheme = createLightTheme(flipBrand);
import { SyncConfig, SheetReadResult, SyncProgress as SyncProgressType, ExportStep, FlipShift } from "../types";
import { loadConfig, isConfigValid } from "../config";
import { readShiftData, generateTemplateSheet } from "../services/excelService";
import { transformToFlipShifts } from "../services/transformService";
import { executeSyncWorkflow } from "../services/syncOrchestrator";
import { resolveEmployeeIds } from "../services/userLookupService";
import Settings from "./Settings";
import SheetPreview from "./SheetPreview";
import SyncControls from "./SyncControls";
import SyncProgressComponent from "./SyncProgress";

const useStyles = makeStyles({
  root: {
    minHeight: "100vh",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    padding: "12px 16px",
    backgroundColor: "#0F2D96", // Flip Midnight Blue
    color: "#FFFFFF",
  },
  title: {
    fontSize: tokens.fontSizeBase600,
    fontWeight: tokens.fontWeightBold,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#FFFFFF",
  },
  titleIcon: {
    color: "#FFFFFF",
  },
  subtitle: {
    fontSize: tokens.fontSizeBase200,
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: "2px",
  },
  tabs: {
    marginTop: "12px",
  },
  content: {
    padding: "16px",
  },
  section: {
    marginBottom: "16px",
  },
  sectionTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: "8px",
  },
});

const App: React.FC = () => {
  const styles = useStyles();
  const [activeTab, setActiveTab] = useState<string>("sync");
  const [config, setConfig] = useState<SyncConfig>(() => loadConfig());
  const [sheetData, setSheetData] = useState<SheetReadResult | null>(null);
  const [shifts, setShifts] = useState<FlipShift[]>([]);
  const [step, setStep] = useState<ExportStep>("idle");
  const [progress, setProgress] = useState<SyncProgressType | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const configValid = isConfigValid(config);

  // Reload config when switching to sync tab
  useEffect(() => {
    if (activeTab === "sync") {
      setConfig(loadConfig());
    }
  }, [activeTab]);

  const handleConfigChange = useCallback((newConfig: SyncConfig) => {
    setConfig(newConfig);
  }, []);

  // --- Generate Template ---
  const handleGenerateTemplate = useCallback(async () => {
    try {
      const sheetName = await generateTemplateSheet();
      setProgress({
        step: "idle",
        message: `Template sheet "${sheetName}" created. Fill in your shift data and click "Read Sheet".`,
      });
    } catch (error) {
      setProgress({
        step: "error",
        message: `Failed to create template: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  // --- Read Sheet ---
  const handleReadSheet = useCallback(async () => {
    setStep("reading");
    setProgress(null);
    setSheetData(null);
    setShifts([]);

    try {
      const result = await readShiftData();

      // If config is valid and there are rows with missing employee_id but present username,
      // attempt to resolve them via the Flip Users API
      const currentConfig = loadConfig();
      const hasRowsNeedingLookup = result.rows.some((r) => !r.employee_id && r.username);

      if (isConfigValid(currentConfig) && hasRowsNeedingLookup) {
        const lookupResult = await resolveEmployeeIds(
          result.rows,
          currentConfig,
          result.sheetName,
          result.columnMapping.employee_id
        );

        // Merge lookup warnings into the sheet result
        result.warnings.push(...lookupResult.warnings);

        if (lookupResult.lookupCount > 0) {
          // Remove the earlier "Missing employee ID" warnings for rows we just resolved
          const resolvedRows = new Set(
            result.rows.filter((r) => r.employee_id && r.username).map((r) => r._rowNumber)
          );
          result.warnings = result.warnings.filter(
            (w) => !(w.column === "employee_id" && w.message.includes("Missing") && resolvedRows.has(w.row))
          );
        }
      }

      setSheetData(result);

      // Transform to Flip shifts
      const transformed = transformToFlipShifts(result.rows);
      setShifts(transformed);

      setStep("idle");
    } catch (error) {
      setStep("error");
      setProgress({
        step: "error",
        message: `Failed to read sheet: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  // --- Sync to Flip ---
  const handleSync = useCallback(async () => {
    if (!configValid || shifts.length === 0) return;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      await executeSyncWorkflow(
        config,
        shifts,
        {
          notificationsEnabled,
        },
        (p) => {
          setProgress(p);
          setStep(p.step);
        },
        abortController.signal
      );
    } catch (error) {
      // Error is already reported via the progress callback
      if (error instanceof DOMException && error.name === "AbortError") {
        // User cancelled — already handled by orchestrator
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [config, shifts, configValid, notificationsEnabled]);

  // --- Cancel ---
  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return (
    <FluentProvider theme={flipTheme}>
      <div className={styles.root}>
        {/* Branded Header */}
        <div className={styles.header}>
          <div className={styles.title}>
            <ArrowSync24Regular className={styles.titleIcon} />
            Flip Shift Sync
          </div>
          <div className={styles.subtitle}>Sync shift plans from Excel into Flip</div>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <TabList
            selectedValue={activeTab}
            onTabSelect={(_e, data) => setActiveTab(data.value as string)}
          >
            <Tab value="sync" icon={<ArrowSync24Regular />}>
              Sync
            </Tab>
            <Tab value="settings" icon={<Settings24Regular />}>
              Settings
            </Tab>
          </TabList>
        </div>

        <Divider />

        {/* Content */}
        <div className={styles.content}>
          {activeTab === "sync" && (
            <>
              {/* Controls */}
              <div className={styles.section}>
                <SyncControls
                  step={step}
                  hasData={shifts.length > 0}
                  configValid={configValid}
                  notificationsEnabled={notificationsEnabled}
                  onNotificationsChange={setNotificationsEnabled}
                  onReadSheet={handleReadSheet}
                  onSync={handleSync}
                  onCancel={handleCancel}
                  onGenerateTemplate={handleGenerateTemplate}
                />
              </div>

              {/* Sheet Preview */}
              {sheetData && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Sheet Data</div>
                  <SheetPreview data={sheetData} />
                </div>
              )}

              {/* Sync Progress */}
              {progress && step !== "idle" && step !== "reading" && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Sync Progress</div>
                  <SyncProgressComponent progress={progress} />
                </div>
              )}
            </>
          )}

          {activeTab === "settings" && <Settings onConfigChange={handleConfigChange} />}
        </div>
      </div>
    </FluentProvider>
  );
};

export default App;
