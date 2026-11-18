import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "@/components/Icon.tsx";
import { IconButton, Kbd } from "@/components/primitives.tsx";
import { t } from "@/i18n";
import { morphText } from "@/lib/fx.ts";
import { agentNameForTier, modeName, TIER_ICONS, TIER_KEYS, tierShort } from "@/lib/tiers.ts";
import type { PermissionMode } from "@/protocol";
import { MODES, TIERS } from "@/protocol";
import { closeSession, setMode, setTier } from "@/state/app.ts";
import { activeMeta, activeSession, store } from "@/state/store.ts";

export function Topbar() {
  const meta = activeMeta.value;
  const state = activeSession.value;
  const agent = agentNameForTier(meta?.tier ?? "balanced");
  const agentRef = useRef<HTMLSpanElement>(null);
  const [modeOpen, setModeOpen] = useState(false);
  const modeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agentRef.current && agentRef.current.textContent !== agent) {
      void morphText(agentRef.current, agent);
    }
  }, [agent]);

  useEffect(() => {
    if (!modeOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!modeRef.current?.contains(event.target as Node)) setModeOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [modeOpen]);

  const working = state?.meta.status === "working" || state?.streaming.turnActive;

  return (
    <header class="topbar">
      <div class={`agent${working ? " is-working" : ""}`}>
        <div class="agent__orb">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <use href="#i-logo" />
          </svg>
          <i class="agent__spark" />
        </div>
        <div class="agent__id">
          <span class="eyebrow">{t("topbar.agent")}</span>
          <span class="agent__name" ref={agentRef}>
            {agent}
          </span>
        </div>
      </div>

      <span class="topbar__divider" />

      <div class="sessionhead">
        <h1 class="sessionhead__title">{meta?.title ?? "—"}</h1>
        <div class="sessionhead__meta">
          <span class={`statechip`}>
            <i class={`led ${working ? "led--live" : "led--dim"}`} />
            <span>
              {state ? t(`state.${state.meta.status}`) : t(`conn.${store.connection.value}`)}
            </span>
          </span>
          <span class="mono dim">{meta ? `${meta.id} · ${meta.model}` : "—"}</span>
        </div>
      </div>

      <div class="topbar__spacer" />

      <div class="topbar__actions">
        <div class="segmented" title={t("topbar.tier")}>
          {TIERS.map((tier) => (
            <button
              key={tier}
              type="button"
              class={`seg seg--${TIER_KEYS[tier]}${meta?.tier === tier ? " is-on" : ""}`}
              title={t(`tier.${TIER_KEYS[tier]}`)}
              disabled={!meta}
              onClick={() => void setTier(tier)}
            >
              <Icon name={TIER_ICONS[tier]} />
              <span class="seg__label">{tierShort(tier)}</span>
            </button>
          ))}
        </div>

        <div class="modewrap" ref={modeRef}>
          <button
            class={`chipbtn${store.mode.value === "plan" ? " is-warn" : ""}`}
            type="button"
            title={t("topbar.mode")}
            onClick={() => setModeOpen((v) => !v)}
          >
            <Icon name="shield" />
            <span class="chipbtn__label">{modeName(store.mode.value)}</span>
            <Icon name="chevron-down" class="icon icon--xs" />
          </button>
          {modeOpen ? (
            <div class="popover" role="menu">
              <div class="popover__head">{t("topbar.mode")}</div>
              {MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  class={`popover__item${store.mode.value === mode ? " is-on" : ""}`}
                  onClick={() => {
                    setMode(mode as PermissionMode);
                    setModeOpen(false);
                  }}
                >
                  <span class="popover__item-main">
                    <span class="popover__label">{modeName(mode)}</span>
                    <span class="popover__desc">{t(`mode.${mode}.desc`)}</span>
                  </span>
                  <Icon name="check" class="icon icon--xs popover__check" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <IconButton
          icon="search"
          title={`${t("rail.palette")} ⌘K`}
          onClick={() => (store.overlay.value = "palette")}
        />
        <IconButton
          icon="x"
          title={t("topbar.closeSession")}
          dataAction="close-session"
          disabled={!meta}
          onClick={() => void closeSession()}
        />
        <IconButton
          icon="panel"
          title={t("topbar.aside")}
          active={store.asideOpen.value}
          onClick={() => (store.asideOpen.value = !store.asideOpen.value)}
        />
      </div>
    </header>
  );
}

export function ModeHint() {
  return (
    <span class="modehint">
      <Kbd>⌘K</Kbd>
      {t("rail.palette")}
    </span>
  );
}
