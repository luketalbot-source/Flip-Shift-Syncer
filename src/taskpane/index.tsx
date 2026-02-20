// ============================================================
// Entry point — bootstraps the React app inside Office
// ============================================================

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App";
import ErrorBoundary from "./components/ErrorBoundary";

/* global document, Office, window */

// Prevent unhandled promise rejections (e.g. from Office.js context
// invalidation) from crashing the add-in with a blank screen.
window.addEventListener("unhandledrejection", (event) => {
  console.error("[Flip Shift Sync] Unhandled rejection:", event.reason);
  event.preventDefault();
});

Office.onReady(() => {
  const container = document.getElementById("root");
  if (container) {
    const root = createRoot(container);
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  }
});
