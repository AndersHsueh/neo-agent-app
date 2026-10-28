/**
 * protocol/types.ts — 前端 ⇄ hub 的**唯一协议源**。
 *
 * 规则：
 * 1. 这里只有类型与常量，没有运行时逻辑（校验在 guards.ts，样本在 fixtures.ts）。
 * 2. dummy-serv 与未来的真 hub 都 `import type` 这一份；不允许复制字符串或另写一份。
 * 3. 任何字段变更先改本文件，再改实现；文档 `docs/gui-v1-protocol.md` 与之逐条对应。
 */

export const PROTOCOL_VERSION = 1 as const;

/* ------------------------------------------------------------------ */
/* 基础域                                                              */
/* ------------------------------------------------------------------ */

export type Tier = "deep_reasoning" | "balanced" | "fast" | "default";
export type PermissionMode = "ask" | "auto-edit" | "auto-all" | "plan";
export type SessionStatus = "idle" | "working" | "waiting" | "stalled" | "dead";
export type Role = "owner" | "member";

export const TIERS: readonly Tier[] = ["deep_reasoning", "balanced", "fast", "default"];
export const MODES: readonly PermissionMode[] = ["ask", "auto-edit", "auto-all", "plan"];

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

export interface TokenGrant {
  token: string;
  /** epoch ms */
  expiresAt: number;
  user: User;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  /** 百万分之一美元；整数，避免浮点漂移 */
  costMicros: number;
}

export interface UsageRecord extends Usage {
  id: string;
  userId: string;
  sessionId: string;
  turnId: string;
  provider: string;
  model: string;
  tier: Tier;
  /** epoch ms */
  at: number;
}

/* ------------------------------------------------------------------ */
/* 会话元信息                                                          */
/* ------------------------------------------------------------------ */

export interface SessionMeta {
  id: string;
  title: string;
  ownerId: string;
  status: SessionStatus;
  tier: Tier;
  provider: string;
  model: string;
  cwd: string;
  /** epoch ms */
  createdAt: number;
  updatedAt: number;
  unread: number;
}

export interface ContextState {
  used: number;
  limit: number;
  /** 0–1，自动压缩阈值 */
  compactAt: number;
}

/* ------------------------------------------------------------------ */
/* 对话块（GUI 形状，由事件 reducer 生成）                             */
/* ------------------------------------------------------------------ */

export interface TurnBlock {
  kind: "turn";
  id: string;
  at: number;
  n: number;
}

export interface UserBlock {
  kind: "user";
  id: string;
  at: number;
  text: string;
  refs?: { icon: string; label: string }[];
  /** 来自 AskUser 的选项回填 */
  picked?: boolean;
  /** 客户端幂等键；刷新/重连时用来保留尚未被 hub 落盘的本地消息 */
  clientId?: string;
}

export type AssistantSegment =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "code"; lang: string; code: string; file?: string };

export interface AssistantBlock {
  kind: "assistant";
  id: string;
  at: number;
  tier: Tier;
  segments: AssistantSegment[];
}

export interface ReasoningBlock {
  kind: "reasoning";
  id: string;
  at: number;
  text: string;
  durationMs: number;
  tokens: number;
  done: boolean;
}

export type ToolState = "running" | "ok" | "error" | "denied";

export interface ToolBlock {
  kind: "tool";
  id: string;
  at: number;
  name: string;
  icon: string;
  arg: string;
  state: ToolState;
  durationMs?: number;
  output?: string;
  truncated?: boolean;
  foot?: string;
}

export interface DiffLine {
  t: "ctx" | "add" | "del";
  ln: number;
  code: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  file: string;
  add: number;
  del: number;
  hunks: DiffHunk[];
}

export type ApprovalState = "pending" | "allowed" | "denied";

export interface ApprovalBlock {
  kind: "approval";
  id: string;
  at: number;
  tool: string;
  path: string;
  diff: FileDiff;
  state: ApprovalState;
  /** epoch ms；超时自动拒绝 */
  deadlineAt?: number;
}

export interface QuestionOption {
  key: string;
  label: string;
  description?: string;
}

export interface QuestionBlock {
  kind: "question";
  id: string;
  at: number;
  prompt: string;
  options: QuestionOption[];
  answeredKey?: string;
}

