/**
 * state/store.ts — 全局可观察状态（signals）。
 *
 * 规则：store 只放“视图需要的状态”；派生数据用 computed，动作在 state/app.ts。
 * 组件不允许直接改 store，只能调 actions。
 */

import { computed, signal } from "@preact/signals";
import type { Endpoint } from "@/lib/endpoints.ts";
import type {
  PermissionMode,
  SessionMeta,
  SessionState,
  SettingsView,
  Usage,
  UsageRecord,
  User,
} from "@/protocol";
import type { ConnStatus } from "@/transport/hub";

/**
 * 启动阶段：
 *  - booting：还没做发现；
 *  - connecting：发现成功（有 endpoint/user），WS 还在握手/退避重连 → 显示工作台 + 离线条；
 *  - ready：ready 帧已到；offline：发现失败（显示登录页兜底与重试）。
 */
export type BootState = "booting" | "connecting" | "ready" | "offline";

export type SidebarView = "sessions" | "peers" | "memory" | "wiki" | "skills";
export type Overlay = null | "palette" | "settings" | "shortcuts" | "about";
export type ToastKind = "ok" | "warn" | "danger";

export interface Toast {
  id: string;
  text: string;
  sub?: string;
  kind: ToastKind;
}

export interface Peer {
  name: string;
  status: SessionMeta["status"];
  activity: { zh: string; en: string };
  age: string;
}

export interface UsageSummary {
  range: "session" | "day" | "month";
  records: UsageRecord[];
  totals: Usage;
}

export const store = {
  user: signal<User | null>(null),
  token: signal<string | null>(null),
  /** 当前发现的 Hub 端点（每次（重）连都会刷新） */
  endpoint: signal<Endpoint | null>(null),
  /** ready 广告的能力位；UI 按能力降级（sessions / attachments.image / transcript.replay ...） */
  capabilities: signal<string[]>([]),
  versions: signal<{ core: string | null; protocol: string | null }>({
    core: null,
    protocol: null,
  }),
  boot: signal<BootState>("booting"),
  bootError: signal<string | null>(null),
  connection: signal<ConnStatus>("idle"),
  sessions: signal<SessionMeta[]>([]),
  activeId: signal<string | null>(null),
  states: signal<Record<string, SessionState>>({}),
  settings: signal<SettingsView | null>(null),
  usage: signal<UsageSummary | null>(null),
  peers: signal<Peer[]>([
    {
      name: "tom",
      status: "working",
      activity: { zh: "正在跑 PD-1 Windows 验收", en: "running PD-1 Windows acceptance" },
      age: "12s",
    },
    {
      name: "jacky",
      status: "waiting",
      activity: { zh: "等你决定是否合并 #142", en: "waiting on your call for #142" },
      age: "2m",
    },
  ]),
  toasts: signal<Toast[]>([]),
  overlay: signal<Overlay>(null),
  /** 正在弹窗审阅的审批块 id */
  approvalView: signal<string | null>(null),
  sidebar: signal<SidebarView>("sessions"),
  asideOpen: signal(true),
  mode: signal<PermissionMode>("ask"),
  booting: signal(true),
  reconnecting: signal(false),
};

export const activeSession = computed<SessionState | null>(() => {
  const id = store.activeId.value;
  return id ? (store.states.value[id] ?? null) : null;
});

export const activeMeta = computed<SessionMeta | null>(() => {
  const id = store.activeId.value;
  return store.sessions.value.find((s) => s.id === id) ?? null;
});

export const isBusy = computed(() => {
  const state = activeSession.value;
  return state ? state.meta.status === "working" || state.streaming.turnActive : false;
});

export const pendingApproval = computed(() => {
  const state = activeSession.value;
  if (!state?.pendingApprovalId) return null;
  const block = state.blocks.find((b) => b.id === state.pendingApprovalId);
  return block?.kind === "approval" ? block : null;
});

export const pendingQuestion = computed(() => {
  const state = activeSession.value;
  if (!state?.pendingQuestionId) return null;
  const block = state.blocks.find((b) => b.id === state.pendingQuestionId);
  return block?.kind === "question" ? block : null;
});

export function pushToast(text: string, opts: { sub?: string; kind?: ToastKind } = {}): void {
  const toast: Toast = {
    id: crypto.randomUUID(),
    text,
    sub: opts.sub,
    kind: opts.kind ?? "ok",
  };
  store.toasts.value = [...store.toasts.value, toast];
  setTimeout(() => {
    store.toasts.value = store.toasts.value.filter((t) => t.id !== toast.id);
  }, 3200);
}

export function setStateFor(id: string, state: SessionState): void {
  store.states.value = { ...store.states.value, [id]: state };
}
