import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "@/components/Icon.tsx";
import { lang, t } from "@/i18n";
import { pickAphorism } from "@/lib/aphorisms.ts";
import { TIER_KEYS, tierName } from "@/lib/tiers.ts";
import { abortTurn, refreshUsage, sendMessage } from "@/state/app.ts";
import { activeMeta, activeSession, pendingQuestion, store } from "@/state/store.ts";

export function Composer() {
  const [text, setText] = useState("");
  const [aphorismIndex, setAphorismIndex] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const state = activeSession.value;
  const meta = activeMeta.value;
  const busy = Boolean(state?.streaming.turnActive) || state?.meta.status === "working";
  const question = pendingQuestion.value;
  const context = state?.context;
  const pct = context ? Math.min(100, Math.round((context.used / context.limit) * 100)) : 0;

  useEffect(() => {
    const timer = setInterval(() => setAphorismIndex((i) => i + 1), 26_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  }, [text]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    if (busy) return;
    sendMessage(body);
    setText("");
    void refreshUsage("session");
  };

  const aphorism = pickAphorism(aphorismIndex);
  const quote = lang.value === "zh" ? aphorism.zh : aphorism.en;

  return (
    <div class="composer-dock">
      <div class={`composer${text.trim() ? " is-ready" : ""}${busy ? " is-working" : ""}`}>
        {question ? (
          <div class="composer__notices">
            <i class="led led--warn led--pulse" />
            <span>{t("question.keys")}</span>
          </div>
        ) : null}
        <div class="composer__editor">
          <textarea
            ref={textarea}
            id="input"
            rows={1}
            spellcheck={false}
            placeholder={t("composer.placeholder")}
            value={text}
            onInput={(event) => {
              const value = (event.target as HTMLTextAreaElement).value;
              setText(value);
              if (value === "/") {
                setText("");
                store.overlay.value = "palette";
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <div class="composer__toolbar">
          <div class="composer__tools">
            <button class="toolbtn" type="button" onClick={() => alertNotWired(t("composer.file"))}>
              <Icon name="at" class="icon icon--xs" />
              <span>{t("composer.file")}</span>
            </button>
            <button class="toolbtn" type="button" onClick={() => (store.overlay.value = "palette")}>
              <Icon name="command-key" class="icon icon--xs" />
              <span>{t("composer.command")}</span>
            </button>
            <button
              class="toolbtn"
              type="button"
              onClick={() => alertNotWired(t("composer.image"))}
            >
              <Icon name="attach" class="icon icon--xs" />
              <span>{t("composer.image")}</span>
            </button>
          </div>
          <div class="composer__submit">
            <span class="composer__hint mono">{t("composer.sendHint")}</span>
            <button
              class="sendbtn"
              type="button"
              title={busy ? t("composer.workingHint") : t("composer.send")}
              onClick={() => (busy ? abortTurn() : submit())}
            >
              <Icon name={busy ? "stop" : "send"} />
            </button>
          </div>
        </div>
        <div class="composer__bar">
          <div class="ctxbar" title={t("composer.context")}>
            <i class="ctxbar__fill" style={{ width: `${pct}%` }} />
            <b class="ctxbar__mark" />
          </div>
          <span class="mono dim" id="ctx-label">
            {pct}% · {Math.round((context?.used ?? 0) / 1000)}k /{" "}
            {Math.round((context?.limit ?? 0) / 1000)}k
          </span>
        </div>
      </div>
      <div class="underbar">
        <span class="underbar__aphorism">{quote}</span>
        <span class="underbar__hint mono">
          {meta?.model ?? "—"} · {tierName(meta?.tier ?? "balanced")} ·{" "}
          {t(`mode.${store.mode.value}`)}
        </span>
      </div>
    </div>
  );
}

function alertNotWired(label: string) {
  const event = new CustomEvent("neo:toast", { detail: { text: label, sub: "尚未接入" } });
  window.dispatchEvent(event);
}

export function composerTierVar(tier: keyof typeof TIER_KEYS): string {
  return `var(--tier-${TIER_KEYS[tier]})`;
}
