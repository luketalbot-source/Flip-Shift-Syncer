// ============================================================
// Entry point — bootstraps the React app inside Office
// ============================================================

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App";

/* global document, Office */

Office.onReady(() => {
  const container = document.getElementById("root");
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  }
});
