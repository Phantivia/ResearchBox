import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initPwa } from "./pwa";
import { useStorageStore } from "./store";
import "./index.css";

function Root() {
  useEffect(() => initPwa(), []);
  useEffect(() => {
    void useStorageStore.getState().init();
  }, []);

  return (
    <StrictMode>
      <App />
    </StrictMode>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
