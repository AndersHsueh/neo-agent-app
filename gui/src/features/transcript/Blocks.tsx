import { useEffect, useState } from "preact/hooks";
import { DiffView } from "@/components/DiffView.tsx";
import { Icon } from "@/components/Icon.tsx";
import { Prose } from "@/components/Prose.tsx";
import { lang, lang as langSignal, t } from "@/i18n";
import { formatCost, formatTime, formatTokens, inlineMd } from "@/lib/fx.ts";
import { renderMarkdown } from "@/lib/markdown.ts";
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
  ViewBlock,
} from "@/protocol";
import { answerQuestion, type CommandOutcomeView, resolveApproval } from "@/state/app.ts";
import { store } from "@/state/store.ts";

/** 块渲染的可选回调（由 app 侧接线；缺省时单选走内置 action） */
export interface RenderBlockOptions {
  streamingAssistantId?: string;
  /**
   * 多选题/自由输入的提交出口。
   * TODO(接口): 等 app 侧把 question.answer 统一成 {key,keys,custom} 后由 Workbench 传入；
   * 未接线时多选会走内置答案（单 key），自由输入提示未接线。
   */
  onAnswerKeys?: (blockId: string, keys: string[], custom?: string) => void;
}

/** 距离 deadlineAt 的剩余秒数；无 deadline 或已收口时返回 0 */
function useCountdown(deadlineAt?: number, active = true): number {
  const [left, setLeft] = useState<number>(() =>
    deadlineAt && active ? Math.max(0, Math.round((deadlineAt - Date.now()) / 1000)) : 0,
  );
  useEffect(() => {
    if (!deadlineAt || !active) {
      setLeft(0);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.round((deadlineAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [deadlineAt, active]);
  return left;
}

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
        {/* v0.0.2 协议不回传附件元数据：只有本轮本地发出的图片能预览 */}
        {block.attachments?.length ? (
          <div class="msg__images">
            {block.attachments.map((attachment, index) => (
              <img
                class="chatimg"
                src={attachment.dataUrl}
                alt={`attachment ${index + 1}`}
                key={`${block.id}-${index}`}
              />
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
            <Icon name={block.icon ?? "terminal"} />
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
  const left = useCountdown(block.deadlineAt, !done);
  const hasDiff = Boolean(block.diff);
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
              {block.tool}
              {block.path ? ` · ${block.path}` : null}
            </span>
            <span class="approve__risk">
              {done ? t("dialog.approve.doneRisk") : t("dialog.approve.risk")}
            </span>
          </span>
        </div>
        {/* diff 可缺省（v1.1）：有 diff 就展开，没有则退回人类可读 detail */}
        {block.diff ? (
          <div class="approve__diff">
            <DiffView diff={block.diff} maxHeight={200} />
          </div>
        ) : block.detail ? (
          <pre class="approve__detail">{block.detail}</pre>
        ) : null}
        {done ? null : (
          <div class="approve__actions">
            <button
              class="btn btn--ghost"
              type="button"
              onClick={() => (store.approvalView.value = block.id)}
            >
              <Icon name={hasDiff ? "diff" : "file"} class="icon icon--xs" />
              {hasDiff ? t("approve.reviewDiff") : t("approve.reviewDetail")}
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
            <span class="approve__hint">
              {block.deadlineAt
                ? t("dialog.approve.timeout", { s: left })
                : t("dialog.approve.note")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function QuestionCard({
  block,
  onAnswerKeys,
}: {
  block: QuestionBlock;
  onAnswerKeys?: RenderBlockOptions["onAnswerKeys"];
}) {
  const multi = block.multiSelect === true;
  const answeredKeys = block.answeredKeys ?? (block.answeredKey ? [block.answeredKey] : []);
  const answered = answeredKeys.length > 0 || Boolean(block.custom);
  const [picked, setPicked] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const left = useCountdown(block.deadlineAt, !answered);

  const submit = async (keys: string[], customText?: string) => {
    if (busy || answered) return;
    setBusy(true);
    try {
      const text = customText?.trim();
      if (onAnswerKeys) {
        onAnswerKeys(block.id, keys, text);
        return;
      }
      // 单选走兼容字段 key，多选/自由输入走 v1.1 的 keys/custom
      await answerQuestion(block.id, {
        key: !multi && keys.length === 1 ? keys[0] : undefined,
        keys: multi || keys.length > 1 ? keys : undefined,
        custom: text || undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: string) => {
    if (answered || busy) return;
    if (!multi) {
      void submit([key]);
      return;
    }
    setPicked((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  return (
    <div class="msg msg--tool">
      <div class={`ask${answered ? " is-answered" : ""}${multi ? " is-multi" : ""}`}>
        <div class="ask__head">
          <Icon name="peers" class="icon icon--sm" />
          <span class="ask__q">
            {block.header ? <span class="ask__header">{block.header}</span> : null}
            <span class="ask__prompt">{block.prompt}</span>
          </span>
          <span class="ask__hint">
            {answered
              ? `✓ ${t("question.picked")}`
              : multi
                ? t("question.multiHint")
                : t("question.keys")}
          </span>
        </div>
        {block.context ? <div class="ask__ctx">{block.context}</div> : null}
        <div class="ask__opts">
          {block.options.map((option) => {
            const isPicked = answered
              ? answeredKeys.includes(option.key)
              : picked.includes(option.key);
            return (
              <button
                key={option.key}
                class={`ask__opt${isPicked ? " is-picked" : ""}`}
                type="button"
                disabled={answered || busy}
                onClick={() => toggle(option.key)}
              >
                <span class="ask__key">{multi ? (isPicked ? "✓" : "·") : option.key}</span>
                <span class="ask__opt-main">
                  <span class="ask__opt-t">{option.label}</span>
                  {option.description ? <span class="ask__opt-d">{option.description}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
        {block.allowCustom && answered && block.custom ? (
          <div class="ask__custom-static">
            <Icon name="edit" class="icon icon--xs" />
            <span>{block.custom}</span>
          </div>
        ) : null}
        {block.allowCustom && !answered ? (
          <form
            class="ask__customrow"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(picked, custom);
            }}
          >
            <input
              class="ask__custom"
              value={custom}
              placeholder={t("question.customPlaceholder")}
              onInput={(event) => setCustom((event.target as HTMLInputElement).value)}
            />
            <button
              class="btn btn--ghost btn--sm"
              type="submit"
              disabled={busy || (!custom.trim() && picked.length === 0)}
            >
              <Icon name="send" class="icon icon--xs" />
              {busy ? t("question.submitting") : t("question.send")}
            </button>
          </form>
        ) : null}
        {multi && !answered ? (
          <div class="ask__submitrow">
            <button
              class="btn btn--primary btn--sm"
              type="button"
              disabled={busy || picked.length === 0}
              onClick={() => void submit(picked)}
            >
              {busy ? t("question.submitting") : t("question.submit")}
            </button>
            <span class="ask__hint">{t("question.selected", { n: picked.length })}</span>
          </div>
        ) : null}
        {block.deadlineAt && !answered ? (
          <div class="ask__deadline">
            <Icon name="clock" class="icon icon--xs" />
            {t("question.deadline", { s: left })}
          </div>
        ) : null}
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
  const failed = Boolean(block.error);
  const contextPct =
    block.contextUsage !== undefined && block.contextUsage <= 1
      ? `${Math.round(block.contextUsage * 100)}%`
      : block.contextUsage !== undefined
        ? formatTokens(block.contextUsage)
        : null;
  return (
    <div class={`stats${failed ? " is-error" : ""}`} title={block.turnId}>
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
      {contextPct ? (
        <span class="stat" title={t("stats.ctx")}>
          <Icon name="gauge" />
          <b>{contextPct}</b> {t("stats.ctx")}
        </span>
      ) : null}
      {block.finishReason ? (
        <span class="stat">
          {t("stats.finish")} <b>{block.finishReason}</b>
        </span>
      ) : null}
      {block.error ? (
        <span class="stat stat--error">
          <Icon name="alert" />
          <b>{block.error.code}</b>
          <span class="stat__msg">{block.error.message}</span>
        </span>
      ) : null}
    </div>
  );
}

export function BannerRow({ block }: { block: BannerBlock | ErrorBlock }) {
  const level = block.kind === "error" ? "error" : block.level;
  return (
    <div class={`banner banner--${level}`}>
      <Icon name={level === "info" ? "spark" : "alert"} />
      <span class="banner__tag">{t(`banner.${level}`)}</span>
      <span class="banner__text">
        {block.kind === "error" ? (
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

/* ------------------------------------------------------------------ */
/* 命令结果（command.result / command.run 回执）                        */
/* ------------------------------------------------------------------ */

/** 命令结果的 markdown：与助手正文共用 lib/markdown（标题/表格/列表/代码块/引用） */
function MarkdownChunk({ text }: { text: string }) {
  return (
    <div
      // biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown 输出已全量转义
      class="prose md cmdresult__md"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  );
}

/** ViewBlock 的七种形状：text / markdown / kv / list / table / diff / notice */
export function ViewBlockContent({ view }: { view: ViewBlock }) {
  switch (view.kind) {
    case "text":
      return <pre class="cmdresult__pre">{view.text}</pre>;
    case "markdown":
      return <MarkdownChunk text={view.text} />;
    case "kv":
      return (
        <dl class="cmdresult__kv">
          {view.items.map((item, index) => (
            <div class="cmdresult__kvrow" key={`${item.k}-${index}`}>
              <dt>{item.k}</dt>
              <dd>{item.v}</dd>
            </div>
          ))}
        </dl>
      );
    case "list": {
      const List = view.ordered ? "ol" : "ul";
      return (
        <List class="cmdresult__list">
          {view.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </List>
      );
    }
    case "table":
      return (
        <div class="cmdresult__tablewrap">
          <table class="cmdresult__table">
            {view.head.length ? (
              <thead>
                <tr>
                  {view.head.map((cell, index) => (
                    <th key={index}>{cell}</th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {view.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "diff":
      return (
        <div class="cmdresult__diff">
          {view.file ? <div class="cmdresult__difffile">{view.file}</div> : null}
          <DiffView diff={view.diff} maxHeight={260} />
        </div>
      );
    case "notice":
      return (
        <div class={`cmdresult__notice cmdresult__notice--${view.level}`}>
          <Icon name={view.level === "info" ? "spark" : "alert"} class="icon icon--xs" />
          <span>{view.text}</span>
        </div>
      );
    default:
      return null;
  }
}

export function CommandResultCard({
  name,
  args,
  outcome,
}: {
  name: string;
  args?: string[];
  outcome: CommandOutcomeView;
}) {
  const blocks = outcome.blocks ?? [];
  const hasNotice = blocks.some((block) => block.kind === "notice");
  const changes = Object.entries(outcome.changes ?? {}).filter(
    ([, value]) => value !== undefined && value !== null,
  );
  return (
    <div class={`cmdresult${outcome.ok ? "" : " is-error"}`}>
      <div class="cmdresult__head">
        <Icon name="command-key" class="icon icon--xs" />
        <span class="cmdresult__name">
          /{name}
          {args?.length ? ` ${args.join(" ")}` : null}
        </span>
        <span class="cmdresult__state">
          {outcome.ok ? t("cmd.result.ok") : t("cmd.result.failed")}
        </span>
      </div>
      <div class="cmdresult__body">
        {blocks.map((view, index) => (
          <ViewBlockContent key={index} view={view} />
        ))}
        {!outcome.ok && outcome.error && !hasNotice ? (
          <div class="cmdresult__error">
            <Icon name="alert" class="icon icon--xs" />
            <span class="cmdresult__code">{outcome.error.code}</span>
            <span>{outcome.error.message}</span>
          </div>
        ) : null}
        {changes.length ? (
          <div class="cmdresult__changes">
            <span class="cmdresult__changeslabel">{t("cmd.result.changes")}</span>
            {changes.map(([key, value]) => (
              <span class="cmdresult__change" key={key}>
                <b>{key}</b> {String(value)}
              </span>
            ))}
          </div>
        ) : null}
        {blocks.length === 0 && !outcome.error ? (
          <div class="cmdresult__empty">{t("cmd.result.empty")}</div>
        ) : null}
      </div>
    </div>
  );
}

export function renderBlock(block: TranscriptBlock, opts: RenderBlockOptions = {}) {
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
      return <QuestionCard block={block} onAnswerKeys={opts.onAnswerKeys} />;
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