export interface TierLineBlock {
  kind: "tierline";
  id: string;
  at: number;
  from: Tier;
  to: Tier;
  reason: string;
}

export interface StatsBlock {
  kind: "stats";
  id: string;
  at: number;
  durationMs: number;
  usage: Usage;
  toolCalls: number;
  iterations: number;
  tier: Tier;
}

export interface BannerBlock {
  kind: "banner";
  id: string;
  at: number;
  level: "info" | "warn" | "error";
  text: string;
}

export interface ErrorBlock {
  kind: "error";
  id: string;
  at: number;
  code: string;
  message: string;
  retryable: boolean;
}

export type TranscriptBlock =
  | TurnBlock
  | UserBlock
  | AssistantBlock
  | ReasoningBlock
  | ToolBlock
  | ApprovalBlock
  | QuestionBlock
  | TierLineBlock
  | StatsBlock
  | BannerBlock
  | ErrorBlock;

/* ------------------------------------------------------------------ */
/* 会话事件（hub → 前端，经 seq 排序；增量）                           */
/* ------------------------------------------------------------------ */

export interface TurnStartEvent {
  type: "turn.start";
  turnId: string;
  blockId: string;
  n: number;
  at: number;
  /** 本轮用户输入；多标签页订阅时由 hub 统一下发，发送方按 clientId 去重 */
  userText?: string;
  clientId?: string;
  refs?: { icon: string; label: string }[];
}

export interface AssistantStartEvent {
  type: "assistant.start";
  blockId: string;
  at: number;
  tier: Tier;
}

export interface AssistantDeltaEvent {
  type: "assistant.delta";
  blockId: string;
  /** 追加到当前段的纯文本 */
  text: string;
}

export interface AssistantEndEvent {
  type: "assistant.end";
  blockId: string;
}

export interface ReasoningStartEvent {
  type: "reasoning.start";
  blockId: string;
  at: number;
}

export interface ReasoningDeltaEvent {
  type: "reasoning.delta";
  blockId: string;
  text: string;
}

export interface ReasoningEndEvent {
  type: "reasoning.end";
  blockId: string;
  durationMs: number;
  tokens: number;
}

export interface ToolStartEvent {
  type: "tool.start";
  blockId: string;
  at: number;
  name: string;
  icon: string;
  arg: string;
}

export interface ToolEndEvent {
  type: "tool.end";
  blockId: string;
  state: ToolState;
  output: string;
  durationMs: number;
  truncated?: boolean;
  foot?: string;
}

export interface ApprovalRequestEvent {
  type: "approval.request";
  blockId: string;
  at: number;
  tool: string;
  path: string;
  diff: FileDiff;
  deadlineAt?: number;
}

export interface ApprovalResolveEvent {
  type: "approval.resolve";
  blockId: string;
  state: ApprovalState;
}

export interface QuestionRequestEvent {
  type: "question.request";
  blockId: string;
  at: number;
  prompt: string;
  options: QuestionOption[];
}

export interface QuestionResolveEvent {
  type: "question.resolve";
  blockId: string;
  key: string;
  /** 选项文案；hub 下发后所有订阅者都能看到“谁选了什么” */
  answerLabel?: string;
}

export interface TierSwitchEvent {
  type: "tier.switch";
  from: Tier;
  to: Tier;
  reason: string;
  at: number;
}

export interface StatsEvent {
  type: "stats";
  blockId: string;
  at: number;
  durationMs: number;
  usage: Usage;
  toolCalls: number;
  iterations: number;
  tier: Tier;
}

export interface BannerEvent {
  type: "banner";
  blockId: string;
  at: number;
  level: "info" | "warn" | "error";
  text: string;
}

export interface SessionMetaEvent {
  type: "session.meta";
  meta: SessionMeta;
}

export interface SessionStatusEvent {
  type: "session.status";
  status: SessionStatus;
}

export interface ContextEvent {
  type: "context";
  context: ContextState;
}

export interface PeerUpdateEvent {
  type: "peer.update";
  peers: { name: string; status: SessionStatus; activity: string; age: string }[];
}

export interface HubErrorEvent {
  type: "error";
  blockId?: string;
  code: HubErrorCode;
  message: string;
  retryable: boolean;
}

export interface AuthExpiredEvent {
  type: "auth.expired";
}

