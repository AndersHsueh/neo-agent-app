import { render } from "preact";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/panels.css";
import "./styles/boot.css";
import "./styles/app.css";
import { App } from "@/app/App.tsx";
import { lang } from "@/i18n";
import { store } from "@/state/store.ts";

const storedMotion = localStorage.getItem("neo.motion");
document.documentElement.dataset.motion =
  storedMotion ??
  (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full");
document.documentElement.dataset.scanlines = "on";
document.documentElement.dataset.grain = "on";
document.documentElement.lang = lang.value === "zh" ? "zh-Hans" : "en";

if (import.meta.env.DEV) {
  (window as unknown as { __neo: unknown }).__neo = { store, lang };
}

const root = document.getElementById("root");
if (root) render(<App />, root);
