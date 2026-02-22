import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme, getInitialTheme } from "./styles/theme";
import "./styles/globals.css";
import "./styles/app.css";

// Apply theme before first paint to avoid FOUC
applyTheme(getInitialTheme());

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
