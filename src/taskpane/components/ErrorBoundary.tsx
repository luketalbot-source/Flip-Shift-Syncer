// ============================================================
// ErrorBoundary — catches React render errors to prevent blank screen
// ============================================================

import React from "react";
import { tokens } from "@fluentui/react-components";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren<object>, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren<object>) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "24px",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          <div
            style={{
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              borderRadius: "8px",
              padding: "16px",
              marginBottom: "16px",
            }}
          >
            <strong style={{ color: "#991b1b", display: "block", marginBottom: "8px" }}>
              Something went wrong
            </strong>
            <p style={{ color: "#7f1d1d", fontSize: "13px", margin: 0 }}>
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
          </div>
          <button
            onClick={this.handleReload}
            style={{
              background: "#0F2D96",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload Add-in
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
