import { t } from "@/i18n";
import { formatCost, formatTokens } from "@/lib/fx.ts";
import { refreshUsage } from "@/state/app.ts";
import { store } from "@/state/store.ts";

const RANGES = [
  { key: "session", label: "usage.session" },
  { key: "day", label: "usage.day" },
  { key: "month", label: "usage.month" },
] as const;

export function UsagePanel() {
  const usage = store.usage.value;
  const range = usage?.range ?? "session";
  const totals = usage?.totals ?? {
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    costMicros: 0,
  };

  return (
    <section class="panel">
      <div class="panel__head">
        <span class="eyebrow">{t("usage.title")}</span>
        <div class="usage__tabs">
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              class={`usage__tab${range === item.key ? " is-on" : ""}`}
              onClick={() => void refreshUsage(item.key)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
      </div>
      <div class="panel__card">
        <div class="kv">
          <span>{t("usage.prompt")}</span>
          <b>{formatTokens(totals.promptTokens)}</b>
        </div>
        <div class="kv">
          <span>{t("usage.completion")}</span>
          <b>{formatTokens(totals.completionTokens)}</b>
        </div>
        <div class="kv">
          <span>{t("usage.reasoning")}</span>
          <b>{formatTokens(totals.reasoningTokens)}</b>
        </div>
        <div class="kv kv--accent">
          <span>{t("usage.cost")}</span>
          <b>{formatCost(totals.costMicros)}</b>
        </div>
        {usage && usage.records.length === 0 ? <p class="panelhint">{t("usage.empty")}</p> : null}
      </div>
    </section>
  );
}
