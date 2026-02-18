// ============================================================
// Settings Component — API configuration panel
// ============================================================

import React, { useState, useEffect } from "react";
import {
  Input,
  Button,
  Field,
  makeStyles,
  tokens,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from "@fluentui/react-components";
import { Save24Regular, PlugConnected24Regular } from "@fluentui/react-icons";
import { SyncConfig } from "../types";
import { loadConfig, saveConfig, isConfigValid } from "../config";
import { getAccessToken, clearTokenCache } from "../services/authService";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "16px",
  },
  title: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: "4px",
  },
  subtitle: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginBottom: "12px",
  },
  buttonRow: {
    display: "flex",
    gap: "8px",
    marginTop: "8px",
  },
  sectionLabel: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    marginTop: "8px",
  },
});

interface SettingsProps {
  onConfigChange?: (config: SyncConfig) => void;
}

const Settings: React.FC<SettingsProps> = ({ onConfigChange }) => {
  const styles = useStyles();
  const [config, setConfig] = useState<SyncConfig>(() => loadConfig());
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (saved) {
      const timer = setTimeout(() => setSaved(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [saved]);

  const handleSave = () => {
    saveConfig(config);
    clearTokenCache(); // Force re-auth with new credentials
    setSaved(true);
    onConfigChange?.(config);
  };

  const handleTestConnection = async () => {
    if (!isConfigValid(config)) {
      setTestResult({
        success: false,
        message: "Please fill in all fields: Base URL, Organization, Client ID, and Client Secret.",
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    clearTokenCache(); // Always fetch a fresh token for testing

    try {
      await getAccessToken(config);
      setTestResult({
        success: true,
        message: "Connection successful! OAuth token obtained.",
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div>
        <div className={styles.title}>API Configuration</div>
        <div className={styles.subtitle}>
          Configure your Flip tenant connection using OAuth 2.0 Client Credentials
        </div>
      </div>

      <Field label="Base URL" required hint="e.g. https://yourtenant.flip-app.com">
        <Input
          value={config.baseUrl}
          onChange={(_e, data) => setConfig({ ...config, baseUrl: data.value })}
          placeholder="https://yourtenant.flip-app.com"
          type="url"
        />
      </Field>

      <Field label="Organization" required hint="System ID provided to you, e.g. mycompany">
        <Input
          value={config.organization}
          onChange={(_e, data) => setConfig({ ...config, organization: data.value })}
          placeholder="mycompany"
        />
      </Field>

      <div className={styles.sectionLabel}>API Client Credentials</div>

      <Field label="Client ID" required hint="API Client ID">
        <Input
          value={config.clientId}
          onChange={(_e, data) => setConfig({ ...config, clientId: data.value })}
          placeholder="my-api-client"
        />
      </Field>

      <Field label="Client Secret" required hint="API Client Secret">
        <Input
          value={config.clientSecret}
          onChange={(_e, data) => setConfig({ ...config, clientSecret: data.value })}
          placeholder="Enter your client secret"
          type="password"
        />
      </Field>

      <div className={styles.buttonRow}>
        <Button appearance="primary" icon={<Save24Regular />} onClick={handleSave}>
          {saved ? "Saved!" : "Save"}
        </Button>
        <Button
          appearance="secondary"
          icon={<PlugConnected24Regular />}
          onClick={handleTestConnection}
          disabled={testing}
        >
          {testing ? "Testing..." : "Test Connection"}
        </Button>
      </div>

      {testResult && (
        <MessageBar intent={testResult.success ? "success" : "error"}>
          <MessageBarBody>
            <MessageBarTitle>{testResult.success ? "Success" : "Error"}</MessageBarTitle>
            {testResult.message}
          </MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
};

export default Settings;
