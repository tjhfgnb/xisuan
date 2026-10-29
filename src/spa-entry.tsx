import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Calculator } from "./components/calculator";
import "./styles.css";

const el = document.getElementById("root");
if (!el) {
  throw new Error("missing #root");
}

try {
  createRoot(el).render(
    <StrictMode>
      <Calculator />
    </StrictMode>,
  );
} catch (err) {
  el.textContent = `載入失敗：${err instanceof Error ? err.message : String(err)}`;
}