export type SessionEvent =
  | TurnStartEvent
  | AssistantStartEvent
  | AssistantDeltaEvent
  | AssistantEndEvent
  | ReasoningStartEvent
  | ReasoningDeltaEvent
  | ReasoningEndEvent
  | ToolStartEvent
  | ToolEndEvent
  | ApprovalRequestEvent
  | ApprovalResolveEvent
  | QuestionRequestEvent
  | QuestionResolveEvent
  | TierSwitchEvent
  | StatsEvent
  | BannerEvent
  | SessionMetaEvent
  | SessionStatusEvent
  | ContextEvent
  | PeerUpdateEvent
  | HubErrorEvent
  | AuthExpiredEvent;

/* ------------------------------------------------------------------ */
/* 命令（前端 → hub）                                                  */
/* ------------------------------------------------------------------ */

export interface LoginCommand {
  type: "auth.login";
  email: string;
  password: string;
}

export interface LogoutCommand {
  type: "auth.logout";
}

export interface WhoamiCommand {
  type: "auth.whoami";
}

export interface SessionListCommand {
  type: "session.list";
}

export interface SessionCreateCommand {
  type: "session.create";
  title?: string;
}

export interface SessionAttachCommand {
  type: "session.attach";
  sessionId: string;
  /** 已收到的最大 seq；缺省表示要完整快照 */
  lastSeq?: number;
}

export interface SessionDetachCommand {
  type: "session.detach";
  sessionId: string;
}

export interface SessionRenameCommand {
  type: "session.rename";
  sessionId: string;
  title: string;
}

export interface SessionCloseCommand {
  type: "session.close";
  sessionId: string;
}

export interface TurnSendCommand {
  type: "turn.send";
  sessionId: string;
  text: string;
  /** 幂等键；重连后 hub 用它识别重复投递 */
  clientId: string;
  refs?: { icon: string; label: string }[];
}

export interface TurnAbortCommand {
  type: "turn.abort";
  sessionId: string;
}

export interface ApprovalResolveCommand {
  type: "approval.resolve";
  sessionId: string;
  blockId: string;
  decision: "allow" | "deny" | "allow-session";
}

export interface QuestionAnswerCommand {
  type: "question.answer";
  sessionId: string;
  blockId: string;
  key: string;
}

export interface CommandRunCommand {
  type: "command.run";
  sessionId: string;
  name: string;
  args: string[];
}

export interface SettingsGetCommand {
  type: "settings.get";
}

export interface SettingsPatchCommand {
  type: "settings.patch";
  patch: SettingsPatch;
}

export interface UsageSummaryCommand {
  type: "usage.summary";
  range: "session" | "day" | "month";
  sessionId?: string;
}

export interface PingCommand {
  type: "ping";
}

export type ClientCommand =
  | LoginCommand
  | LogoutCommand
  | WhoamiCommand
  | SessionListCommand
  | SessionCreateCommand
  | SessionAttachCommand
  | SessionDetachCommand
  | SessionRenameCommand
  | SessionCloseCommand
  | TurnSendCommand
  | TurnAbortCommand
  | ApprovalResolveCommand
  | QuestionAnswerCommand
  | CommandRunCommand
  | SettingsGetCommand
  | SettingsPatchCommand
  | UsageSummaryCommand
  | PingCommand;

/* ------------------------------------------------------------------ */
/* 设置（与 neo/settings.example.json 同构；前端只见掩码）             */
/* ------------------------------------------------------------------ */

export interface ProviderView {
  providerName: string;
  providerType: "openai" | "anthropic";
  baseUrl: string;
  /** 只到掩码，永不含明文 */
  apiKeyMask: string;
  defaultModelName: string;
  deepReasoningModelName: string;
  balancedModelName: string;
  fastModelName: string;
  maxTokens: number;
  temperature: number;
  contextWindow: number;
  isDefault: boolean;
}

export interface RouteView {
  tier: Tier;
  provider: string;
  model: string;
  fallbackAllowed: boolean;
}

