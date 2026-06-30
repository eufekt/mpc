import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyBrutalStyle, resolveInitialBrutalStyle } from "./lib/brutalStyle";
import { applyTheme, resolveInitialTheme } from "./lib/theme";
import { applyUiScale, resolveInitialUiScale } from "./lib/uiScale";
import "./index.css";

applyTheme(resolveInitialTheme());
applyUiScale(resolveInitialUiScale());
applyBrutalStyle(resolveInitialBrutalStyle());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
