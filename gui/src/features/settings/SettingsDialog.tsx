import { useState } from "preact/hooks";
import { Icon } from "@/components/Icon.tsx";
import { Modal } from "@/components/Modal.tsx";
import { Button, Field, Toggle } from "@/components/primitives.tsx";
import { lang, setLang, t } from "@/i18n";
import { TIER_ICONS, tierName } from "@/lib/tiers.ts";
import type { SettingsPatch, SettingsView } from "@/protocol";
import { patchSettings } from "@/state/app.ts";
import { store } from "@/state/store.ts";

type Tab = "providers" | "routes" | "classifier" | "runtime" | "memory" | "team" | "appearance";

const TABS: { key: Tab; icon: string }[] = [
  { key: "providers", icon: "chip" },
  { key: "routes", icon: "tier-swap" },
  { key: "classifier", icon: "shield" },
  { key: "runtime", icon: "terminal" },
  { key: "memory", icon: "memory" },
  { key: "team", icon: "peers" },
  { key: "appearance", icon: "eye" },
];

export function SettingsDialog() {
  const settings = store.settings.value;
  const [tab, setTab] = useState<Tab>("providers");
  const close = () => (store.overlay.value = null);

  return (
    <Modal onClose={close} initialFocus="[data-settings-close]">
      <div class="settings" role="dialog" aria-modal="true" aria-label={t("settings.title")}>
        <nav class="settings__nav">
          <div class="settings__navmark">
            <svg viewBox="0 0 24 24" role="img" aria-label="NEO">
              <title>NEO</title>
              <use href="#i-logo" />
            </svg>
            <span>SETTINGS</span>
          </div>
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              class={`settings__navitem${tab === item.key ? " is-active" : ""}`}
              onClick={() => setTab(item.key)}
            >
              <Icon name={item.icon} />
              <span>{t(`settings.tab.${item.key}` as never)}</span>
            </button>
          ))}
        </nav>
        <div class="settings__main">
          <div class="settings__head">
            <span class="settings__title">{t(`settings.tab.${tab}` as never)}</span>
            <span class="settings__subtitle">{t("settings.subtitle")}</span>
            <button
              class="iconbtn settings__close"
              type="button"
              data-settings-close
              onClick={close}
              title={t("settings.close")}
            >
              <Icon name="x" />
            </button>
          </div>
          <div class="settings__body">
            {settings ? (
              <>
                {tab === "providers" ? <Providers settings={settings} /> : null}
                {tab === "routes" ? <Routes settings={settings} /> : null}
                {tab === "classifier" ? <Classifier settings={settings} /> : null}
                {tab === "runtime" ? <Runtime settings={settings} /> : null}
                {tab === "memory" ? <Memory settings={settings} /> : null}
                {tab === "team" ? <Team settings={settings} /> : null}
                {tab === "appearance" ? <Appearance /> : null}
              </>
            ) : (
              <div class="skel" style="height:120px" />
            )}
          </div>
          <div class="settings__foot">
            <span>{t("settings.path")}</span>
            <span class="path mono">~/.neo/settings.json</span>
            <Button variant="quiet" onClick={() => (store.overlay.value = null)}>
              {t("about.close")}
            </Button>
            <Button variant="primary" onClick={() => (store.overlay.value = null)}>
              {t("settings.save")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: preact.ComponentChildren;
}) {
  return (
    <section class="group">
      <div class="group__head">
        <span class="group__title">{title}</span>
        {note ? <span class="group__note">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Providers({ settings }: { settings: SettingsView }) {
  const [open, setOpen] = useState(0);
  return (
    <>
      <div class="note">
        <Icon name="shield" />
        <span>{t("settings.masked.note")}</span>
      </div>
      {settings.providers.map((provider, index) => {
        const expanded = open === index;
        return (
          <section class={`provider${expanded ? " is-open" : ""}`} key={provider.providerName}>
            <button
              class="provider__head"
              type="button"
              onClick={() => setOpen(expanded ? -1 : index)}
            >
              <span class="provider__name">{provider.providerName}</span>
              <span class="tag">{provider.providerType}</span>
              <span class="provider__host">{new URL(provider.baseUrl).host}</span>
              {provider.isDefault ? (
                <span class="tag tag--accent">{t("settings.default")}</span>
              ) : null}
              <span class="provider__summary">
                {provider.deepReasoningModelName} · {provider.fastModelName}
              </span>
              <Icon name="chevron-right" class="icon icon--xs provider__chev" />
            </button>
            <div class="provider__body">
              <div class="fieldset">
                <Field label={t("settings.f.baseUrl")} keyName="base_url">
                  <input class="input" value={provider.baseUrl} readOnly />
                </Field>
                <Field label={t("settings.f.key")} keyName="api_key">
                  <input class="input input--masked" value={provider.apiKeyMask} readOnly />
                </Field>
                <Field label={t("settings.f.type")} keyName="provider_type">
                  <input class="input" value={provider.providerType} readOnly />
                </Field>
                <Field label={t("settings.f.ctx")} keyName="context_window">
                  <input class="input" value={provider.contextWindow} readOnly />
                </Field>
              </div>
              <div class="fieldset">
                <Field label={t("settings.f.defaultModel")} keyName="default_model_name">
                  <input class="input" value={provider.defaultModelName} readOnly />
                </Field>
                <Field label={t("settings.f.deepModel")} keyName="deep_reasoning_model_name">
                  <input class="input" value={provider.deepReasoningModelName} readOnly />
                </Field>
                <Field label={t("settings.f.balancedModel")} keyName="balanced_model_name">
                  <input class="input" value={provider.balancedModelName} readOnly />
                </Field>
                <Field label={t("settings.f.fastModel")} keyName="fast_model_name">
                  <input class="input" value={provider.fastModelName} readOnly />
                </Field>
              </div>
              <div class="row provider__foot">
                <Field label={t("settings.f.maxTokens")} keyName="max_tokens">
                  <input class="input" value={provider.maxTokens} readOnly style="width:126px" />
                </Field>
                <Field label={t("settings.f.temp")} keyName="temperature">
                  <input class="input" value={provider.temperature} readOnly style="width:126px" />
                </Field>
                <span style="flex:1" />
                <span class="mono dim" style="font-size:10px">
                  {t("settings.test")} · dummy 只读
                </span>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}

function Routes({ settings }: { settings: SettingsView }) {
  return (
    <>
      <div class="note">
        <Icon name="tier-swap" />
        <span>{t("settings.route.note")}</span>
      </div>
      <div class="panel__card" style="padding:14px">
        {settings.routes.map((route) => (
          <div
            class="row"
            style="padding:9px 0;border-bottom:1px solid var(--line-0)"
            key={route.tier}
          >
            <span class="row" style="width:120px;flex:0 0 auto;gap:7px">
              <Icon name={TIER_ICONS[route.tier]} class="icon" />
              <span class="mono" style="font-size:10.5px;color:var(--ink-2)">
                {route.tier}
              </span>
            </span>
            <span class="mono" style="width:120px;color:var(--ink-4)">
              {route.provider}
            </span>
            <input class="input grow" value={route.model} readOnly />
            {route.tier === "deep_reasoning" ? (
              <span
                class="mono"
                style="font-size:9.5px;color:var(--ink-4);width:96px;text-align:right"
              >
                {t("settings.route.fallback")}: {route.fallbackAllowed ? "on" : "off"}
              </span>
            ) : (
              <span style="width:96px" />
            )}
          </div>
        ))}
      </div>
      <Section title="default_model_tier" note={t("settings.defaultTier.hint")}>
        <div class="chips">
          {(["deep_reasoning", "balanced", "fast", "default"] as const).map((tier) => (
            <button
              key={tier}
              class={`chip${settings.defaultTier === tier ? " is-on" : ""}`}
              type="button"
              onClick={() => void patchSettings({ defaultTier: tier })}
            >
              {tierName(tier)}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

function Classifier({ settings }: { settings: SettingsView }) {
  return (
    <>
      <div class="note">
        <Icon name="shield" />
        <span>{t("settings.classifier.hint")}</span>
      </div>
      <div class="fieldset">
        <Field label={t("settings.classifier.provider")} keyName="classifier_provider">
          <select
            class="input"
            value={settings.classifierProvider}
            onChange={(event) =>
              void patchSettings({ classifierProvider: (event.target as HTMLSelectElement).value })
            }
          >
            {settings.providers.map((provider) => (
              <option value={provider.providerName} key={provider.providerName}>
                {provider.providerName}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("settings.classifier.model")} keyName="classifier_model_name">
          <input
            class="input"
            value={settings.classifierModelName}
            onChange={(event) =>
              void patchSettings({ classifierModelName: (event.target as HTMLInputElement).value })
            }
          />
        </Field>
      </div>
      <div class="panel__card" style="padding:8px 12px">
        <Toggle
          on={settings.showReasoning}
          label={t("settings.classifier.show")}
          hint={t("settings.classifier.showHint")}
          onChange={() => void patchSettings({ showReasoning: !settings.showReasoning })}
        />
        <Toggle
          on={settings.toolcallInfoDetails}
          label={t("settings.classifier.toolinfo")}
          hint={t("settings.classifier.toolinfoHint")}
          onChange={() =>
            void patchSettings({ toolcallInfoDetails: !settings.toolcallInfoDetails })
          }
        />
      </div>
    </>
  );
}

function Runtime({ settings }: { settings: SettingsView }) {
  return (
    <>
      <Section title={t("settings.runtime.title")} note={t("settings.runtime.scope")}>
        <div class="fieldset">
          <Field label={t("settings.f.compact")} keyName="compact_threshold" wide>
            <input
              class="range"
              type="range"
              min={50}
              max={90}
              step={5}
              value={Math.round(settings.compactThreshold * 100)}
              onChange={(event) =>
                void patchSettings({
                  compactThreshold: Number((event.target as HTMLInputElement).value) / 100,
                })
              }
            />
            <span class="field__hint">{t("settings.runtime.hint.compact")}</span>
          </Field>
          <Field label={t("settings.f.iter")} keyName="max_tool_iterations">
            <input class="input" value={settings.maxToolIterations} readOnly />
          </Field>
          <Field label={t("settings.f.output")} keyName="tool_output_limit">
            <input class="input" value={settings.toolOutputLimit} readOnly />
          </Field>
        </div>
      </Section>
      <Section title={t("settings.runtime.shell")} note={t("settings.runtime.hint.shell")}>
        <div class="fieldset">
          <Field label={t("settings.f.shellPath")} keyName="shell.path">
            <input
              class="input"
              value={settings.shell.path ?? ""}
              placeholder="/bin/zsh"
              readOnly
            />
          </Field>
          <Field label={t("settings.f.login")} keyName="shell.login">
            <Toggle
              on={settings.shell.login}
              label={t("settings.runtime.hint.login")}
              onChange={() => undefined}
            />
          </Field>
        </div>
      </Section>
      <Section title="retry">
        <div class="fieldset fieldset--3">
          <Field label={t("settings.f.retry")} keyName="max_attempts">
            <input class="input" value={settings.retry.maxAttempts} readOnly />
          </Field>
          <Field label={t("settings.f.connect")} keyName="connect_timeout_ms">
            <input class="input" value={settings.retry.connectTimeoutMs} readOnly />
          </Field>
          <Field label={t("settings.f.output")} keyName="stream_idle_timeout_ms">
            <input class="input" value={settings.retry.streamIdleTimeoutMs} readOnly />
          </Field>
        </div>
      </Section>
    </>
  );
}

function Memory({ settings }: { settings: SettingsView }) {
  const patch = (patchValue: NonNullable<SettingsPatch["memory"]>) =>
    void patchSettings({ memory: { ...settings.memory, ...patchValue } });
  return (
    <>
      <Section title={t("settings.memory.title")}>
        <div class="panel__card" style="padding:8px 12px">
          <Toggle
            on={settings.memory.enabled}
            label={t("settings.memory.enabled")}
            hint={t("settings.memory.hint.enabled")}
            onChange={() => patch({ enabled: !settings.memory.enabled })}
          />
          <Toggle
            on={settings.memory.autoRecall}
            label={t("settings.memory.recall")}
            hint={t("settings.memory.hint.recall")}
            onChange={() => patch({ autoRecall: !settings.memory.autoRecall })}
          />
          <Toggle
            on={settings.memory.autoCapture}
            label={t("settings.memory.capture")}
            hint={t("settings.memory.hint.capture")}
            onChange={() => patch({ autoCapture: !settings.memory.autoCapture })}
          />
        </div>
      </Section>
      <div class="fieldset">
        <Field label={t("settings.f.journal")} keyName="journal_retention_days">
          <input class="input" value={settings.memory.journalRetentionDays} readOnly />
        </Field>
        <Field label={t("settings.f.wikiDir")} keyName="user_wiki_dir">
          <input class="input" value={settings.memory.userWikiDir} readOnly />
        </Field>
      </div>
      <div class="note note--warn">
        <Icon name="alert" />
        <span>{t("settings.memory.warn")}</span>
      </div>
    </>
  );
}

function Team({ settings }: { settings: SettingsView }) {
  return (
    <>
      <Section title={t("settings.team.env")} note={t("settings.team.envHint")}>
        <div class="fieldset">
          <Field label={t("settings.f.probeTtl")} keyName="env.probe_ttl_hours">
            <input class="input" value={settings.env.probeTtlHours} readOnly />
          </Field>
          <Field label={t("settings.team.skills")} keyName="skills_extra_paths">
            <input class="input" value={JSON.stringify(settings.team.skillsExtraPaths)} readOnly />
          </Field>
        </div>
      </Section>
      <Section title={t("settings.team.cross")} note={t("settings.team.note")}>
        <div class="fieldset">
          <Field label={t("settings.f.inbound")} keyName="cross_session_inbound">
            <select
              class="input"
              value={settings.team.crossSessionInbound}
              onChange={(event) =>
                void patchSettings({
                  team: {
                    ...settings.team,
                    crossSessionInbound: (event.target as HTMLSelectElement).value as
                      | "auto"
                      | "hold"
                      | "off",
                  },
                })
              }
            >
              <option value="auto">auto</option>
              <option value="hold">hold</option>
              <option value="off">off</option>
            </select>
          </Field>
          <Field label={t("settings.f.heartbeat")} keyName="cross_session_heartbeat_ms">
            <input class="input" value={settings.team.crossSessionHeartbeatMs} readOnly />
          </Field>
          <Field label={t("settings.f.dead")} keyName="cross_session_dead_after_ms">
            <input class="input" value={settings.team.crossSessionDeadAfterMs} readOnly />
          </Field>
          <Field label={t("settings.f.watchdog")} keyName="cross_session_watchdog_interval_s">
            <input class="input" value={settings.team.crossSessionWatchdogIntervalS} readOnly />
          </Field>
        </div>
      </Section>
    </>
  );
}

function Appearance() {
  return (
    <>
      <Section title={t("settings.appearance.lang")}>
        <div class="chips">
          <button
            class={`chip${lang.value === "zh" ? " is-on" : ""}`}
            type="button"
            onClick={() => setLang("zh")}
          >
            中文
          </button>
          <button
            class={`chip${lang.value === "en" ? " is-on" : ""}`}
            type="button"
            onClick={() => setLang("en")}
          >
            English
          </button>
        </div>
        <span class="field__hint">{t("settings.appearance.hint.lang")}</span>
      </Section>
      <Section title={t("settings.appearance.motion")}>
        <div class="chips">
          <button
            class={`chip${document.documentElement.dataset.motion !== "reduced" ? " is-on" : ""}`}
            type="button"
            onClick={() => setMotion("full")}
          >
            {t("settings.appearance.motion.full")}
          </button>
          <button
            class={`chip${document.documentElement.dataset.motion === "reduced" ? " is-on" : ""}`}
            type="button"
            onClick={() => setMotion("reduced")}
          >
            {t("settings.appearance.motion.reduced")}
          </button>
        </div>
        <span class="field__hint">{t("settings.appearance.hint.motion")}</span>
      </Section>
      <Section title={t("settings.appearance.theme")}>
        <div class="chips">
          <button class="chip is-on" type="button">
            {t("settings.appearance.theme.paper")}
          </button>
        </div>
        <div class="note">
          <Icon name="eye" />
          <span>{t("settings.appearance.theme.note")}</span>
        </div>
      </Section>
    </>
  );
}

function setMotion(mode: "full" | "reduced") {
  document.documentElement.dataset.motion = mode;
  localStorage.setItem("neo.motion", mode);
}
