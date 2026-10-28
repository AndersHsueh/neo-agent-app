/**
 * dummy-serv/store.ts — 内存里的“世界”：用户、会话状态、设置、用量、seq。
 *
 * 会话状态直接复用前端的纯 reducer（`gui/src/state/session.ts`）：
 * 事件 → reducer → 状态，快照从状态里长出来。这样 dummy 与前端不会各有一份
 * “对话块长什么样”的理解，接真 hub 时这段可以整体换成真 hub 的状态机。
 */

import type {
  FileDiff,
  SessionMeta,
  SessionState,
  SettingsView,
  TranscriptBlock,
  Usage,
  UsageRecord,
  User,
} from "../../gui/src/protocol/index.ts";
import { hydrate } from "../../gui/src/state/session.ts";

export type Lang = "zh" | "en";

export type Localized = string | { zh: string; en: string };
export const lx = (v: Localized, lang: Lang): string => (typeof v === "string" ? v : v[lang]);

export interface StoredUser {
  user: User;
  passwordHash: string;
}

export interface World {
  users: StoredUser[];
  states: Map<string, SessionState>;
  /** 会话标题的双语原件；列表与快照按连接语言解析 */
  rawTitles: Map<string, { zh: string; en: string }>;
  /** 种子块的双语原件：还没跑过新轮次时，快照按连接语言解析 */
  seedBlocks: Map<string, SeedBlock[]>;
  seededTurns: Map<string, number>;
  lang: Map<string, Lang>;
  seqs: Map<string, number>;
  turnCounts: Map<string, number>;
  settings: Map<string, SettingsView>;
  usage: UsageRecord[];
  tokens: Map<string, { userId: string; expiresAt: number }>;
  faults: Set<string>;
  /** 已经触发过的一次性故障（drop-ws 之类只触发一次） */
  firedFaults: Set<string>;
}

const NOW = Date.UTC(2026, 9, 28, 6, 4, 0);

/* ------------------------------------------------------------------ */
/* 用户                                                                */
/* ------------------------------------------------------------------ */

export const DEV_USERS: { user: User; password: string }[] = [
  { user: { id: "u-neo", email: "neo@local", displayName: "Neo", role: "owner" }, password: "neo" },
  { user: { id: "u-tom", email: "tom@local", displayName: "Tom", role: "member" }, password: "tom" },
  { user: { id: "u-jacky", email: "jacky@local", displayName: "Jacky", role: "member" }, password: "jacky" },
];

/* ------------------------------------------------------------------ */
/* 文件 diff（审批用）                                                 */
/* ------------------------------------------------------------------ */

