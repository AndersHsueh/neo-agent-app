import { useState } from "preact/hooks";
import { Icon } from "@/components/Icon.tsx";
import { Prose } from "@/components/Prose.tsx";
import { lang, lang as langSignal, t } from "@/i18n";
import { formatCost, formatTime, formatTokens, inlineMd } from "@/lib/fx.ts";
import { TIER_ICONS, TIER_KEYS, tierName } from "@/lib/tiers.ts";
import type {
  ApprovalBlock,
  AssistantBlock,
  BannerBlock,
  ErrorBlock,
  QuestionBlock,
  ReasoningBlock,
  StatsBlock,
  TierLineBlock,
  ToolBlock,
  TranscriptBlock,
  TurnBlock,
  UserBlock,
} from "@/protocol";
import { answerQuestion, resolveApproval } from "@/state/app.ts";
import { store } from "@/state/store.ts";

export function TurnDivider({ block }: { block: TurnBlock }) {
  const label =
    langSignal.value === "zh"
      ? `第 ${String(block.n).padStart(2, "0")} 轮`
      : `TURN ${String(block.n).padStart(2, "0")}`;
  return (
    <div class="turndiv">
      <span class="turndiv__line">
        <i />
        {label} · {formatTime(block.at)}
      </span>
    </div>
  );
}

