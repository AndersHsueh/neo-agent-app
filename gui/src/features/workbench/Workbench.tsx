/** 工作台：四区骨架 + 全局快捷键 + 覆盖层。 */
import { useEffect } from "preact/hooks";
import { ApprovalDialog } from "@/features/approval/ApprovalDialog.tsx";
import { Composer } from "@/features/composer/Composer.tsx";
import { Palette } from "@/features/palette/Palette.tsx";
import { SettingsDialog } from "@/features/settings/SettingsDialog.tsx";
import { Transcript } from "@/features/transcript/Transcript.tsx";
import { t } from "@/i18n";
import { abortTurn, answerQuestion, createSession, selectSession, setTier } from "@/state/app.ts";
import { activeSession, pendingQuestion, store } from "@/state/store.ts";
import { AboutDialog } from "./AboutDialog.tsx";
import { Aside } from "./Aside.tsx";
import { Rail } from "./Rail.tsx";
import { ShortcutsSheet } from "./ShortcutsSheet.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { Topbar } from "./Topbar.tsx";

export function Workbench() {
  const overlay = store.overlay.value;
  const connection = store.connection.value;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (mod && key === "k") {
        event.preventDefault();
        store.overlay.value = store.overlay.value === "palette" ? null : "palette";
        return;
      }
      if (mod && key === ",") {
        event.preventDefault();
        store.overlay.value = store.overlay.value === "settings" ? null : "settings";
        return;
      }
      if (mod && key === "/") {
        event.preventDefault();
        store.overlay.value = "shortcuts";
        return;
      }
      if (mod && key === "b") {
        event.preventDefault();
        store.asideOpen.value = !store.asideOpen.value;
        return;
      }
      if (mod && key === "n") {
        event.preventDefault();
        void createSession();
        return;
      }
      if (mod && ["1", "2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        const tier = {
          "1": "deep_reasoning",
          "2": "balanced",
          "3": "fast",
          "4": "default",
        } as const;
        void setTier(tier[event.key as "1" | "2" | "3" | "4"]);
        return;
      }
      if (event.altKey && /^[1-9]$/.test(event.key)) {
        const target = store.sessions.value[Number(event.key) - 1];
        if (target) void selectSession(target.id);
        return;
      }
      if (event.key === "Escape") {
        if (store.overlay.value) {
          store.overlay.value = null;
          return;
        }
        if (store.approvalView.value) {
          store.approvalView.value = null;
          return;
        }
        if (activeSession.value?.streaming.turnActive) abortTurn();
        return;
      }
      if (/^[1-9]$/.test(event.key) && !mod && !event.altKey) {
        const question = pendingQuestion.value;
        const target = (event.target as HTMLElement | null)?.tagName;
        if (question && target !== "INPUT" && target !== "TEXTAREA") {
          const option = question.options[Number(event.key) - 1];
          if (option) {
            event.preventDefault();
            void answerQuestion(question.id, option.key);
          }
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div class="app" id="app" data-aside={store.asideOpen.value ? "on" : "off"}>
        <Rail />
        <Sidebar />
        <main class="main">
          {connection !== "live" ? (
            <div class="connbar">
              <i
                class={`led ${connection === "reconnecting" ? "led--warn led--pulse" : "led--warn"}`}
              />
              <span>{t("conn.offline")}</span>
            </div>
          ) : null}
          <Topbar />
          <Transcript />
          <Composer />
        </main>
        <Aside />
      </div>

      {overlay === "palette" ? <Palette /> : null}
      {overlay === "settings" ? <SettingsDialog /> : null}
      {overlay === "shortcuts" ? <ShortcutsSheet /> : null}
      {overlay === "about" ? <AboutDialog /> : null}
      {store.approvalView.value ? <ApprovalDialog /> : null}
    </>
  );
}