export const APPROVAL_DIFF: FileDiff = {
  file: "src/input/commands.ts",
  add: 6,
  del: 0,
  hunks: [
    {
      header: "@@ -12,6 +12,12 @@ export interface CommandEntry {",
      lines: [
        { t: "ctx", ln: 12, code: "  name: string;" },
        { t: "ctx", ln: 13, code: "  description: string;" },
        { t: "ctx", ln: 14, code: "}" },
        { t: "ctx", ln: 15, code: "" },
        { t: "add", ln: 16, code: "/** 档位别名 → 规范命令名。归一化只在分发入口做一次。 */" },
        { t: "add", ln: 17, code: "export const TIER_ALIAS = new Map<string, string>(()" },
        { t: "add", ln: 18, code: '  ["deep", "deep_reasoning"],' },
        { t: "add", ln: 19, code: '  ["balanced", "balanced"],' },
        { t: "add", ln: 20, code: '  ["fast", "fast"],' },
        { t: "add", ln: 21, code: '  ["default", "default"],' },
        { t: "add", ln: 22, code: "]);" },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* 双语种子块                                                          */
/* ------------------------------------------------------------------ */

type Seg =
  | { type: "p"; text: Localized }
  | { type: "ul"; items: Localized[] }
  | { type: "code"; lang: string; code: string; file?: string };

type SeedBlock =
  | { kind: "turn"; n: number; at: number }
  | { kind: "user"; at: number; text: Localized; refs?: { icon: string; label: string }[] }
  | {
      kind: "assistant";
      at: number;
      tier: SessionMeta["tier"];
      segments: Seg[];
    }
  | { kind: "reasoning"; at: number; durationMs: number; tokens: number; text: Localized }
  | {
      kind: "tool";
      at: number;
      name: string;
      icon: string;
      arg: string;
      state: "ok" | "error";
      durationMs: number;
      output: string;
      foot?: Localized;
    }
  | { kind: "stats"; at: number; durationMs: number; usage: Usage; toolCalls: number; iterations: number; tier: SessionMeta["tier"] };

const SEED_MAIN: SeedBlock[] = [
  { kind: "turn", n: 2, at: NOW - 240_000 },
  {
    kind: "user",
    at: NOW - 240_000,
    text: {
      zh: "`bun test tests/commands.test.ts` 挂了。守卫说命令表和 handleCommand 的 switch 对不上。先定位，别急着改。",
      en: "`bun test tests/commands.test.ts` is red. The guard says COMMANDS and the handleCommand switch disagree. Locate it first — don't patch yet.",
    },
    refs: [{ icon: "file", label: "tests/commands.test.ts" }],
  },
  {
    kind: "reasoning",
    at: NOW - 238_000,
    durationMs: 2400,
    tokens: 412,
    text: {
      zh: "先确认漂移的方向：命令表多了，还是 switch 多了。守卫按「表 → switch」单向检查，所以它只能抓到「表里有、实现没有」。读两侧取差集，再看 git log 最近三条。",
      en: "First establish the direction of the drift: does the table have entries the switch lacks, or the reverse? The guard only checks table → switch, so it can only catch “declared but not implemented.” Diff both sides, then check the last three commits.",
    },
  },
  {
    kind: "tool",
    at: NOW - 237_000,
    name: "read_file",
    icon: "file",
    arg: "tests/commands.test.ts",
    state: "ok",
    durationMs: 48,
    output: "15 lines · read the guard itself",
    foot: { zh: "15 行 · 只读取了守卫本体", en: "15 lines · read the guard itself" },
  },
  {
    kind: "tool",
    at: NOW - 236_000,
    name: "shell",
    icon: "terminal",
    arg: "bun test tests/commands.test.ts",
    state: "error",
    durationMs: 1900,
    output: "1 pass, 1 fail · missing branches: /deep /balanced /fast /default",
    foot: { zh: "退出码 1 · 4 条命令缺分支", en: "exit 1 · 4 commands missing branches" },
  },
  {
    kind: "assistant",
    at: NOW - 235_000,
    tier: "balanced",
    segments: [
      {
        type: "p",
        text: {
          zh: "漂移是单向的，方向很明确：命令表里有 `/deep` `/balanced` `/fast` `/default`，`handleCommand` 的 switch 里只有 `/tier`。守卫只检查「表里有 → 实现有」，所以它抓得准。",
          en: "The drift is one-way and unambiguous: the table declares `/deep` `/balanced` `/fast` `/default`, while the `handleCommand` switch only knows `/tier`. The guard checks table → implementation, so it caught exactly the right thing.",
        },
      },
      {
        type: "ul",
        items: [
          {
            zh: "别名本身没错 —— 在 CLI 里 `/deep` 比 `/tier deep_reasoning` 顺手得多，不该删。",
            en: "The aliases aren't wrong — `/deep` is far handier than `/tier deep_reasoning` in a terminal.",
          },
          {
            zh: "错在归一化的位置：现在等于要求每个 case 各自记得处理别名。",
            en: "The mistake is *where* normalization happens: every case is now responsible for remembering aliases.",
          },
        ],
      },
    ],
  },
];

export const TITLE_MAIN = { zh: "commands 漂移守卫告警", en: "commands drift guard failing" };
export const TITLE_TIER = { zh: "把 tier 语义接进状态条", en: "tier semantics into the status bar" };

const SEED_TIER: SeedBlock[] = [
  { kind: "turn", n: 1, at: NOW - 200_000 },
  {
    kind: "user",
    at: NOW - 199_000,
    text: {
      zh: "状态条现在完全看不出当前档位。给它加一个色，但别把整条染绿。",
      en: "The status bar gives no signal about the current tier. Add color, but don't paint the whole bar green.",
    },
  },
  {
    kind: "assistant",
    at: NOW - 198_000,
    tier: "fast",
    segments: [
      {
        type: "p",
        text: {
          zh: "档位色只上三个地方：`⇅` 前缀、模型名、以及回答前的 `●`。其余保持中性 —— 颜色是信号，不是主题。",
          en: "Tier color appears in exactly three places: the `⇅` prefix, the model name, and the `●` before answers. Everything else stays neutral.",
        },
      },
    ],
  },
  {
    kind: "stats",
    at: NOW - 197_000,
    durationMs: 3100,
    usage: { promptTokens: 4200, completionTokens: 400, reasoningTokens: 0, costMicros: 2000 },
    toolCalls: 1,
    iterations: 1,
    tier: "fast",
  },
];

function resolveSeed(seed: SeedBlock[], lang: Lang): TranscriptBlock[] {
  return seed.map((b, i) => {
    const id = `seed-${i}`;
    switch (b.kind) {
      case "turn":
        return { kind: "turn", id, at: b.at, n: b.n };
      case "user":
        return { kind: "user", id, at: b.at, text: lx(b.text, lang), refs: b.refs };
      case "assistant":
        return {
          kind: "assistant",
          id,
          at: b.at,
          tier: b.tier,
          segments: b.segments.map((s) =>
            s.type === "p"
              ? { type: "p", text: lx(s.text, lang) }
              : s.type === "ul"
                ? { type: "ul", items: s.items.map((it) => lx(it, lang)) }
                : { type: "code", lang: s.lang, code: s.code, file: s.file },
          ),
        };
      case "reasoning":
        return { kind: "reasoning", id, at: b.at, text: lx(b.text, lang), durationMs: b.durationMs, tokens: b.tokens, done: true };
      case "tool":
        return {
          kind: "tool",
          id,
          at: b.at,
          name: b.name,
          icon: b.icon,
          arg: b.arg,
          state: b.state,
          durationMs: b.durationMs,
          output: b.output,
          foot: b.foot ? lx(b.foot, lang) : undefined,
        };
      case "stats":
        return { kind: "stats", id, at: b.at, durationMs: b.durationMs, usage: b.usage, toolCalls: b.toolCalls, iterations: b.iterations, tier: b.tier };
      default:
        return { kind: "banner", id, at: NOW, level: "info" as const, text: "" };
    }
  });
}

/* ------------------------------------------------------------------ */
/* 设置                                                                */
/* ------------------------------------------------------------------ */

const BASE_SETTINGS = (userIndex: number): SettingsView => ({
  defaultProvider: "ipsa",
  defaultTier: "balanced",
  classifierProvider: "ipsa",
  classifierModelName: "glm-5.3-flash",
  providers: [
    {
      providerName: "ipsa",
      providerType: "openai",
      baseUrl: "https://ipsapro.isoftstone.com/thor/v1",
      apiKeyMask: `sk-···${["7f2a", "3b91", "c04d"][userIndex] ?? "7f2a"}`,
      defaultModelName: "deepseek-flash",
      deepReasoningModelName: "glm-5.3-flash",
      balancedModelName: "deepseek-flash",
      fastModelName: "deepseek-flash",
      maxTokens: 16384,
      temperature: 0.6,
      contextWindow: 512000,
      isDefault: true,
    },
    {
      providerName: "minimax",
      providerType: "anthropic",
      baseUrl: "https://api.minimaxi.com/anthropic",
      apiKeyMask: "sk-···91c4",
      defaultModelName: "MiniMax-M3",
      deepReasoningModelName: "MiniMax-M3",
      balancedModelName: "MiniMax-M2.7",
      fastModelName: "MiniMax-M2.7-highspeed",
      maxTokens: 8192,
      temperature: 0.7,
      contextWindow: 512000,
      isDefault: false,
    },
  ],
  routes: [
    { tier: "deep_reasoning", provider: "minimax", model: "MiniMax-M3", fallbackAllowed: true },
    { tier: "balanced", provider: "ipsa", model: "glm-5.3-flash", fallbackAllowed: false },
    { tier: "fast", provider: "ipsa", model: "deepseek-flash", fallbackAllowed: false },
    { tier: "default", provider: "ipsa", model: "glm-5.3-flash", fallbackAllowed: false },
  ],
  compactThreshold: 0.75,
  maxToolIterations: 80,
  toolOutputLimit: 30000,
  shell: { path: null, login: true, args: null },
  retry: { maxAttempts: 3, connectTimeoutMs: 30000, streamIdleTimeoutMs: 120000 },
  showReasoning: true,
  toolcallInfoDetails: false,
  memory: { enabled: true, autoRecall: true, autoCapture: true, journalRetentionDays: 7, userWikiDir: "~/.neo/wiki" },
  env: { enabled: true, probeTtlHours: 12, prompt: true, wikiPage: true },
  team: {
    skillsExtraPaths: [],
    crossSessionInbound: "auto",
    crossSessionAutoTurnLimit: 20,
    crossSessionHeartbeatMs: 15000,
    crossSessionDeadAfterMs: 120000,
    crossSessionProgressTimeoutMs: 300000,
    crossSessionWatchdogIntervalS: 120,
  },
});

function makeSession(
  id: string,
  ownerId: string,
  title: { zh: string; en: string },
  lang: Lang,
  status: SessionMeta["status"],
  tier: SessionMeta["tier"],
  blocks: TranscriptBlock[],
  opts: { unread?: number; createdOffsetMin?: number } = {},
): SessionState {
  const created = NOW - (opts.createdOffsetMin ?? 120) * 60_000;
  const meta: SessionMeta = {
    id,
    title: title[lang],
    ownerId,
    status,
    tier,
    provider: tier === "deep_reasoning" ? "minimax" : "ipsa",
    model: tier === "deep_reasoning" ? "MiniMax-M3" : "glm-5.3-flash",
    cwd: "~/work/neo",
    createdAt: created,
    updatedAt: NOW,
    unread: opts.unread ?? 0,
  };
  return hydrate({ meta, seq: 0, blocks, context: { used: 92_000, limit: 512_000, compactAt: 0.75 } });
}

export function createWorld(lang: Lang, faults: Set<string>): World {
  const users: StoredUser[] = DEV_USERS.map((u) => ({ user: u.user, passwordHash: "" }));
  const world: World = {
    users,
    states: new Map(),
    rawTitles: new Map(),
    seedBlocks: new Map(),
    seededTurns: new Map(),
    lang: new Map(),
    seqs: new Map(),
    turnCounts: new Map(),
    settings: new Map(),
    usage: [],
    tokens: new Map(),
    faults,
    firedFaults: new Set(),
  };

  const add = (
    state: SessionState,
    sessionLang: Lang,
    turnCount: number,
    seed?: SeedBlock[],
    rawTitle?: { zh: string; en: string },
  ) => {
    world.states.set(state.meta.id, state);
    world.lang.set(state.meta.id, sessionLang);
    world.turnCounts.set(state.meta.id, turnCount);
    world.seqs.set(state.meta.id, 0);
    if (seed) {
      world.seedBlocks.set(state.meta.id, seed);
      world.seededTurns.set(state.meta.id, turnCount);
    }
    if (rawTitle) world.rawTitles.set(state.meta.id, rawTitle);
  };

  add(
    makeSession("c-0704", "u-neo", { zh: "commands 漂移守卫告警", en: "commands drift guard failing" }, lang, "idle", "balanced", resolveSeed(SEED_MAIN, lang)),
    lang,
    2,
    SEED_MAIN,
    TITLE_MAIN,
  );
  add(
    makeSession("c-0703", "u-neo", { zh: "把 tier 语义接进状态条", en: "tier semantics into the status bar" }, lang, "waiting", "fast", resolveSeed(SEED_TIER, lang), { unread: 2, createdOffsetMin: 180 }),
    lang,
    1,
    SEED_TIER,
    TITLE_TIER,
  );
  const t0702 = { zh: "PD-1 Windows 实机验收", en: "PD-1 Windows acceptance" };
  const t0701 = { zh: "PD-1 Windows 验收（tom）", en: "PD-1 Windows acceptance (tom)" };
  const j0701 = { zh: "i18n 英文文案打磨（jacky）", en: "i18n English copy polish (jacky)" };
  add(makeSession("c-0702", "u-neo", t0702, lang, "stalled", "balanced", [], { createdOffsetMin: 260 }), lang, 0, undefined, t0702);
  add(makeSession("t-0701", "u-tom", t0701, lang, "idle", "balanced", [], { createdOffsetMin: 300 }), lang, 0, undefined, t0701);
  add(makeSession("j-0701", "u-jacky", j0701, lang, "idle", "fast", [], { createdOffsetMin: 240 }), lang, 0, undefined, j0701);

  users.forEach((u, i) => world.settings.set(u.user.id, BASE_SETTINGS(i)));
  return world;
}

/** e2e 用：把世界清回种子状态（token 保留，避免测试间串数据） */
export function resetWorld(world: World, lang: Lang = "zh"): void {
  world.states.clear();
  world.rawTitles.clear();
  world.seedBlocks.clear();
  world.seededTurns.clear();
  world.lang.clear();
  world.seqs.clear();
  world.turnCounts.clear();
  world.settings.clear();
  world.usage.length = 0;
  const fresh = createWorld(lang, world.faults);
  for (const [id, state] of fresh.states) world.states.set(id, state);
  for (const [id, title] of fresh.rawTitles) world.rawTitles.set(id, title);
  for (const [id, seed] of fresh.seedBlocks) world.seedBlocks.set(id, seed);
  for (const [id, turns] of fresh.seededTurns) world.seededTurns.set(id, turns);
  for (const [id, l] of fresh.lang) world.lang.set(id, l);
  for (const [id, seq] of fresh.seqs) world.seqs.set(id, seq);
  for (const [id, count] of fresh.turnCounts) world.turnCounts.set(id, count);
  for (const [id, settings] of fresh.settings) world.settings.set(id, settings);
  world.firedFaults.clear();
}

export function sessionsFor(world: World, userId: string, lang: Lang = "zh"): SessionMeta[] {
  return [...world.states.values()]
    .filter((s) => s.meta.ownerId === userId)
    .map((s) => {
      const raw = world.rawTitles.get(s.meta.id);
      return raw ? { ...s.meta, title: raw[lang] } : s.meta;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 尚未跑过新轮次时，用对应语言的种子块生成快照 */
export function localizedSeedBlocks(world: World, sessionId: string, lang: Lang): TranscriptBlock[] | null {
  const seed = world.seedBlocks.get(sessionId);
  const seededTurns = world.seededTurns.get(sessionId);
  const turns = world.turnCounts.get(sessionId);
  if (!seed || seededTurns === undefined || turns === undefined) return null;
  if (turns !== seededTurns) return null;
  return resolveSeed(seed, lang);
}

export function usageFor(world: World, userId: string, sessionId?: string): UsageRecord[] {
  return world.usage.filter((r) => r.userId === userId && (!sessionId || r.sessionId === sessionId));
}

export function totals(records: UsageRecord[]): Usage {
  return records.reduce<Usage>(
    (acc, r) => ({
      promptTokens: acc.promptTokens + r.promptTokens,
      completionTokens: acc.completionTokens + r.completionTokens,
      reasoningTokens: acc.reasoningTokens + r.reasoningTokens,
      costMicros: acc.costMicros + r.costMicros,
    }),
    { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, costMicros: 0 },
  );
}
