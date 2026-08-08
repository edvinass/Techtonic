import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installAudioUnlock } from "./audio/sfx";
import App from "./App";
import "./index.css";

installAudioUnlock();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
