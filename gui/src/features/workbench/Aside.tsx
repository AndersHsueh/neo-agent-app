import { Icon } from "@/components/Icon.tsx";
import { ProgressRing } from "@/components/primitives.tsx";
import { UsagePanel } from "@/features/usage/UsagePanel.tsx";
import { t } from "@/i18n";
import { formatCost } from "@/lib/fx.ts";
import { TIER_ICONS, TIER_KEYS, tierName } from "@/lib/tiers.ts";
import { logout, refreshUsage } from "@/state/app.ts";
import { activeMeta, activeSession, store } from "@/state/store.ts";

export function Aside() {
  const meta = activeMeta.value;
  const state = activeSession.value;
  const settings = store.settings.value;
  const provider = settings?.providers.find((p) => p.isDefault) ?? settings?.providers[0];
  const used = state?.context.used ?? 0;
  const limit = state?.context.limit ?? 512_000;
  const compactAt = state?.context.compactAt ?? 0.75;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const user = store.user.value;
  const lastTurn = state?.lastTurn;

  return (
    <aside class="aside" id="aside">
      <div class="aside__scroll">
        <section class="panel account">
          <div class="panel__head">
            <span class="eyebrow">{t("aside.account")}</span>
            <button class="panel__action" type="button" onClick={() => void logout()}>
              {t("login.logout")}
            </button>
          </div>
          <div class="panel__card account__card">
            <span class="account__avatar">
              {user?.displayName.slice(0, 1).toUpperCase() ?? "?"}
            </span>
            <span class="account__main">
              <span class="account__name">{user?.displayName ?? "—"}</span>
              <span class="account__mail">{user?.email ?? ""}</span>
            </span>
            <span class={`led ${store.connection.value === "live" ? "led--live" : "led--warn"}`} />
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <span class="eyebrow">{t("aside.context")}</span>
            <span class="count">{pct}%</span>
          </div>
          <div class="panel__card ctxrow">
            <ProgressRing
              pct={pct}
              label={t("aside.context")}
              compactPct={Math.round(compactAt * 100)}
            />
            <div class="ctxfacts">
              <div class="kv">
                <span>{t("aside.used")}</span>
                <b>{Math.round(used / 1000)}k</b>
              </div>
              <div class="kv">
                <span>{t("aside.limit")}</span>
                <b>{Math.round(limit / 1000)}k</b>
              </div>
              <div class="kv">
                <span>{t("aside.compactAt")}</span>
                <b>{Math.round(compactAt * 100)}%</b>
              </div>
            </div>
          </div>
        </section>

        <UsagePanel />

        <section class="panel">
          <div class="panel__head">
            <span class="eyebrow">{t("aside.provider")}</span>
            <button
              class="panel__action"
              type="button"
              onClick={() => (store.overlay.value = "settings")}
            >
              {t("settings.title")} ⌘,
            </button>
          </div>
          <div class="panel__card">
            <div class="row" style="margin-bottom:9px">
              <span class="provider__name">{provider?.providerName ?? "—"}</span>
              <span class="tag">{provider?.providerType ?? ""}</span>
              <span class="mono dim" style="margin-left:auto;font-size:9.5px">
                {provider ? new URL(provider.baseUrl).host : ""}
              </span>
            </div>
            <div class="kv" style="margin-bottom:7px">
              <span>{t("aside.model")}</span>
              <b>{meta?.model ?? "—"}</b>
            </div>
            <div class="divider" />
            <div class="panel__subhead eyebrow" style="padding:7px 0 3px">
              {t("aside.routes")}
            </div>
            {settings?.routes.map((route) => (
              <div class={`route${route.tier === meta?.tier ? " is-active" : ""}`} key={route.tier}>
                <span
                  class="route__tier"
                  style={
                    route.tier === meta?.tier
                      ? { color: `var(--tier-${TIER_KEYS[route.tier]})` }
                      : undefined
                  }
                >
                  <Icon name={TIER_ICONS[route.tier]} />
                  {tierName(route.tier)}
                </span>
                <span class="route__model">{route.model}</span>
              </div>
            ))}
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <span class="eyebrow">{t("aside.session")}</span>
          </div>
          <div class="panel__card">
            <div class="kv">
              <span>{t("aside.id")}</span>
              <b>{meta?.id ?? "—"}</b>
            </div>
            <div class="kv">
              <span>{t("aside.cwd")}</span>
              <b title={meta?.cwd}>…/neo</b>
            </div>
            <div class="kv">
              <span>{t("aside.mode")}</span>
              <b>{t(`mode.${store.mode.value}`)}</b>
            </div>
            <div class="kv">
              <span>{t("aside.classified")}</span>
              <b>llm · {settings?.classifierModelName ?? "—"}</b>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <span class="eyebrow">{t("aside.turn")}</span>
          </div>
          <div class="panel__card">
            {lastTurn ? (
              <>
                <div class="kv">
                  <span>{t("aside.duration")}</span>
                  <b>{(lastTurn.durationMs / 1000).toFixed(1)}s</b>
                </div>
                <div class="kv">
                  <span>{t("aside.tokens")}</span>
                  <b>
                    {Math.round(lastTurn.usage.promptTokens / 100) / 10}k ↑ /{" "}
                    {Math.round(lastTurn.usage.completionTokens / 100) / 10}k ↓
                  </b>
                </div>
                <div class="kv">
                  <span>{t("aside.cost")}</span>
                  <b>{formatCost(lastTurn.usage.costMicros)}</b>
                </div>
                <div class="kv">
                  <span>{t("aside.tier")}</span>
                  <b style={{ color: `var(--tier-${TIER_KEYS[lastTurn.tier]})` }}>
                    {tierName(lastTurn.tier)}
                  </b>
                </div>
              </>
            ) : (
              <div class="kv">
                <span />
                <b class="mono" style="color:var(--ink-5);font-weight:400">
                  {t("usage.empty")}
                </b>
              </div>
            )}
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <span class="eyebrow">{t("aside.memory")}</span>
            <button
              class="panel__action"
              type="button"
              onClick={() => void refreshUsage("session")}
            >
              {t("usage.refresh")}
            </button>
          </div>
          <div class="panel__card" style="padding:6px">
            <div class="linkrow">
              <Icon name="memory" />
              <span class="linkrow__label">{t("rail.memory")}</span>
              <b class="dim">—</b>
            </div>
            <div class="linkrow">
              <Icon name="wiki" />
              <span class="linkrow__label">{t("rail.wiki")}</span>
              <b class="dim">—</b>
            </div>
            <div class="linkrow">
              <Icon name="skills" />
              <span class="linkrow__label">{t("rail.skills")}</span>
              <b class="dim">—</b>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <span class="eyebrow">{t("aside.keys")}</span>
            <button
              class="panel__action"
              type="button"
              onClick={() => (store.overlay.value = "shortcuts")}
            >
              <Icon name="keyboard" class="icon icon--xs" />
            </button>
          </div>
          <div class="keys">
            <div class="keyrow">
              <span>{t("rail.palette")}</span>
              <kbd class="kbd">⌘K</kbd>
            </div>
            <div class="keyrow">
              <span>{t("composer.send")}</span>
              <kbd class="kbd">⌘↩</kbd>
            </div>
            <div class="keyrow">
              <span>{t("rail.settings")}</span>
              <kbd class="kbd">⌘,</kbd>
            </div>
            <div class="keyrow">
              <span>{t("sheet.title")}</span>
              <kbd class="kbd">⌘/</kbd>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}