export interface SettingsView {
  defaultProvider: string;
  defaultTier: Tier;
  classifierProvider: string;
  classifierModelName: string;
  providers: ProviderView[];
  routes: RouteView[];
  compactThreshold: number;
  maxToolIterations: number;
  toolOutputLimit: number;
  shell: { path: string | null; login: boolean; args: string[] | null };
  retry: { maxAttempts: number; connectTimeoutMs: number; streamIdleTimeoutMs: number };
  showReasoning: boolean;
  toolcallInfoDetails: boolean;
  memory: {
    enabled: boolean;
    autoRecall: boolean;
    autoCapture: boolean;
    journalRetentionDays: number;
    userWikiDir: string;
  };
  env: { enabled: boolean; probeTtlHours: number; prompt: boolean; wikiPage: boolean };
  team: {
    skillsExtraPaths: string[];
    crossSessionInbound: "auto" | "hold" | "off";
    crossSessionAutoTurnLimit: number;
    crossSessionHeartbeatMs: number;
    crossSessionDeadAfterMs: number;
    crossSessionProgressTimeoutMs: number;
    crossSessionWatchdogIntervalS: number;
  };
}

export interface SettingsPatch {
  defaultProvider?: string;
  defaultTier?: Tier;
  classifierProvider?: string;
  classifierModelName?: string;
  compactThreshold?: number;
  maxToolIterations?: number;
  toolOutputLimit?: number;
  showReasoning?: boolean;
  toolcallInfoDetails?: boolean;
  memory?: Partial<SettingsView["memory"]>;
  env?: Partial<SettingsView["env"]>;
  team?: Partial<SettingsView["team"]>;
  retry?: Partial<SettingsView["retry"]>;
}

/* ------------------------------------------------------------------ */
/* 错误                                                                */
/* ------------------------------------------------------------------ */

export type HubErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "timeout"
  | "approval_expired"
  | "session_gone"
  | "protocol"
  | "internal";

export interface HubError {
  code: HubErrorCode;
  message: string;
  retryable: boolean;
}

/* ------------------------------------------------------------------ */
/* 快照与信封                                                          */
/* ------------------------------------------------------------------ */

export interface SessionSnapshot {
  meta: SessionMeta;
  seq: number;
  blocks: TranscriptBlock[];
  context: ContextState;
  lastTurn?: StatsBlock;
  pendingApprovalId?: string;
  pendingQuestionId?: string;
}

export type ServerMessage =
  | { v: typeof PROTOCOL_VERSION; kind: "ready"; user: User }
  | {
      v: typeof PROTOCOL_VERSION;
      kind: "result";
      id: string;
      ok: true;
      data: unknown;
    }
  | {
      v: typeof PROTOCOL_VERSION;
      kind: "result";
      id: string;
      ok: false;
      error: HubError;
    }
  | {
      v: typeof PROTOCOL_VERSION;
      kind: "event";
      sessionId: string;
      seq: number;
      event: SessionEvent;
    }
  | {
      v: typeof PROTOCOL_VERSION;
      kind: "snapshot";
      sessionId: string;
      seq: number;
      snapshot: SessionSnapshot;
    }
  | {
      v: typeof PROTOCOL_VERSION;
      kind: "sessions";
      sessions: SessionMeta[];
    }
  | {
      v: typeof PROTOCOL_VERSION;
      kind: "settings";
      settings: SettingsView;
    }
  | {
      v: typeof PROTOCOL_VERSION;
      kind: "usage";
      range: "session" | "day" | "month";
      records: UsageRecord[];
      totals: Usage;
    }
  | { v: typeof PROTOCOL_VERSION; kind: "pong" };

export type ClientMessage = {
  v: typeof PROTOCOL_VERSION;
  kind: "command";
  id: string;
  command: ClientCommand;
};

/* ------------------------------------------------------------------ */
/* 客户端状态（由 reducer 维护；不是协议的一部分，但类型放这里共用）     */
/* ------------------------------------------------------------------ */

export interface SessionState {
  meta: SessionMeta;
  seq: number;
  blocks: TranscriptBlock[];
  context: ContextState;
  pendingApprovalId?: string;
  pendingQuestionId?: string;
  streaming: {
    assistantBlockId?: string;
    reasoningBlockId?: string;
    turnActive: boolean;
  };
  lastTurn?: StatsBlock;
}

export type ConnectionState =
  | "idle"
  | "connecting"
  | "authenticating"
  | "attaching"
  | "live"
  | "reconnecting"
  | "error";