export function UserMessage({ block }: { block: UserBlock }) {
  return (
    <div class="msg msg--user">
      <div class="msg__head">
        <span class="msg__who">THE OPERATOR</span>
        <span class="msg__time">{formatTime(block.at)}</span>
      </div>
      <div class="msg__body">
        <div class="prose">
          <p>
            <span dangerouslySetInnerHTML={{ __html: inlineMd(block.text) }} />
            {block.picked ? (
              <span class="tag tag--accent" style="margin-left:6px">
                {t("question.picked")}
              </span>
            ) : null}
          </p>
        </div>
        {block.refs?.length ? (
          <div class="attachrow" style="margin-top:8px">
            {block.refs.map((ref) => (
              <span class="attach" key={ref.label}>
                <Icon name={ref.icon} class="icon icon--xs" />
                {ref.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AssistantMessage({
  block,
  streaming,
}: {
  block: AssistantBlock;
  streaming: boolean;
}) {
  const who = block.tier === "deep_reasoning" ? "MR. ANDERSSON" : "NEO";
  return (
    <div class="msg msg--assistant">
      <div class="msg__head">
        <span class="msg__sigil">
          <Icon name="logo" />
        </span>
        <span class="msg__who">{who}</span>
        <span class="msg__tier">
          <Icon name={TIER_ICONS[block.tier]} />
          {tierName(block.tier)}
        </span>
        <span class="msg__time">{formatTime(block.at)}</span>
      </div>
      <div class="msg__body">
        <Prose segments={block.segments} cursor={streaming} />
      </div>
    </div>
  );
}

export function ReasoningMessage({ block }: { block: ReasoningBlock }) {
  const [open, setOpen] = useState(!block.done);
  const live = !block.done;
  return (
    <div class="msg msg--assistant">
      <div class={`think${open ? " is-open" : ""}${live ? " is-live" : ""}`}>
        <button class="think__toggle" type="button" onClick={() => setOpen((v) => !v)}>
          <Icon name="chevron-right" class="icon icon--xs think__chev" />
          <span class="think__label">{lang.value === "zh" ? "思考" : "REASONING"}</span>
          <span class="think__meta">
            {live ? "…" : `${(block.durationMs / 1000).toFixed(1)}s`} · {block.tokens} tok
          </span>
          <span class="think__live">
            <i />
            <i />
            <i />
          </span>
        </button>
        <div class="think__body">
          <div class="prose">
            <p>{block.text}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ToolCard({ block }: { block: ToolBlock }) {
  const [open, setOpen] = useState(block.state === "error");
  const stateLabel =
    block.state === "running"
      ? lang.value === "zh"
        ? "运行中"
        : "RUNNING"
      : block.state === "ok"
        ? "OK"
        : block.state === "error"
          ? lang.value === "zh"
            ? "失败"
            : "FAILED"
          : lang.value === "zh"
            ? "已拒绝"
            : "DENIED";
  return (
    <div class="msg msg--tool">
      <div
        class={`tool${block.state === "running" ? " is-running" : ""}${block.state === "error" ? " is-error" : ""}${block.state === "denied" ? " is-denied" : ""}${open ? " is-open" : ""}`}
      >
        <button class="tool__head" type="button" onClick={() => setOpen((v) => !v)}>
          <span class="tool__icon">
            <Icon name={block.icon} />
          </span>
          <span class="tool__name">{block.name}</span>
          <span class="tool__arg">{block.arg}</span>
          <span class="tool__state">
            {stateLabel}
            <span class="tool__dur">
              {block.state === "running" ? "" : `${block.durationMs ?? 0}ms`}
            </span>
            <Icon name="chevron-right" class="icon icon--xs tool__chev" />
          </span>
        </button>
        <div class="tool__scan">
          <i />
        </div>
        <div class="tool__body">
          <pre class="tool__out">{block.output ?? ""}</pre>
          {block.foot ? (
            <div class="tool__foot">
              <Icon name="file" class="icon icon--xs" />
              <span>{block.foot}</span>
              {block.truncated ? <span>truncated</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ApprovalCard({ block }: { block: ApprovalBlock }) {
  const done = block.state !== "pending";
  return (
    <div class="msg msg--tool">
      <div class={`approve${done ? " is-done" : ""}`}>
        <div class="approve__head">
          <span class="approve__icon">
            <Icon name={block.state === "denied" ? "shield-slash" : "shield"} />
          </span>
          <span class="approve__text">
            <span class="approve__title">
              {done
                ? block.state === "denied"
                  ? t("dialog.approve.denied")
                  : t("dialog.approve.done")
                : t("dialog.approve.title")}
            </span>
            <span class="approve__desc">
              {done ? t("dialog.approve.doneDesc") : t("dialog.approve.desc")}
            </span>
            <span class="approve__path">
              {block.tool} · {block.path}
            </span>
            <span class="approve__risk">
              {done ? t("dialog.approve.doneRisk") : t("dialog.approve.risk")}
            </span>
          </span>
        </div>
        {done ? null : (
          <div class="approve__actions">
            <button
              class="btn btn--ghost"
              type="button"
              onClick={() => (store.approvalView.value = block.id)}
            >
              <Icon name="diff" class="icon icon--xs" />
              {lang.value === "zh" ? "审阅差异" : "Review diff"}
            </button>
            <button
              class="btn btn--primary"
              type="button"
              onClick={() => void resolveApproval(block.id, "allow")}
            >
              <Icon name="check" class="icon icon--xs" />
              {t("dialog.approve.accept")}
            </button>
            <button
              class="btn btn--danger"
              type="button"
              onClick={() => void resolveApproval(block.id, "deny")}
            >
              <Icon name="x" class="icon icon--xs" />
              {t("dialog.approve.reject")}
            </button>
            <span class="approve__hint">{t("dialog.approve.note")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function QuestionCard({ block }: { block: QuestionBlock }) {
  const answered = Boolean(block.answeredKey);
  return (
    <div class="msg msg--tool">
      <div class={`ask${answered ? " is-answered" : ""}`}>
        <div class="ask__head">
          <Icon name="peers" class="icon icon--sm" />
          <span class="ask__q">{block.prompt}</span>
          <span class="ask__hint">
            {answered ? `✓ ${t("question.picked")}` : t("question.keys")}
          </span>
        </div>
        <div class="ask__opts">
          {block.options.map((option) => (
            <button
              key={option.key}
              class={`ask__opt${answered && block.answeredKey === option.key ? " is-picked" : ""}`}
              type="button"
              disabled={answered}
              onClick={() => void answerQuestion(block.id, option.key)}
            >
              <span class="ask__key">{option.key}</span>
              <span class="ask__opt-main">
                <span class="ask__opt-t">{option.label}</span>
                {option.description ? <span class="ask__opt-d">{option.description}</span> : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TierLine({ block }: { block: TierLineBlock }) {
  return (
    <div class="tierline">
      <Icon name="tier-swap" class="icon icon--xs" />
      <b style={{ color: `var(--tier-${TIER_KEYS[block.from]})` }}>{tierName(block.from)}</b>
      <span class="tierline__arrow">→</span>
      <b style={{ color: `var(--tier-${TIER_KEYS[block.to]})` }}>{tierName(block.to)}</b>
      <span>{block.reason}</span>
    </div>
  );
}

export function StatsRow({ block }: { block: StatsBlock }) {
  return (
    <div class="stats">
      <span class="stat">
        <Icon name="clock" />
        <b>{(block.durationMs / 1000).toFixed(1)}s</b>
      </span>
      <span class="stat">
        <Icon name="arrow-out" />
        <b>{formatTokens(block.usage.promptTokens)}</b>
      </span>
      <span class="stat">
        <Icon name="arrow-in" />
        <b>{formatTokens(block.usage.completionTokens)}</b>
      </span>
      <span class="stat">
        <b>{block.toolCalls}</b> {lang.value === "zh" ? "次工具" : "calls"}
      </span>
      <span class="stat">
        <b>{formatCost(block.usage.costMicros)}</b>
      </span>
    </div>
  );
}

export function BannerRow({ block }: { block: BannerBlock | ErrorBlock }) {
  const isError = block.kind === "error";
  return (
    <div class={`banner${isError ? " banner--error" : ""}`}>
      <Icon name="alert" />
      <span>
        {isError ? (
          <>
            {block.message} <span class="mono dim">({block.code})</span>
          </>
        ) : (
          block.text
        )}
      </span>
    </div>
  );
}

export function renderBlock(block: TranscriptBlock, opts: { streamingAssistantId?: string }) {
  switch (block.kind) {
    case "turn":
      return <TurnDivider block={block} />;
    case "user":
      return <UserMessage block={block} />;
    case "assistant":
      return <AssistantMessage block={block} streaming={block.id === opts.streamingAssistantId} />;
    case "reasoning":
      return <ReasoningMessage block={block} />;
    case "tool":
      return <ToolCard block={block} />;
    case "approval":
      return <ApprovalCard block={block} />;
    case "question":
      return <QuestionCard block={block} />;
    case "tierline":
      return <TierLine block={block} />;
    case "stats":
      return <StatsRow block={block} />;
    case "banner":
    case "error":
      return <BannerRow block={block} />;
    default:
      return null;
  }
}
