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
import * as actions from "@/state/app.ts";
import { store } from "@/state/store.ts";

const storedMotion = localStorage.getItem("neo.motion");
document.documentElement.dataset.motion =
  storedMotion ??
  (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full");
document.documentElement.dataset.scanlines = "off";
document.documentElement.dataset.grain = "off";
document.documentElement.lang = lang.value === "zh" ? "zh-Hans" : "en";

if (import.meta.env.DEV) {
  // 联调/测试钩子：只读 store + 控制器动作（e2e 用它验证没有 UI 入口的协议能力）
  (window as unknown as { __neo: unknown }).__neo = { store, lang, actions };
}

const root = document.getElementById("root");
if (root) render(<App />, root);
