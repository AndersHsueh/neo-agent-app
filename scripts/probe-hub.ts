#!/usr/bin/env bun
/**
 * probe-hub.ts — 对**真实运行中的** neo-core-serve v0.0.2 Hub 做原始 WS 协议探测。
 *
 * 用法（在 neo-agent-app 根目录）：
 *   bun run scripts/probe-hub.ts            # 全量探测（含 2 条真实 LLM turn，约 15s）
 *   bun run scripts/probe-hub.ts --no-llm   # 跳过真实 turn（离线/LLM 未配置时用）
 *   bun run scripts/probe-hub.ts --json /tmp/out.json
 *
 * 行为：
 *   - 发现：~/.neo/run/core.json（可用 NEO_RUN_FILE / NEO_HOME 覆盖）→ url + tokenFile；
 *   - token：读 tokenFile（0600，每次运行现读，Hub 重启会轮换）；
 *   - 鉴权：WS 子协议 ["neo.v1", "bearer.<token>"]；
 *   - 每步打印 PASS/FAIL/SKIP + 关键数据；非零退出码 = 有硬失败（FAIL）。
 *   - 幂等：每次运行创建自己的 `probe-<runId>-*` 会话，结束前 close；只 detach 不 close 别人的会话。
 *   - 安全：绝不发送 >8MB 的帧；超限路径用「6 张图 / 单张 >5MB 解码」在 8MB 帧内验证 too_large。
 *
 * 证据 JSON：`/tmp/probe-hub/<runId>.json`（默认；可用 --json 覆盖）。
 *
 * 约束（与任务一致）：只读 GUI/core 源码；本脚本只写 /tmp + 自己创建的会话。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

/* ------------------------------------------------------------------ */
/* 常量与输出                                                          */
/* ------------------------------------------------------------------ */

const PROBE_PREFIX = "probe";
const TURN_TIMEOUT_MS = 180_000;
const ARGS = new Set(process.argv.slice(2));
const NO_LLM = ARGS.has("--no-llm");
const JSON_ARG_IDX = process.argv.indexOf("--json");
const JSON_PATH_CLI = JSON_ARG_IDX >= 0 ? process.argv[JSON_ARG_IDX + 1] : undefined;

const RUN_ID = `${PROBE_PREFIX}-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${randomUUID().slice(0, 4)}`;
const TITLE_A = `${RUN_ID}-A-titled`;
const TITLE_B = `${RUN_ID}-B-renamed`;

type Status = "PASS" | "FAIL" | "SKIP" | "INFO";
interface Check {
  id: string;
  title: string;
  status: Status;
  detail: string;
  ms?: number;
  data?: unknown;
}

const checks: Check[] = [];
let failures = 0;

function record(id: string, title: string, status: Status, detail: string, extra: { ms?: number; data?: unknown } = {}): void {
  checks.push({ id, title, status, detail, ...extra });
  const tag = status.padEnd(4, " ");
  console.log(`${tag}  ${id.padEnd(6)} ${title}${detail ? ` — ${detail}` : ""}`);
}

class SkipError extends Error {}
function skip(reason: string): never {
  throw new SkipError(reason);
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

interface ProbeOk<T> {
  detail: string;
  data?: unknown;
  value?: T;
}

async function probe<T>(id: string, title: string, fn: () => Promise<ProbeOk<T>>): Promise<T | undefined> {
  const t0 = performance.now();
  try {
    const r = await fn();
    const ms = Math.round(performance.now() - t0);
    record(id, title, "PASS", r.detail, { ms, data: r.data });
    return r.value;
  } catch (error) {
    const ms = Math.round(performance.now() - t0);
    if (error instanceof SkipError) {
      record(id, title, "SKIP", error.message, { ms });
      return undefined;
    }
    failures += 1;
    record(id, title, "FAIL", (error as Error)?.message ?? String(error), { ms });
    return undefined;
  }
}

/** 仅供诊断的「记录但不判定」段落。 */
function note(id: string, title: string, detail: string, data?: unknown): void {
  record(id, title, "INFO", detail, { data });
}

function section(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 66 - title.length))}`);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const nowIso = (): string => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* 发现：core.json / token                                             */
/* ------------------------------------------------------------------ */

function neoHome(): string {
  return process.env["NEO_HOME"] ?? join(homedir(), ".neo");
}
function sessionsDir(): string {
  return process.env["NEO_SESSIONS_DIR"] ?? join(neoHome(), "sessions");
}
function sessionFile(id: string): string {
  return join(sessionsDir(), `${id}.json`);
}
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

interface Discovery {
  url: string;
  httpUrl: string;
  tokenFile: string;
  pid: number;
  startedAt: string;
  token: string;
}

function loadDiscovery(): Discovery {
  const runFile = process.env["NEO_RUN_FILE"] ?? join(neoHome(), "run", "core.json");
  assert(existsSync(runFile), `发现文件不存在：${runFile}（Hub 未启动？）`);
  const info = readJson(runFile) as { url?: string; pid?: number; tokenFile?: string; startedAt?: string };
  assert(typeof info.url === "string" && info.url.startsWith("ws://"), `core.json.url 非法：${String(info.url)}`);
  const tokenFile = info.tokenFile ?? join(neoHome(), "run", "core.token");
  assert(existsSync(tokenFile), `token 文件不存在：${tokenFile}`);
  const token = readFileSync(tokenFile, "utf8").trim();
  assert(token.length >= 16, `token 文件内容非法（长度 ${token.length}）`);
  const httpUrl = info.url.replace(/^ws:/, "http:");
  return { url: info.url, httpUrl, tokenFile, pid: info.pid ?? -1, startedAt: info.startedAt ?? "", token };
}

/* ------------------------------------------------------------------ */
/* WS 客户端                                                           */
/* ------------------------------------------------------------------ */

interface FrameRec {
  at: number;
  frame: any;
  bytes: number;
}
interface ResultFrame {
  ok: boolean;
  data?: any;
  error?: any;
  latencyMs: number;
  id: string;
}

interface Pending {
  resolve: (r: ResultFrame) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
interface Waiter {
  pred: (frame: any) => boolean;
  resolve: (frame: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

class Client {
  readonly frames: FrameRec[] = [];
  ready: any = null;
  boundSessionId: string | null = null;
  closeInfo: { code?: number; reason?: string; error?: string; at?: number } = {};
  connected = false;
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private waiters: Waiter[] = [];
  private idSeq = 0;
  private readyResolve: ((v: any) => void) | null = null;
  private readyReject: ((e: Error) => void) | null = null;

  constructor(
    readonly name: string,
    private readonly url: string,
    private readonly token: string,
  ) {}

  async connect(timeoutMs = 8000): Promise<this> {
    const ws = new WebSocket(this.url, ["neo.v1", `bearer.${this.token}`]);
    this.ws = ws;
    const ready = new Promise<any>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      setTimeout(() => reject(new Error(`${this.name}: ready 超时（${timeoutMs}ms）`)), timeoutMs).unref?.();
    });
    ws.onmessage = (event: MessageEvent) => this.onFrame(String(event.data));
    ws.onerror = (event: Event) => {
      this.closeInfo.error = (event as unknown as { message?: string })?.message ?? "ws error";
    };
    ws.onclose = (event: CloseEvent) => {
      this.connected = false;
      this.closeInfo = { code: event.code, reason: event.reason, at: performance.now(), error: this.closeInfo.error };
      const e = new Error(`${this.name}: 连接关闭 code=${event.code} reason=${JSON.stringify(event.reason ?? "")}`);
      this.readyReject?.(e);
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(e);
      }
      this.pending.clear();
      for (const w of this.waiters) {
        clearTimeout(w.timer);
        w.resolve({ kind: "__closed" });
      }
      this.waiters = [];
    };
    ws.onopen = () => {
      this.connected = true;
    };
    this.ready = await ready;
    return this;
  }

  private onFrame(text: string): void {
    let frame: any;
    try {
      frame = JSON.parse(text);
    } catch {
      return;
    }
    this.frames.push({ at: performance.now(), frame, bytes: Buffer.byteLength(text, "utf8") });
    if (frame.kind === "ready") {
      this.ready = frame;
      this.readyResolve?.(frame);
      this.readyResolve = null;
      return;
    }
    if (frame.kind === "result") {
      const p = this.pending.get(frame.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(frame.id);
        p.resolve({ ok: frame.ok === true, data: frame.data, error: frame.error, latencyMs: 0, id: frame.id });
      }
      // 注意：不要 early return —— waitFor 也可能在等 result/pong 帧（见 P10 原始帧探测）。
    }
    for (const w of [...this.waiters]) {
      let matched = false;
      try {
        matched = w.pred(frame);
      } catch {
        matched = false;
      }
      if (matched) {
        clearTimeout(w.timer);
        this.waiters = this.waiters.filter((x) => x !== w);
        w.resolve(frame);
      }
    }
  }

  request(command: Record<string, unknown>, timeoutMs = 15_000): Promise<ResultFrame> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`${this.name}: 连接未打开`));
    }
    const id = `${this.name}-${++this.idSeq}`;
    const started = performance.now();
    return new Promise<ResultFrame>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.name}: ${String(command["type"])} 超时（${timeoutMs}ms）`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (r) => resolve({ ...r, latencyMs: Math.round(performance.now() - started) }),
        reject,
        timer,
      });
      this.ws?.send(JSON.stringify({ v: 1, kind: "command", id, command }));
    });
  }

  /** 直接发原始文本帧（测非法 JSON / 错误信封用）。 */
  raw(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error(`${this.name}: 连接未打开`);
    this.ws.send(text);
  }

  /** 先扫描已收帧（避免竞态），再挂 waiter。 */
  waitFor(pred: (frame: any) => boolean, timeoutMs = 5000, label = "frame", sinceIdx = 0): Promise<any> {
    const hit = this.frames.slice(sinceIdx).find((r) => {
      try {
        return pred(r.frame);
      } catch {
        return false;
      }
    });
    if (hit) return Promise.resolve(hit.frame);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x.timer !== timer);
        reject(new Error(`${this.name}: 等待 ${label} 超时（${timeoutMs}ms）`));
      }, timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
  }

  waitEvent(sessionId: string, pred: (ev: any) => boolean, timeoutMs = 5000, label = "event", sinceIdx = 0): Promise<any> {
    return this.waitFor(
      (f) => f.kind === "event" && f.sessionId === sessionId && pred(f.event),
      timeoutMs,
      label,
      sinceIdx,
    );
  }

  eventsSince(sinceIdx: number, sessionId?: string): FrameRec[] {
    return this.frames
      .slice(sinceIdx)
      .filter((r) => r.frame.kind === "event" && (!sessionId || r.frame.sessionId === sessionId));
  }

  async attach(sessionId: string, opts: { lastSeq?: number; epoch?: string } = {}): Promise<{ result: ResultFrame; snapshot: any; frameIndex: number; snapshotIdx?: number }> {
    const frameIndex = this.frames.length;
    const result = await this.request({ type: "session.attach", sessionId, ...opts }, 20_000);
    let snapshot: any = null;
    let snapshotIdx: number | undefined;
    if (result.ok) {
      const rec = await this.waitFor(
        (f) => f.kind === "snapshot" && f.sessionId === sessionId,
        8000,
        "snapshot",
        frameIndex,
      );
      snapshot = rec.snapshot;
      snapshotIdx = this.frames.findIndex((r) => r.frame === rec);
      this.boundSessionId = sessionId;
    }
    return { result, snapshot, frameIndex, snapshotIdx };
  }

  async detach(sessionId?: string): Promise<ResultFrame> {
    const sid = sessionId ?? this.boundSessionId ?? undefined;
    const res = await this.request({ type: "session.detach", ...(sid ? { sessionId: sid } : {}) });
    if (res.ok && (sid === this.boundSessionId || !sid)) this.boundSessionId = null;
    return res;
  }

  close(): void {
    try {
      this.ws?.close(1000, "probe done");
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------ */
/* 帧/事件分析工具                                                     */
/* ------------------------------------------------------------------ */

const EPHEMERAL_EVENT_TYPES = new Set(["assistant.delta", "reasoning.delta", "tool.progress", "activity", "notice"]);

function evSummary(rec: FrameRec): { at: number; seq: number; type: string; event: any; bytes: number } {
  const ev = rec.frame.event;
  return { at: rec.at, seq: rec.frame.seq, type: ev?.type ?? "?", event: ev, bytes: rec.bytes };
}

function compactEvent(ev: any, maxText = 120): any {
  const out: Record<string, unknown> = { ...ev };
  for (const key of ["text", "userText", "output", "prompt", "message"]) {
    const v = out[key];
    if (typeof v === "string" && v.length > maxText) out[key] = `${v.slice(0, maxText)}…(${v.length} chars)`;
  }
  return out;
}

interface TurnCapture {
  prompt: string;
  clientId: string;
  sendResult: ResultFrame;
  elapsedMs: number;
  terminal: { type: string; seq: number; event: any; at: number } | null;
  eventTypes: Record<string, number>;
  eventList: { type: string; seq: number; at: number; bytes: number }[];
  deltas: { blockId: string; chars: number; bytes: number; at: number; seq: number }[];
  assistantEnd: any;
  reasoningEnd: any;
  stats: any;
  activities: any[];
  durableSeqCheck: { ok: boolean; gaps: string[] };
  deltaConcat: string;
  turnStart: any;
}

function captureTurn(client: Client, sessionId: string, sinceIdx: number, prompt: string, clientId: string, sendResult: ResultFrame, t0: number, terminal: any): TurnCapture {
  const evs = client.eventsSince(sinceIdx, sessionId).map(evSummary);
  const eventTypes: Record<string, number> = {};
  for (const e of evs) eventTypes[e.type] = (eventTypes[e.type] ?? 0) + 1;

  const deltas = evs.filter((e) => e.type === "assistant.delta").map((e) => ({
    blockId: e.event.blockId as string,
    chars: typeof e.event.text === "string" ? e.event.text.length : 0,
    bytes: e.bytes,
    at: e.at,
    seq: e.seq,
  }));
  const endEv = evs.find((e) => e.type === "assistant.end");
  const rEnd = evs.find((e) => e.type === "reasoning.end");
  const statsEv = evs.find((e) => e.type === "stats");
  const activities = evs.filter((e) => e.type === "activity").map((e) => e.event);
  const turnStart = evs.find((e) => e.type === "turn.start")?.event ?? null;

  // 合批后同一块 delta 的拼接；assistant.end.text 是权威全文。
  let deltaConcat = "";
  if (endEv) {
    const blockId = endEv.event.blockId;
    deltaConcat = evs
      .filter((e) => e.type === "assistant.delta" && e.event.blockId === blockId)
      .map((e) => (typeof e.event.text === "string" ? e.event.text : ""))
      .join("");
  } else {
    deltaConcat = evs
      .filter((e) => e.type === "assistant.delta")
      .map((e) => (typeof e.event.text === "string" ? e.event.text : ""))
      .join("");
  }

  // durable seq 必须严格 +1；ephemeral 携带「当前 durable seq」（可重复）。
  const gaps: string[] = [];
  let lastDurable = 0;
  for (const e of evs) {
    if (EPHEMERAL_EVENT_TYPES.has(e.type)) continue;
    if (lastDurable === 0) {
      lastDurable = e.seq;
      continue;
    }
    if (e.seq !== lastDurable + 1) gaps.push(`${e.type}: seq ${lastDurable} → ${e.seq}`);
    lastDurable = e.seq;
  }
  return {
    prompt,
    clientId,
    sendResult,
    elapsedMs: Math.round(performance.now() - t0),
    terminal: terminal ? { type: terminal.event.type, seq: terminal.seq, event: terminal.event, at: terminal.at } : null,
    eventTypes,
    eventList: evs.map((e) => ({ type: e.type, seq: e.seq, at: Math.round(e.at - t0), bytes: e.bytes })),
    deltas,
    assistantEnd: endEv?.event ?? null,
    reasoningEnd: rEnd?.event ?? null,
    stats: statsEv?.event ?? null,
    activities,
    durableSeqCheck: { ok: gaps.length === 0, gaps },
    deltaConcat,
    turnStart,
  };
}

/* ------------------------------------------------------------------ */
/* 主流程上下文                                                        */
/* ------------------------------------------------------------------ */

const runState = {
  discovery: null as Discovery | null,
  clients: [] as Client[],
  createdSessions: [] as string[],
  evidence: {} as Record<string, unknown>,
  cleaned: false,
};

async function newClient(name: string): Promise<Client> {
  const d = runState.discovery ?? (runState.discovery = loadDiscovery());
  const c = new Client(name, d.url, d.token);
  await c.connect();
  runState.clients.push(c);
  return c;
}

function trackSession(sid: string): string {
  if (sid && !runState.createdSessions.includes(sid)) runState.createdSessions.push(sid);
  return sid;
}

/* ------------------------------------------------------------------ */
/* 各探测步骤                                                          */
/* ------------------------------------------------------------------ */

async function fetchHealth(): Promise<number | null> {
  try {
    const d = runState.discovery;
    if (!d) return null;
    const res = await fetch(`${d.httpUrl.replace(/\/ws$/, "")}/health`);
    const json: any = await res.json();
    return typeof json?.sessions === "number" ? json.sessions : null;
  } catch {
    return null;
  }
}

async function runOneTurn(c: Client, sessionId: string, prompt: string): Promise<TurnCapture> {
  const marker = c.frames.length;
  const clientId = randomUUID();
  const t0 = performance.now();
  const send = await c.request({ type: "turn.send", sessionId, text: prompt, clientId }, 30_000);
  assert(send.ok, `turn.send 失败：${JSON.stringify(send.error)}`);
  assert(typeof send.data?.turnId === "string" && send.data.turnId.length > 0, "turn.send 未返回 turnId");
  const terminal = await c.waitEvent(
    sessionId,
    (ev) => ev.type === "stats" || ev.type === "turn.aborted",
    TURN_TIMEOUT_MS,
    "turn 终态(stats/turn.aborted)",
    marker,
  );
  await sleep(50);
  return captureTurn(c, sessionId, marker, prompt, clientId, send, t0, terminal);
}

const PNG_1X1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makePngOfDecodedSize(bytes: number): string {
  const buf = Buffer.concat([PNG_SIG, Buffer.alloc(Math.max(0, bytes - PNG_SIG.length), 0x00)]);
  return buf.toString("base64");
}

async function main(): Promise<number> {
  const startedAt = nowIso();
  section(`P0 发现 + 握手（runId=${RUN_ID}）`);
  const ctx: {
    c1?: Client;
    c3?: Client;
    c4?: Client;
    c5?: Client;
    sidA?: string;
    sidB?: string;
    titleA?: string;
    oldSid?: string;
    snapA?: any;
    lastSeqB?: number;
  } = {};

  ctx.c1 = await probe("P0", "读 core.json/token + WS 子协议握手 + ready 帧", async () => {
    const d = loadDiscovery();
    runState.discovery = d;
    const c1 = new Client("c1", d.url, d.token);
    await c1.connect();
    runState.clients.push(c1);
    const ready = c1.ready;
    assert(ready && ready.kind === "ready", "首帧不是 ready");
    assert(ready.v === 1, `ready.v=${String(ready.v)}`);
    assert(ready.user?.id === "local", `ready.user.id=${String(ready.user?.id)}`);
    assert(ready.user?.role === "owner", `ready.user.role=${String(ready.user?.role)}`);
    const caps: string[] = Array.isArray(ready.capabilities) ? ready.capabilities : [];
    assert(caps.includes("sessions"), `capabilities 缺 sessions：${JSON.stringify(caps)}`);
    for (const need of ["attachments.image", "transcript.replay", "snapshot.live", "activity", "command.structured"]) {
      assert(caps.includes(need), `capabilities 缺 ${need}`);
    }
    const hasSessionId = Object.prototype.hasOwnProperty.call(ready, "sessionId");
    const hasEpoch = Object.prototype.hasOwnProperty.call(ready, "epoch");
    assert(!hasSessionId && !hasEpoch, "Hub 模式 ready 不应带 sessionId/epoch（会误导客户端当单会话）");
    const protoOk = ready.protocolVersion === "1.2";
    return {
      detail: `url=${d.url} pid=${d.pid} core=${String(ready.coreVersion)} proto=${String(ready.protocolVersion)} caps=${caps.length} ready.sessionId=缺省`,
      data: {
        url: d.url,
        coreVersion: ready.coreVersion,
        protocolVersion: ready.protocolVersion,
        protocolVersionExpected: "1.2",
        protocolVersionMatch: protoOk,
        capabilities: caps,
        user: ready.user,
        readyKeys: Object.keys(ready),
        tokenFile: d.tokenFile,
      },
      value: c1,
    };
  });
  const c1 = ctx.c1;
  if (!c1) {
    note("P0", "无连接，后续全部跳过", "握手失败，终止");
    return finish(startedAt);
  }
  if (ctx.c1 && (ctx.c1.ready?.protocolVersion !== "1.2")) {
    note("P0b", "protocolVersion 与文档 1.2 不一致", `实测 ${String(ctx.c1.ready?.protocolVersion)}（protocol-v1.md 锁 1.2）`);
  }

  /* ---------------- P1: create/attach 语义 ---------------- */
  section("P1 session.create 带/不带 title 与 attach");
  await probe("P1", "session.create(title) → 立即 attach 成功；create(无 title) → attach not_found", async () => {
    const createA = await c1.request({ type: "session.create", title: TITLE_A }, 30_000);
    assert(createA.ok, `session.create(title) 失败：${JSON.stringify(createA.error)}`);
    const sidA = String(createA.data?.sessionId ?? "");
    assert(sidA.length > 0, "create 未返回 sessionId");
    ctx.sidA = trackSession(sidA);
    ctx.titleA = TITLE_A;
    const fileA = sessionFile(sidA);
    const fileAExists = existsSync(fileA);

    const attachA = await c1.attach(sidA);
    assert(attachA.result.ok, `带 title 会话 attach 失败：${JSON.stringify(attachA.result.error)}`);
    assert(attachA.result.data?.role === "owner", `attach role=${String(attachA.result.data?.role)}`);
    assert(attachA.snapshot, "attach 未收到 snapshot 帧");
    ctx.snapA = attachA.snapshot;

    // 带 title 的会话：rename 已让 durable session.meta 落 transcript，fetch 首条应为 session.meta seq 1。
    const tA = await c1.request({ type: "transcript.fetch", sessionId: sidA, fromSeq: 1, limit: 3 }, 10_000);
    const tAFirst = tA.data?.events?.[0] ?? null;

    const createB = await c1.request({ type: "session.create" }, 30_000);
    assert(createB.ok, `session.create() 失败：${JSON.stringify(createB.error)}`);
    const sidB = String(createB.data?.sessionId ?? "");
    assert(sidB.length > 0, "create() 未返回 sessionId");
    ctx.sidB = trackSession(sidB);
    const fileB = sessionFile(sidB);
    const fileBBefore = existsSync(fileB);
    await sleep(150);
    const fileBAfterWait = existsSync(fileB);

    // c1 已绑定 A，无法再 attach；用一条干净连接验证「无 title → attach not_found」。
    const cB = await newClient("cB");
    const attachB = await cB.request({ type: "session.attach", sessionId: sidB }, 20_000);
    assert(!attachB.ok, `无 title 会话 attach 竟然成功（文件=${String(fileBAfterWait)}）`);
    assert(attachB.error?.code === "not_found", `期望 not_found，实际 ${JSON.stringify(attachB.error)}`);

    const closeB = await cB.request({ type: "session.close", sessionId: sidB }, 20_000);
    assert(closeB.ok, `关闭无 title 会话失败：${JSON.stringify(closeB.error)}`);
    cB.close();
    let fileBAfterClose = false;
    for (let i = 0; i < 30; i += 1) {
      if (existsSync(fileB)) {
        fileBAfterClose = true;
        break;
      }
      await sleep(100);
    }
    return {
      detail: `title→attach ok（文件=${fileAExists}）；无 title→attach ${String(attachB.error?.code)}（创建后/150ms 后文件存在=${fileBBefore}/${fileBAfterWait}，close 后=${fileBAfterClose}）`,
      data: {
        sidA,
        sidB,
        createALatencyMs: createA.latencyMs,
        fileAExistsOnCreateReply: fileAExists,
        createBLatencyMs: createB.latencyMs,
        fileBExistsOnCreateReply: fileBBefore,
        fileBExistsAfter150ms: fileBAfterWait,
        attachBError: attachB.error,
        closeBLatencyMs: closeB.latencyMs,
        fileBExistsAfterClose: fileBAfterClose,
        transcriptAFirst: tAFirst,
        attachASnapshotKeys: Object.keys(attachA.snapshot ?? {}),
        attachAMeta: attachA.snapshot?.meta,
        attachASeq: attachA.snapshot?.seq,
        attachAEpoch: attachA.snapshot?.epoch,
        attachABlocks: Array.isArray(attachA.snapshot?.blocks) ? attachA.snapshot.blocks.length : null,
        attachAContext: attachA.snapshot?.context,
        attachALastTurn: attachA.snapshot?.lastTurn ?? null,
        attachALive: attachA.snapshot?.live ?? null,
      },
    };
  });

  /* ---------------- P2: session.list ---------------- */
  section("P2 session.list 形状与占位值");
  const listState = await probe<{ count: number; working: number }>("P2", "session.list 返回磁盘会话（title/provider/tier/mode 占位）", async () => {
    const res = await c1.request({ type: "session.list" }, 20_000);
    assert(res.ok, `session.list 失败：${JSON.stringify(res.error)}`);
    const sessions: any[] = res.data?.sessions ?? [];
    assert(Array.isArray(sessions) && sessions.length >= 50, `期望 >=50 条磁盘会话，实际 ${sessions.length}`);
    const sidA = ctx.sidA;
    const sidB = ctx.sidB;
    const entryA = sessions.find((s) => s.id === sidA);
    const entryB = sessions.find((s) => s.id === sidB);
    assert(entryA, "带 title 的会话未出现在 session.list");
    assert(entryB, "close 落盘后的无 title 会话未出现在 session.list");
    assert(entryA.title !== TITLE_A, `list.title 不应等于真实 title（占位值），实际 ${JSON.stringify(entryA.title)}`);
    assert(entryA.tier === "default", `list.tier 期望 default，实际 ${String(entryA.tier)}`);
    assert(entryA.provider === "", `list.provider 期望 ""，实际 ${String(entryA.provider)}`);
    assert(entryA.mode === "ask", `list.mode 期望 ask，实际 ${String(entryA.mode)}`);
    assert(entryA.status === "working", `worker 存活时 list.status 期望 working，实际 ${String(entryA.status)}`);
    const working = sessions.filter((s) => s.status === "working").length;
    const statusCounts: Record<string, number> = {};
    for (const s of sessions) statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;
    const keys = Object.keys(sessions[0] ?? {});
    return {
      detail: `count=${sessions.length} working=${working} (${JSON.stringify(statusCounts)}) title占位=${JSON.stringify(entryA.title)} tier/provider/mode=${entryA.tier}/${entryA.provider}/${entryA.mode}`,
      data: {
        count: sessions.length,
        statusCounts,
        sample: sessions.slice(0, 2),
        entryA,
        entryB,
        sessionMetaKeys: keys,
        ownerIdValues: [...new Set(sessions.map((s) => s.ownerId))],
      },
      value: { count: sessions.length, working },
    };
  });

  /* ---------------- P3: attach 已有磁盘会话（resume） ---------------- */
  section("P3 attach 已有磁盘会话（resume 拉起 worker）");
  await probe("P3", "选一条历史零 turn 磁盘会话 attach（resume），记录耗时与 snapshot 形状", async () => {
    if (!listState) skip("P2 未拿到会话列表");
    const list = (await c1.request({ type: "session.list" })).data?.sessions as any[];
    const candidates = list
      .filter((s) => s.id !== ctx.sidA && s.id !== ctx.sidB && s.status !== "working")
      .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));
    let picked: any = null;
    for (const cand of candidates.slice(0, 6)) {
      try {
        const file = readJson(sessionFile(cand.id)) as { meta?: { turns?: number } };
        if ((file.meta?.turns ?? -1) === 0) {
          picked = cand;
          break;
        }
      } catch {
        /* 跳过损坏 */
      }
    }
    if (!picked) picked = candidates[0];
    if (!picked) skip("没有可 attach 的历史磁盘会话");
    ctx.oldSid = picked.id;
    const c2 = await newClient("c2");
    const t0 = performance.now();
    const attach = await c2.attach(picked.id);
    const wall = Math.round(performance.now() - t0);
    assert(attach.result.ok, `resume attach 失败：${JSON.stringify(attach.result.error)}`);
    const snap = attach.snapshot;
    assert(snap && snap.meta?.id === picked.id, "snapshot.meta.id 不匹配");
    assert(typeof snap.seq === "number" && typeof snap.epoch === "string", "snapshot 缺 seq/epoch");
    assert(Array.isArray(snap.blocks), "snapshot.blocks 不是数组");
    const seqs = (await c2.request({ type: "transcript.fetch", sessionId: picked.id, fromSeq: 1, limit: 5 })).data;
    const healthAttached = await fetchHealth();
    await c2.detach();
    const healthDetached = await fetchHealth();
    const listAfter = (await c2.request({ type: "session.list" })).data?.sessions as any[];
    const after = listAfter.find((s) => s.id === picked.id);
    note(
      "P3b",
      "detach 不回收 worker；session.list.status 还有缓存滞后",
      `health.sessions ${healthAttached}（attach 后）→ ${healthDetached}（detach 后，worker 未回收）；该会话 list.status=${String(after?.status)}（metaCache 按文件 mtime 缓存，status 可能滞后）`,
      { healthAttached, healthDetached, afterDetachEntry: after },
    );
    c2.close();
    return {
      detail: `resume ${picked.id} 耗时 ${wall}ms（result=${attach.result.latencyMs}ms），blocks=${snap.blocks.length} seq=${snap.seq}`,
      data: {
        sessionId: picked.id,
        pickedFromList: picked,
        wallMs: wall,
        resultLatencyMs: attach.result.latencyMs,
        snapshot: {
          keys: Object.keys(snap),
          meta: snap.meta,
          seq: snap.seq,
          epoch: snap.epoch,
          blockCount: snap.blocks.length,
          blockKinds: [...new Set(snap.blocks.map((b: any) => b.kind))],
          context: snap.context,
          lastTurn: snap.lastTurn ?? null,
          live: snap.live ?? null,
          pendingApprovalId: snap.pendingApprovalId ?? null,
        },
        transcriptFirstPage: seqs,
        healthAfterAttach: healthAttached,
        healthAfterDetach: healthDetached,
        listEntryAfterDetach: after,
      },
    };
  });

  /* ---------------- P4: 单连接绑定语义 ---------------- */
  section("P4 单连接绑定 / 未 attach 行为 / 单客户端");
  ctx.c3 = await newClient("c3");
  const c3 = ctx.c3;
  const settingsView = await probe<any>("P4", "已 attach A 再 attach B → conflict；detach 后 attach B → ok；未 attach 命令多 conflict（settings.get 例外）", async () => {
    const sidA = ctx.sidA;
    const sidB = ctx.sidB;
    if (!sidA || !sidB) skip("P1 未创建 A/B 会话");
    // c1 当前绑定 A
    const attachOther = await c1.request({ type: "session.attach", sessionId: sidB }, 20_000);
    assert(!attachOther.ok && attachOther.error?.code === "conflict", `已绑定 A 时 attach B 期望 conflict，实际 ${JSON.stringify(attachOther)}`);
    const detachA = await c1.detach(sidA);
    assert(detachA.ok, `detach A 失败：${JSON.stringify(detachA.error)}`);
    const attachB = await c1.attach(sidB);
    assert(attachB.result.ok, `detach 后 attach B 失败：${JSON.stringify(attachB.result.error)}`);
    // 第三连接抢同一个会话 → conflict
    const c3Attach = await c3.request({ type: "session.attach", sessionId: sidB }, 20_000);
    assert(!c3Attach.ok && c3Attach.error?.code === "conflict", `第二客户端 attach 期望 conflict，实际 ${JSON.stringify(c3Attach)}`);
    // 第三连接未 attach：转发类命令一律 conflict
    const unattached: Record<string, any> = {};
    unattached["turn.send"] = await c3.request({ type: "turn.send", sessionId: sidB, text: "x", clientId: randomUUID() });
    unattached["transcript.fetch"] = await c3.request({ type: "transcript.fetch", sessionId: sidB, fromSeq: 1 });
    unattached["command.run"] = await c3.request({ type: "command.run", name: "help", args: [] });
    unattached["mode.set"] = await c3.request({ type: "mode.set", sessionId: sidB, mode: "ask" });
    unattached["session.rename"] = await c3.request({ type: "session.rename", sessionId: sidB, title: "x" });
    unattached["usage.summary"] = await c3.request({ type: "usage.summary", range: "session", sessionId: sidB });
    for (const [name, r] of Object.entries(unattached)) {
      assert(!r.ok && r.error?.code === "conflict", `未 attach 的 ${name} 期望 conflict，实际 ${JSON.stringify(r)}`);
    }
    // 唯一例外：settings.get
    const settings = await c3.request({ type: "settings.get" });
    assert(settings.ok, `未 attach 的 settings.get 期望 ok，实际 ${JSON.stringify(settings.error)}`);
    const sv = settings.data?.settings;
    assert(sv && Array.isArray(sv.providers) && sv.providers.length > 0, "settings.providers 缺失");
    const mask = String(sv.providers[0]?.apiKeyMask ?? "");
    assert(mask.includes("…"), `apiKeyMask 期望掩码（含…），实际 ${JSON.stringify(mask)}`);
    // c1 detach 后 c3 才能接管
    const detachB = await c1.detach(sidB);
    assert(detachB.ok, "c1 detach B 失败");
    const c3Attach2 = await c3.attach(sidB);
    assert(c3Attach2.result.ok, `c1 detach 后 c3 attach B 失败：${JSON.stringify(c3Attach2.result.error)}`);
    const resumeEmpty = {
      seq: c3Attach2.snapshot?.seq,
      blocks: c3Attach2.snapshot?.blocks?.length,
      epoch: c3Attach2.snapshot?.epoch,
      kinds: [...new Set((c3Attach2.snapshot?.blocks ?? []).map((b: any) => b.kind))],
    };
    // 同一连接重复 attach 同一会话 → 幂等 ok（不再是 conflict）
    const reattach = await c3.request({ type: "session.attach", sessionId: sidB }, 20_000);
    assert(reattach.ok, `同一连接重复 attach 期望 ok，实际 ${JSON.stringify(reattach.error)}`);
    // 改个名字：无 title 会话此前没有任何 durable 事件，rename 会写入首个 session.meta(seq 1)
    const rename = await c3.request({ type: "session.rename", sessionId: sidB, title: TITLE_B }, 10_000);
    assert(rename.ok, `rename 失败：${JSON.stringify(rename.error)}`);
    const metaEv = await c3.waitEvent(sidB, (ev) => ev.type === "session.meta", 5000, "session.meta", c3.frames.length - 20);
    // 转发类命令的显式 sessionId 被忽略：绑定 B 时传 A 的 id，仍返回 B 的 transcript。
    const wrongTarget = await c3.request({ type: "transcript.fetch", sessionId: sidA, fromSeq: 1, limit: 3 }, 10_000);
    assert(wrongTarget.ok, "绑定 B 时 transcript.fetch(A) 期望 ok（显式 sessionId 被忽略）");
    assert(wrongTarget.data?.events?.length > 0, "绑定 B 的 transcript 不应为空（rename 后有 session.meta）");
    assert(wrongTarget.data?.events?.[0]?.event?.meta?.id === sidB, `显式 sessionId 未被忽略（返回 ${JSON.stringify(wrongTarget.data?.events?.[0]?.event?.meta?.id)}）`);
    // attach 之后 settings.get 会被转发到 worker（仍然 ok）
    const settingsAttached = await c3.request({ type: "settings.get" }, 10_000);
    assert(settingsAttached.ok, "attach 后 settings.get 期望 ok");
    // close 的显式 sessionId **不**被绑定忽略：c3 绑定 B，close A（A 无 owner）→ ok。
    const closeForeignButUnowned = await c3.request({ type: "session.close", sessionId: sidA }, 20_000);
    assert(closeForeignButUnowned.ok, `close 显式 sessionId 期望 ok（仅 owner 检查），实际 ${JSON.stringify(closeForeignButUnowned.error)}`);
    return {
      detail: `A 上 attach B→conflict；detach→attach ok；第二连接 attach→conflict；未 attach 的 6 类命令→conflict；settings.get→ok（掩码 ${mask.length} 字符）；重复 attach→ok；rename→ok`,
      data: {
        attachOtherError: attachOther.error,
        detachAOk: detachA.ok,
        attachBOk: attachB.result.ok,
        secondClientAttachError: c3Attach.error,
        unattachedErrors: Object.fromEntries(Object.entries(unattached).map(([k, v]) => [k, (v as any).error])),
        settingsGetRawKeys: sv ? Object.keys(sv) : null,
        settingsProvidersSample: sv?.providers?.[0],
        settingsFirstProviderMask: mask,
        reattachSameClientOk: reattach.ok,
        resumeEmptySnapshot: resumeEmpty,
        wrongTargetTranscript: { ok: wrongTarget.ok, firstSeq: wrongTarget.data?.events?.[0]?.seq, firstMetaId: wrongTarget.data?.events?.[0]?.event?.meta?.id },
        settingsGetAfterAttachOk: settingsAttached.ok,
        renameOk: rename.ok,
        renameMetaEvent: metaEv?.event?.meta ?? null,
        closeForeignUnownedOk: closeForeignButUnowned.ok,
      },
      value: sv,
    };
  });
  if (settingsView) {
    runState.evidence["settingsViewSample"] = {
      defaultProvider: settingsView.defaultProvider,
      defaultTier: settingsView.defaultTier,
      routes: settingsView.routes,
      providerMask: settingsView.providers?.[0]?.apiKeyMask,
      shell: settingsView.shell,
      memory: settingsView.memory,
    };
  }

  /* ---------------- P6: command.run ---------------- */
  section("P6 command.run：/help /tier /compact /clear /nope 的 result.data 与事件");
  await probe("P6", "command.run 4 个已知命令 + 1 个未知命令", async () => {
    const sidB = ctx.sidB;
    if (!sidB || !ctx.c3) skip("P4 未完成（c3/B 未就绪）");
    const c = ctx.c3!;
    const suite: { name: string; args: string[] }[] = [
      { name: "help", args: [] },
      { name: "tier", args: [] },
      { name: "compact", args: [] },
      { name: "clear", args: [] },
      { name: "nope", args: [] },
      { name: "tier", args: ["fast"] },
      { name: "tier", args: ["default"] },
    ];
    const results: any[] = [];
    for (const item of suite) {
      const marker = c.frames.length;
      const res = await c.request({ type: "command.run", name: item.name, args: item.args }, 60_000);
      await sleep(120);
      const evs = c.eventsSince(marker, sidB).map(evSummary);
      const commandResultEv = evs.find((e) => e.type === "command.result");
      results.push({
        name: item.name,
        args: item.args,
        requestOk: res.ok,
        resultLatencyMs: res.latencyMs,
        dataKeys: res.data ? Object.keys(res.data) : null,
        ok: res.data?.ok,
        blocks: res.data?.blocks,
        changes: res.data?.changes,
        error: res.data?.error,
        events: evs.map((e) => e.type),
        commandResultEvent: commandResultEv?.event ?? null,
      });
      if (item.name === "nope") {
        assert(res.ok, "未知命令的 result 帧本身应 ok:true（错误在 data.ok=false 里）");
        assert(res.data?.ok === false, "/nope data.ok 期望 false");
        assert(res.data?.error?.code === "unsupported", `/nope error.code=${String(res.data?.error?.code)}`);
      } else {
        assert(res.ok && res.data?.ok === true, `/${item.name} 期望 data.ok=true，实际 ${JSON.stringify(res.data)}`);
      }
      if (item.name === "help") {
        assert(res.data?.blocks?.[0]?.kind === "markdown", "/help 首块期望 markdown");
        assert(String(res.data.blocks[0].text).includes("## Matrix-Core 命令"), "/help 文本不含标题");
      }
      if (item.name === "tier" && item.args.length > 0) {
        assert(res.data?.changes?.tier === item.args[0], `/tier ${item.args[0]} changes.tier 不匹配`);
      }
    }
    return {
      detail: `help=${JSON.stringify(results[0].dataKeys)}；tier查询 changes=${JSON.stringify(results[1].changes)}；clear 事件=${JSON.stringify(results[3].events)}；nope error=${JSON.stringify(results[4].error)}`,
      data: { suite: results },
    };
  });

  /* ---------------- P7: transcript.fetch 分页 ---------------- */
  section("P7 transcript.fetch 分页 / seq 边界");
  await probe("P7", "fromSeq/limit/nextSeq 语义 + 首条事件 + seq 连续性", async () => {
    const sidB = ctx.sidB;
    if (!sidB || !ctx.c3) skip("P4 未完成");
    const c = ctx.c3!;
    const full = await c.request({ type: "transcript.fetch", sessionId: sidB, limit: 1000 }, 20_000);
    assert(full.ok, `transcript.fetch 失败：${JSON.stringify(full.error)}`);
    const evs: any[] = full.data?.events ?? [];
    assert(evs.length > 0, "transcript 为空（应有 session.meta/command.result 等 durable 事件）");
    assert(evs[0].seq === 1, `首条事件 seq 期望 1，实际 ${String(evs[0]?.seq)}`);
    const firstType = evs[0]?.event?.type;
    assert(firstType === "session.meta", `首条 durable 事件期望 session.meta，实际 ${String(firstType)}`);
    const seqs = evs.map((e) => e.seq);
    for (let i = 1; i < seqs.length; i += 1) assert(seqs[i] === seqs[i - 1] + 1, `seq 断层 ${seqs[i - 1]} → ${seqs[i]}`);
    assert(full.data?.nextSeq === undefined, `limit=1000 覆盖全部时不应有 nextSeq，实际 ${JSON.stringify(full.data?.nextSeq)}`);

    const page1 = await c.request({ type: "transcript.fetch", sessionId: sidB, fromSeq: 1, limit: 3 });
    const page1evs = page1.data?.events ?? [];
    assert(page1evs.length === 3, `limit=3 期望 3 条，实际 ${page1evs.length}`);
    assert(page1.data?.nextSeq === page1evs[2].seq + 1, `nextSeq 期望 ${page1evs[2].seq + 1}，实际 ${String(page1.data?.nextSeq)}`);
    const page2 = await c.request({ type: "transcript.fetch", sessionId: sidB, fromSeq: page1.data?.nextSeq, limit: 3 });
    assert(page2.data?.events?.[0]?.seq === page1.data?.nextSeq, "fromSeq 应为闭区间（含 fromSeq）");
    const tail = await c.request({ type: "transcript.fetch", sessionId: sidB, fromSeq: 1_000_000, limit: 5 });
    assert(tail.ok && (tail.data?.events ?? []).length === 0 && tail.data?.nextSeq === undefined, "超出末尾期望空数组且无 nextSeq");
    const zero = await c.request({ type: "transcript.fetch", sessionId: sidB, fromSeq: 0, limit: 0 });
    assert(zero.data?.events?.length === 1 && zero.data.events[0].seq === 1, "fromSeq=0/limit=0 期望收敛到 1/1（含闭区间）");
    const cap = await c.request({ type: "transcript.fetch", sessionId: sidB, limit: 10_000 });
    assert((cap.data?.events ?? []).length === Math.min(1000, seqs.length), "limit>1000 应被截到 1000");
    // 逐页翻完，验证无重无漏
    const collected: number[] = [];
    let from: number | undefined = 1;
    for (let guard = 0; guard < 100; guard += 1) {
      const page = await c.request({ type: "transcript.fetch", sessionId: sidB, fromSeq: from, limit: 2 });
      const got = (page.data?.events ?? []).map((e: any) => e.seq);
      collected.push(...got);
      if (page.data?.nextSeq === undefined) break;
      from = page.data.nextSeq;
    }
    assert(JSON.stringify(collected) === JSON.stringify(seqs), `逐页收集（${collected.length}）与全量（${seqs.length}）不一致`);
    return {
      detail: `首条=${String(firstType)} seq=1..${seqs.length} 连续；nextSeq=${String(page1.data?.nextSeq)} 闭区间；limit>1000→1000；末尾→[]；fromSeq=0/limit=0→1 条`,
      data: {
        totalEvents: evs.length,
        seqRange: [seqs[0], seqs[seqs.length - 1]],
        firstEvent: evs[0],
        eventTypes: evs.map((e) => e.event.type),
        page1: page1.data,
        page2: page2.data,
        tail: tail.data,
        zeroClamp: zero.data,
        capLength: (cap.data?.events ?? []).length,
        collectedContiguous: collected.length === seqs.length,
      },
    };
  });

  /* ---------------- P8: 真实 turn ---------------- */
  section("P8 真实 turn：事件序列 / 合批 / stats / activity");
  await probe("P8", "真实 turn #1（default 档、短回答）：事件序列 + stats 形状 + activity", async () => {
    const sidB = ctx.sidB;
    if (!sidB || !ctx.c3) skip("P4 未完成");
    if (NO_LLM) skip("--no-llm");
    const c = ctx.c3!;
    const cap = await runOneTurn(c, sidB, "只回复两个字：收到");
    assert(cap.terminal, "未收到 stats/turn.aborted");
    assert(cap.turnStart, "缺 turn.start 事件");
    assert(cap.turnStart.userText === cap.prompt, `turn.start.userText=${JSON.stringify(cap.turnStart.userText)}`);
    assert(cap.turnStart.clientId === cap.clientId, "turn.start 未回显 clientId");
    assert(cap.turnStart.source === "user", `turn.start.source=${String(cap.turnStart.source)}`);
    assert(cap.stats, "缺 stats 终态");
    assert(cap.assistantEnd, "缺 assistant.end（模型无输出？）");
    assert(typeof cap.assistantEnd.text === "string" && cap.assistantEnd.text.length > 0, "assistant.end.text 为空");
    assert(cap.stats.turnId === cap.sendResult.data.turnId, "stats.turnId 与 turn.send 返回不一致");
    assert(typeof cap.stats.durationMs === "number" && cap.stats.durationMs > 0, "stats.durationMs 非法");
    assert(typeof cap.stats.usage?.promptTokens === "number", "stats.usage 缺失");
    assert(cap.durableSeqCheck.ok, `durable seq 非连续：${cap.durableSeqCheck.gaps.join("; ")}`);
    assert(!("attachments" in (cap.turnStart ?? {})), "turn.start 意外带 attachments 字段");
    assert(cap.activities.length >= 1, "未收到 activity 帧（capabilities 广告了 activity）");
    ctx.lastSeqB = Math.max(...cap.eventList.map((e) => e.seq));
    return {
      detail: `${cap.elapsedMs}ms；事件 ${cap.eventList.length} 帧（${Object.keys(cap.eventTypes).join(",")}），delta ${cap.deltas.length} 帧/${cap.deltas.reduce((n, d) => n + d.chars, 0)} 字符；activity=${JSON.stringify(cap.activities.map((a: any) => a.phase))}；stats=${String(cap.stats.durationMs)}ms usage.prompt=${String(cap.stats.usage?.promptTokens)} tier=${String(cap.stats.tier)}`,
      data: {
        turnId: cap.sendResult.data?.turnId,
        terminalType: cap.terminal?.type,
        elapsedMs: cap.elapsedMs,
        eventTypes: cap.eventTypes,
        eventList: cap.eventList,
        deltas: { count: cap.deltas.length, chars: cap.deltas.reduce((n, d) => n + d.chars, 0), sizes: cap.deltas.map((d) => d.chars), gapsMs: cap.deltas.slice(1).map((d, i) => Math.round(d.at - cap.deltas[i]!.at)), seqs: [...new Set(cap.deltas.map((d) => d.seq))] },
        assistantEnd: { blockId: cap.assistantEnd.blockId, chars: String(cap.assistantEnd.text).length, text: cap.assistantEnd.text },
        reasoningEnd: cap.reasoningEnd,
        turnStart: cap.turnStart,
        stats: cap.stats,
        activities: cap.activities,
        deltaMatchesEnd: cap.deltaConcat.trim() === String(cap.assistantEnd.text).trim(),
        durableSeqCheck: cap.durableSeqCheck,
      },
    };
  });

  await probe("P8b", "真实 turn #2（/tier fast、要求约 150 字）：合批 vs 逐 token 流式特征", async () => {
    const sidB = ctx.sidB;
    if (!sidB || !ctx.c3) skip("P4 未完成");
    if (NO_LLM) skip("--no-llm");
    const c = ctx.c3!;
    const tierFast = await c.request({ type: "command.run", name: "tier", args: ["fast"] }, 30_000);
    assert(tierFast.ok && tierFast.data?.ok === true, `/tier fast 失败：${JSON.stringify(tierFast.data)}`);
    const cap = await runOneTurn(c, sidB, "请用大约 150 个汉字介绍 WebSocket 协议的核心机制（握手、帧、全双工）。不要调用任何工具，直接给答案。");
    const restore = await c.request({ type: "command.run", name: "tier", args: ["default"] }, 30_000);
    assert(cap.terminal?.type === "stats", `turn 终态=${String(cap.terminal?.type)}`);
    assert(cap.stats && cap.assistantEnd, "turn #2 缺 stats/assistant.end");
    assert(cap.durableSeqCheck.ok, `durable seq 非连续：${cap.durableSeqCheck.gaps.join("; ")}`);
    const endLen = String(cap.assistantEnd.text).length;
    const deltaChars = cap.deltas.reduce((n, d) => n + d.chars, 0);
    const deltaMatchesEnd = cap.deltaConcat.trim() === String(cap.assistantEnd.text).trim();
    const t0Abs = performance.now() - cap.elapsedMs;
    const termAt = cap.eventList.find((e) => e.type === "stats")?.at ?? cap.elapsedMs;
    const earlyDeltaFrames = cap.deltas.filter((d) => termAt - (d.at - t0Abs) > 200).length;
    const deltaOffsets = cap.deltas.map((d) => Math.round(d.at - t0Abs));
    assert(deltaChars > 0, "turn #2 没收到 assistant.delta（客户端只能靠 assistant.end 渲染）");
    assert(deltaMatchesEnd, `delta 拼接(${deltaChars}) !== assistant.end.text(${endLen})`);
    assert(restore.ok && restore.data?.ok === true, "/tier default 还原失败");
    ctx.lastSeqB = Math.max(...cap.eventList.map((e) => e.seq));
    return {
      detail: `${cap.elapsedMs}ms；回答 ${endLen} 字符，delta ${cap.deltas.length} 帧共 ${deltaChars} 字符（${JSON.stringify(cap.deltas.map((d) => d.chars))}），delta 到达偏移 ${JSON.stringify(deltaOffsets)}ms；earlyDeltaFrames=${earlyDeltaFrames}`,
      data: {
        elapsedMs: cap.elapsedMs,
        endTextChars: endLen,
        endTextSample: String(cap.assistantEnd.text).slice(0, 300),
        deltaFrameCount: cap.deltas.length,
        deltaChars,
        deltaSizes: cap.deltas.map((d) => d.chars),
        deltaArrivalOffsetsMs: deltaOffsets,
        assistantEndAtMs: termAt,
        deltaGapsMs: cap.deltas.slice(1).map((d, i) => Math.round(d.at - cap.deltas[i]!.at)),
        deltaMatchesEnd,
        eventTypes: cap.eventTypes,
        eventList: cap.eventList,
        stats: cap.stats,
        activities: cap.activities,
        durableSeqCheck: cap.durableSeqCheck,
      },
    };
  });

  await probe("P8c", "turn 进行中断线重连：snapshot.live / partial blocks / 事件续接", async () => {
    const sidB = ctx.sidB;
    if (!sidB || !ctx.c3) skip("P4 未完成");
    if (NO_LLM) skip("--no-llm");
    const c = ctx.c3!;
    // 用 fast 档制造能观测到 partial 的窗口
    const tierFast = await c.request({ type: "command.run", name: "tier", args: ["fast"] }, 30_000);
    assert(tierFast.ok && tierFast.data?.ok === true, `/tier fast 失败：${JSON.stringify(tierFast.data)}`);
    const prompt = "请分 5 点说明 WebSocket 与 HTTP 长轮询的区别，每点约 60 个汉字。不要调用任何工具，直接给答案。";
    const clientId = randomUUID();
    const send = await c.request({ type: "turn.send", sessionId: sidB, text: prompt, clientId }, 30_000);
    assert(send.ok, `turn.send 失败：${JSON.stringify(send.error)}`);
    // 等到第一个正文 delta 后立刻断线（模拟浏览器刷新/网络闪断）
    await c.waitEvent(sidB, (ev) => ev.type === "assistant.delta", 60_000, "第一个 assistant.delta", c.frames.length);
    c.close();
    await sleep(150);
    const c6 = await newClient("c6");
    const t0 = performance.now();
    const re = await c6.attach(sidB);
    const wall = Math.round(performance.now() - t0);
    assert(re.result.ok, `断线重连 attach 失败：${JSON.stringify(re.result.error)}`);
    const snap = re.snapshot;
    const live = snap?.live ?? null;
    assert(live && typeof live.turnId === "string", `snapshot.live 缺失（期望进行中轮的 partial 状态）：${JSON.stringify(live)}`);
    const partialAsst = live.assistant?.text ?? "";
    const terminal = await c6.waitEvent(sidB, (ev) => ev.type === "stats" || ev.type === "turn.aborted", TURN_TIMEOUT_MS, "turn 终态", 0);
    const statsEv = c6.eventsSince(0, sidB).map(evSummary).find((e) => e.type === "stats")?.event ?? null;
    const endEv = c6.eventsSince(0, sidB).map(evSummary).find((e) => e.type === "assistant.end")?.event ?? null;
    const restore = await c6.request({ type: "command.run", name: "tier", args: ["default"] }, 30_000);
    assert(terminal?.event?.type === "stats" || terminal?.event?.type === "turn.aborted", `重连后未收到终态：${String(terminal?.event?.type)}`);
    assert(statsEv, "重连后未收到 stats（轮末收口事件丢了）");
    ctx.c3 = c6; // 后续 P5 用这条已绑定 B 的连接
    ctx.lastSeqB = statsEv ? (c6.frames.filter((r) => r.frame.kind === "event" && r.frame.sessionId === sidB).map((r) => r.frame.seq as number).reduce((a, b) => Math.max(a, b), 0)) : ctx.lastSeqB;
    return {
      detail: `首个 delta 后断开→重连 attach ${wall}ms；snapshot.live.turnId=${String(live.turnId)} partial正文 ${partialAsst.length} 字符；重连后收到 ${String(statsEv ? "stats" : "")}${endEv ? "/assistant.end" : ""}；块 ${snap.blocks.length}（kinds=${JSON.stringify([...new Set(snap.blocks.map((b: any) => b.kind))])}）`,
      data: {
        disconnectAfterFirstDelta: true,
        resumeAttachWallMs: wall,
        snapshotKeys: Object.keys(snap ?? {}),
        live,
        partialAssistantChars: partialAsst.length,
        snapshotSeq: snap?.seq,
        snapshotBlockCount: snap?.blocks?.length,
        snapshotBlockKinds: [...new Set((snap?.blocks ?? []).map((b: any) => b.kind))],
        terminalType: terminal?.event?.type ?? null,
        stats: statsEv,
        assistantEndAfterReconnect: endEv ? { blockId: endEv.blockId, chars: String(endEv.text ?? "").length } : null,
        restoreTierDefaultOk: restore.ok && restore.data?.ok === true,
      },
    };
  });

  /* ---------------- P5: close / resume ---------------- */
  section("P5 session.close / owner 权限 / close 后 attach resume");
  await probe("P5", "owner close、非 owner close→forbidden、detach 后 close、close 后 attach 恢复历史", async () => {
    const sidB = ctx.sidB;
    if (!sidB || !ctx.c3) skip("P4 未完成");
    const c = ctx.c3!;
    ctx.c4 = await newClient("c4");
    const c4 = ctx.c4;
    const attachC4 = await c4.request({ type: "session.attach", sessionId: sidB }, 20_000);
    assert(!attachC4.ok && attachC4.error?.code === "conflict", `c3 占用时 c4 attach 期望 conflict，实际 ${JSON.stringify(attachC4.error)}`);
    const closeByOther = await c4.request({ type: "session.close", sessionId: sidB }, 20_000);
    assert(!closeByOther.ok && closeByOther.error?.code === "forbidden", `非 owner close 期望 forbidden，实际 ${JSON.stringify(closeByOther.error)}`);
    const beforeClose = await c.request({ type: "transcript.fetch", sessionId: sidB, limit: 1000 }, 20_000);
    const beforeCloseEvents: any[] = beforeClose.data?.events ?? [];
    const seqBeforeClose = beforeCloseEvents.at(-1)?.seq ?? 0;

    const closeOwner = await c.request({ type: "session.close", sessionId: sidB }, 20_000);
    assert(closeOwner.ok, `owner close 失败：${JSON.stringify(closeOwner.error)}`);
    const listAfterClose = (await c4.request({ type: "session.list" })).data?.sessions as any[];
    const entryAfterClose = listAfterClose.find((s) => s.id === sidB);
    assert(entryAfterClose, "close 后会话文件应保留（应仍在 list 中）");
    assert(entryAfterClose.status === "idle", `close 后 worker 应退出（status 期望 idle），实际 ${String(entryAfterClose.status)}`);

    const t0 = performance.now();
    const reattach = await c4.attach(sidB);
    const wall = Math.round(performance.now() - t0);
    assert(reattach.result.ok, `close 后 attach 期望 resume 成功，实际 ${JSON.stringify(reattach.result.error)}`);
    const snap = reattach.snapshot;
    assert(snap && Array.isArray(snap.blocks), "resume 后 snapshot.blocks 缺失");
    const kinds = [...new Set(snap.blocks.map((b: any) => b.kind))];
    const hasUser = snap.blocks.some((b: any) => b.kind === "user");
    const hasAssistant = snap.blocks.some((b: any) => b.kind === "assistant");
    const hasStats = snap.blocks.some((b: any) => b.kind === "stats");
    assert(snap.blocks.length > 0, `resume 后应恢复历史块（至少命令产生的 tierline/banner），实际 kinds=${JSON.stringify(kinds)}`);
    if (!NO_LLM) {
      assert(hasUser && hasAssistant && hasStats, `resume 后应恢复 turn 历史（user/assistant/stats），实际 kinds=${JSON.stringify(kinds)}`);
    }
    assert(typeof snap.seq === "number" && snap.seq === seqBeforeClose, `resume seq ${String(snap.seq)} ≠ close 前最后 seq ${seqBeforeClose}`);
    note(
      "P5b",
      "close→resume 不新增 durable seq，seq/epoch 保持连续",
      `close 前 transcript 最后 seq=${seqBeforeClose}，resume 快照 seq=${String(snap.seq)}，epoch=${String(snap.epoch)}`,
      { seqBeforeClose, resumedSeq: snap.seq, resumedEpoch: snap.epoch },
    );
    const hist = await c4.request({ type: "transcript.fetch", sessionId: sidB, limit: 1000 });
    const histTypes = (hist.data?.events ?? []).map((e: any) => e.event.type);
    assert(histTypes.includes("session.meta") && histTypes.includes("command.result"), "resume 后 transcript 应包含 durable 历史（session.meta/command.result）");
    if (!NO_LLM) assert(histTypes.includes("turn.start") && histTypes.includes("stats"), "resume 后 transcript 应包含 turn.start/stats");

    const detachC4 = await c4.detach(sidB);
    assert(detachC4.ok, "detach 失败");
    const closeAfterDetach = await c4.request({ type: "session.close", sessionId: sidB }, 20_000);
    assert(closeAfterDetach.ok, `detach 后 close 期望 ok，实际 ${JSON.stringify(closeAfterDetach.error)}`);
    const closeAgain = await c4.request({ type: "session.close", sessionId: sidB }, 20_000);
    assert(closeAgain.ok, "重复 close 应幂等 ok");
    const closeUnknown = await c4.request({ type: "session.close", sessionId: `${RUN_ID}-does-not-exist` }, 20_000);
    assert(closeUnknown.ok, "close 不存在的 id 实测返回 ok（幂等 no-op）");
    return {
      detail: `非owner close→forbidden；owner close ok（${closeOwner.latencyMs}ms）→list status idle；resume attach ${wall}ms（seq ${seqBeforeClose}→${snap.seq}，blocks=${snap.blocks.length} kinds=${JSON.stringify(kinds)}）；detach 后 close ok；重复 close ok；close 未知 id ok`,
      data: {
        conflictAttachError: attachC4.error,
        closeByOtherError: closeByOther.error,
        closeOwnerLatencyMs: closeOwner.latencyMs,
        entryAfterClose,
        seqBeforeClose,
        transcriptLastEventBeforeClose: beforeCloseEvents.at(-1) ?? null,
        resumeWallMs: wall,
        resumeResultLatencyMs: reattach.result.latencyMs,
        resumedSnapshot: {
          keys: Object.keys(snap),
          seq: snap.seq,
          epoch: snap.epoch,
          blockCount: snap.blocks.length,
          blockKinds: kinds,
          blockSamples: snap.blocks.slice(0, 4),
          meta: snap.meta,
          lastTurn: snap.lastTurn ?? null,
        },
        transcriptEventTypes: histTypes,
        detachAfterCloseOk: closeAfterDetach.ok,
        closeAgainOk: closeAgain.ok,
        closeUnknownIdOk: closeUnknown.ok,
        closeUnknownIdData: closeUnknown.data,
        closeOwnerData: closeOwner.data,
      },
    };
  });

  /* ---------------- P9: 附件 ---------------- */
  section("P9 附件（1 张 png / 非图片 mime / >5 张 / >5MB / magic 不符 / 非法 base64）");
  await probe("P9", "turn.send attachments 各类边界", async () => {
    const sidB = ctx.sidB;
    if (!sidB || !ctx.c4) skip("P5 未完成");
    const c = ctx.c4;
    // 重新 attach B 用于发送
    const re = await c.attach(sidB);
    if (!re.result.ok) {
      // B 在 P5 末尾被 close 且 c4 detach 了，这里 attach 会 resume
      skip(`重新 attach 失败：${JSON.stringify(re.result.error)}`);
    }
    const runs: any[] = [];

    // 1) 合法 1x1 PNG：开一条真实 turn（模型可能拒绝 image_url，重点看协议是否收下 + 附件是否回传元数据）
    if (NO_LLM) {
      runs.push({ case: "1x1 png", skipped: "--no-llm" });
    } else {
      const marker = c.frames.length;
      const clientId = randomUUID();
      const t0 = performance.now();
      const send = await c.request(
        { type: "turn.send", sessionId: sidB, text: "只回复一个字：好", clientId, attachments: [{ kind: "image", mime: "image/png", dataBase64: PNG_1X1_B64 }] },
        30_000,
      );
      let terminal: any = null;
      if (send.ok) {
        terminal = await c.waitEvent(sidB, (ev) => ev.type === "stats" || ev.type === "turn.aborted", TURN_TIMEOUT_MS, "附件 turn 终态", marker);
        await sleep(50);
      }
      const evs = c.eventsSince(marker, sidB).map(evSummary);
      const turnStart = evs.find((e) => e.type === "turn.start")?.event ?? null;
      const stats = evs.find((e) => e.type === "stats")?.event ?? null;
      const attachDir = join(sessionsDir(), "attachments", sidB);
      const files = existsSync(attachDir) ? readdirSync(attachDir) : [];
      runs.push({
        case: "1x1 png",
        sendOk: send.ok,
        turnId: send.data?.turnId,
        error: send.error,
        terminalType: terminal?.event?.type,
        elapsedMs: Math.round(performance.now() - t0),
        turnStart,
        stats,
        hasAttachmentMeta: turnStart ? "attachments" in turnStart : null,
        attachmentFilesOnDisk: files,
      });
      if (send.ok) {
        assert(!turnStart || !("attachments" in turnStart), "turn.start 不应有 attachments 字段（v0.0.2 不回传附件元数据）");
        assert(files.length >= 1, "合法图片应落盘到 ~/.neo/sessions/attachments/<sid>/");
      }
    }

    // 2) >5 张（6 张 1x1）
    {
      const many = Array.from({ length: 6 }, () => ({ kind: "image", mime: "image/png", dataBase64: PNG_1X1_B64 }));
      const res = await c.request({ type: "turn.send", sessionId: sidB, text: "x", clientId: randomUUID(), attachments: many }, 30_000);
      assert(!res.ok && res.error?.code === "too_large", `6 张附件期望 too_large，实际 ${JSON.stringify(res)}`);
      runs.push({ case: "6 张", error: res.error, latencyMs: res.latencyMs });
    }

    // 3) 非图片 mime
    {
      const res = await c.request(
        { type: "turn.send", sessionId: sidB, text: "x", clientId: randomUUID(), attachments: [{ kind: "image", mime: "text/plain", dataBase64: PNG_1X1_B64 }] },
        30_000,
      );
      assert(!res.ok && res.error?.code === "protocol", `非图片 mime 期望 protocol，实际 ${JSON.stringify(res.error)}`);
      runs.push({ case: "mime=text/plain", error: res.error, latencyMs: res.latencyMs });
    }

    // 4) 声明 png 但内容不是 png（magic 不符）
    {
      const fake = Buffer.from("hello not a png").toString("base64");
      const res = await c.request(
        { type: "turn.send", sessionId: sidB, text: "x", clientId: randomUUID(), attachments: [{ kind: "image", mime: "image/png", dataBase64: fake }] },
        30_000,
      );
      assert(!res.ok && res.error?.code === "protocol", `magic 不符期望 protocol，实际 ${JSON.stringify(res.error)}`);
      runs.push({ case: "magic 不符", error: res.error, latencyMs: res.latencyMs });
    }

    // 5) 非法 base64
    {
      const res = await c.request(
        { type: "turn.send", sessionId: sidB, text: "x", clientId: randomUUID(), attachments: [{ kind: "image", mime: "image/png", dataBase64: "!!!not-base64!!!" }] },
        30_000,
      );
      assert(!res.ok && res.error?.code === "protocol", `非法 base64 期望 protocol，实际 ${JSON.stringify(res.error)}`);
      runs.push({ case: "非法 base64", error: res.error, latencyMs: res.latencyMs });
    }

    // 6) 单张解码 >5MB（base64 ≈6.99MB，整帧 <8MB，不会触发连接层关闭）
    {
      const bigB64 = makePngOfDecodedSize(5.25 * 1024 * 1024);
      const frameBytes = Buffer.byteLength(
        JSON.stringify({ v: 1, kind: "command", id: "size-check", command: { type: "turn.send", text: "x", clientId: "c", attachments: [{ kind: "image", mime: "image/png", dataBase64: bigB64 }] } }),
        "utf8",
      );
      const res = await c.request(
        { type: "turn.send", sessionId: sidB, text: "x", clientId: randomUUID(), attachments: [{ kind: "image", mime: "image/png", dataBase64: bigB64 }] },
        60_000,
      );
      assert(!res.ok && res.error?.code === "too_large", `单张 >5MB 期望 too_large，实际 ${JSON.stringify(res.error)}`);
      assert(frameBytes < 8 * 1024 * 1024, `测试帧 ${frameBytes} 超过 8MB，不安全`);
      // 连接应仍然可用（帧未触发传输层关闭）
      const alive = await c.request({ type: "session.list" }, 15_000);
      assert(alive.ok, "超大帧后连接不可用");
      runs.push({ case: "单张 >5MB", error: res.error, frameBytes, decodedMB: 5.25, latencyMs: res.latencyMs, connectionAlive: alive.ok });
    }

    const caseList = runs.map((r: any) => `${r.case}:${r.skipped ? "skipped" : r.error ? r.error.code : "ok"}`).join("；");
    const big = runs.find((r: any) => r.case === "单张 >5MB") ?? {};
    return {
      detail: `${caseList}${big.frameBytes ? `（>5MB 帧 ${big.frameBytes} 字节，连接仍可用）` : ""}`,
      data: { runs },
    };
  });

  /* ---------------- P10: 错误信封 ---------------- */
  section("P10 错误信封 / 非法帧 / 不支持命令");
  await probe("P10", "result.ok=false 形状、未知 command、非法 JSON、错误 version、unsupported", async () => {
    const c5 = await newClient("c5");
    ctx.c5 = c5;
    const errs: any[] = [];
    const collect = async (label: string, doIt: () => Promise<any>) => {
      const r = await doIt();
      errs.push({ label, ok: r.ok, error: r.error, id: r.id });
      assert(r.ok === false, `${label} 期望 ok:false，实际 ${JSON.stringify(r)}`);
      assert(r.error && typeof r.error.code === "string" && typeof r.error.message === "string" && typeof r.error.retryable === "boolean", `${label} 错误信封形状不对：${JSON.stringify(r.error)}`);
      return r;
    };

    // 原始帧：未知 command type
    c5.raw(JSON.stringify({ v: 1, kind: "command", id: "raw-unknown", command: { type: "nope.cmd" } }));
    const unknown = await c5.waitFor((f) => f.kind === "result" && f.id === "raw-unknown", 5000, "unknown-command result");
    assert(unknown.error?.code === "protocol", `未知 command type 期望 protocol，实际 ${JSON.stringify(unknown.error)}`);
    errs.push({ label: "raw:unknown-type", ok: unknown.ok, error: unknown.error, id: unknown.id });

    // 原始帧：非法 JSON
    c5.raw("this-is-not-json");
    const badJson = await c5.waitFor((f) => f.kind === "result" && f.error?.message === "invalid JSON frame", 5000, "bad-json result");
    assert(badJson.id === "?", `非法 JSON 的 result.id 期望 "?"，实际 ${JSON.stringify(badJson.id)}`);
    errs.push({ label: "raw:invalid-json", ok: badJson.ok, error: badJson.error, id: badJson.id });

    // 原始帧：协议版本不对
    c5.raw(JSON.stringify({ v: 2, kind: "command", id: "raw-v2", command: { type: "session.list" } }));
    const badV = await c5.waitFor((f) => f.kind === "result" && f.id === "raw-v2", 5000, "bad-version result");
    assert(badV.error?.code === "protocol" && /unsupported version/i.test(String(badV.error?.message)), `v=2 期望 protocol unsupported version，实际 ${JSON.stringify(badV.error)}`);
    errs.push({ label: "raw:v=2", ok: badV.ok, error: badV.error, id: badV.id });

    // 原始帧：坏信封（无 command）
    c5.raw(JSON.stringify({ v: 1, kind: "command", id: "raw-bad-envelope" }));
    const badEnv = await c5.waitFor((f) => f.kind === "result" && f.id === "raw-bad-envelope", 5000, "bad-envelope result");
    assert(badEnv.error?.code === "protocol", `坏信封期望 protocol，实际 ${JSON.stringify(badEnv.error)}`);
    errs.push({ label: "raw:bad-envelope", ok: badEnv.ok, error: badEnv.error, id: badEnv.id });

    // attach 缺 sessionId
    await collect("attach 缺 sessionId", () => c5.request({ type: "session.attach" }));
    // attach 不存在的会话
    const notFound = await collect("attach 不存在", () => c5.request({ type: "session.attach", sessionId: `${RUN_ID}-nope` }));
    assert(notFound.error?.code === "not_found", `attach 不存在期望 not_found，实际 ${JSON.stringify(notFound.error)}`);
    // 不支持的命令
    await collect("settings.patch", () => c5.request({ type: "settings.patch", patch: { defaultTier: "fast" } }));
    await collect("auth.whoami", () => c5.request({ type: "auth.whoami" }));
    // guards 层的参数错误
    await collect("command.run 缺 args", () => c5.request({ type: "command.run", name: "help" }));
    await collect("turn.send 缺 clientId", () => c5.request({ type: "turn.send", sessionId: "x", text: "x" }));
    // ping → pong（不是 result）
    const marker = c5.frames.length;
    c5.raw(JSON.stringify({ v: 1, kind: "command", id: "raw-ping", command: { type: "ping" } }));
    const pong = await c5.waitFor((f) => f.kind === "pong", 3000, "pong");
    await sleep(100);
    const resultAfterPing = c5.frames.slice(marker).find((r) => r.frame.kind === "result" && r.frame.id === "raw-ping");
    assert(!resultAfterPing, "ping 不应返回 result 帧（应为 pong）");
    return {
      detail: `错误信封 {code,message,retryable} 全部成立；未知 type→protocol(id 保留)；非法 JSON→id "?"；v=2→protocol；缺 sessionId→protocol；不存在→not_found；settings.patch/auth.whoami→unsupported；ping→pong（无 result）`,
      data: { errors: errs, pong: pong.kind, resultAfterPing: null },
    };
  });

  /* ---------------- P11: 握手失败 / Origin ---------------- */
  section("P11 错 token / Origin 白名单 / dev-auth 登录 / health");
  await probe("P11", "WS 错 token 与 Origin 拒绝的实测表现（真实现象，不是文档猜测）", async () => {
    const d = runState.discovery!;
    const httpUrl = d.httpUrl;

    // 1) 错误 token 的真实 WS 握手
    const badWs = await tryWs(d.url, ["neo.v1", "bearer.deadbeefdeadbeefdeadbeefdeadbeef"]);
    assert(badWs.opened === false, "错误 token 竟然握手成功");
    const badWs2 = await tryWs(d.url, ["neo.v1"]);
    assert(badWs2.opened === false, "无 token 子协议竟然握手成功");

    // 2) fetch 侧观察 HTTP 状态（无 Upgrade 时 hub 先判 Origin/token）
    const evil = await fetch(httpUrl, {
      headers: { Origin: "http://evil.example", "Sec-WebSocket-Protocol": `neo.v1, bearer.${d.token}` },
    });
    const evilBody = await evil.text();
    assert(evil.status === 403, `恶意 Origin 期望 403，实际 ${evil.status} ${evilBody}`);
    const noToken = await fetch(httpUrl, { headers: { Origin: "http://127.0.0.1:5173" } });
    assert(noToken.status === 401, `缺 token 期望 401，实际 ${noToken.status}`);
    const tauri = await fetch(httpUrl, {
      headers: { Origin: "tauri://localhost", "Sec-WebSocket-Protocol": `neo.v1, bearer.${d.token}` },
    });
    const tauriBody = await tauri.text();
    const loopbackPort = await fetch(httpUrl, {
      headers: { Origin: "http://127.0.0.1:57682", "Sec-WebSocket-Protocol": `neo.v1, bearer.${d.token}` },
    });

    // 3) dev-auth 登录（GUI 可走这条拿 token；也验证 Origin 白名单）
    const loginNoOrigin = await fetch(`${httpUrl.replace(/\/ws$/, "")}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "local@localhost", password: "x" }),
    });
    const loginNoOriginJson: any = await loginNoOrigin.json().catch(() => null);
    const loginEvil = await fetch(`${httpUrl.replace(/\/ws$/, "")}/api/auth/login`, {
      method: "POST",
      headers: { Origin: "http://evil.example", "Content-Type": "application/json" },
      body: JSON.stringify({ email: "local@localhost", password: "x" }),
    });

    // 4) health
    const health = await fetch(`${httpUrl.replace(/\/ws$/, "")}/health`);
    const healthJson: any = await health.json();

    assert(loginNoOriginJson && loginNoOriginJson.token === d.token, "dev-auth 登录返回的 token 与磁盘 token 不一致");
    assert(typeof loginNoOriginJson.expiresAt === "number" && loginNoOriginJson.expiresAt > Date.now(), `expiresAt 非法：${JSON.stringify(loginNoOriginJson.expiresAt)}`);
    assert(loginEvil.status === 403, `恶意 Origin 登录期望 403，实际 ${loginEvil.status}`);
    assert(healthJson.mode === "hub", `health.mode=${String(healthJson.mode)}`);
    return {
      detail: `错 token WS：opened=false close=${String(badWs.closeCode)} error=${JSON.stringify(badWs.error)}（文档写 4401，实际是 HTTP 401 握手失败）；恶意 Origin→403；无 token→401；tauri/loopback Origin 通过 token 校验（${tauri.status}/${loopbackPort.status}）；dev-auth 登录 no-Origin→${loginNoOrigin.status}（token 一致，有 evil Origin→403）；health→${healthJson.mode}`,
      data: {
        badTokenWs: badWs,
        noTokenWs: badWs2,
        evilOriginHttp: { status: evil.status, body: evilBody },
        noTokenHttp: { status: noToken.status },
        tauriOriginHttp: { status: tauri.status, body: tauriBody },
        loopbackPortOriginHttp: { status: loopbackPort.status },
        devAuthLogin: { status: loginNoOrigin.status, bodyKeys: loginNoOriginJson ? Object.keys(loginNoOriginJson) : null, tokenMatchesDisk: loginNoOriginJson?.token === d.token, expiresAt: loginNoOriginJson?.expiresAt, user: loginNoOriginJson?.user, evilOriginStatus: loginEvil.status },
        health: healthJson,
        docClaim4401: false,
        actualHandshakeFailure: { httpStatus: evil.status === 403 ? "origin 403" : "n/a", wsCloseCode: badWs.closeCode, wsError: badWs.error },
      },
    };
  });

  return finish(startedAt);
}

/* ------------------------------------------------------------------ */
/* 握手失败观察                                                        */
/* ------------------------------------------------------------------ */

interface WsFailureObservation {
  opened: boolean;
  closeCode?: number;
  closeReason?: string;
  error?: string;
  events: string[];
  ms: number;
}

function tryWs(url: string, protocols: string[], timeoutMs = 6000): Promise<WsFailureObservation> {
  return new Promise((resolve) => {
    const events: string[] = [];
    const t0 = performance.now();
    let settled = false;
    let obsError: string | undefined;
    const done = (obs: WsFailureObservation): void => {
      if (settled) return;
      settled = true;
      resolve({ ...obs, ms: Math.round(performance.now() - t0) });
    };
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, protocols);
    } catch (error) {
      done({ opened: false, error: (error as Error).message, events });
      return;
    }
    ws.onopen = () => {
      events.push("open");
      done({ opened: true, events });
    };
    ws.onerror = (event: Event) => {
      events.push("error");
      obsError = (event as unknown as { message?: string })?.message ?? "ws error";
    };
    ws.onclose = (event: CloseEvent) => {
      events.push(`close:${event.code}`);
      done({ opened: false, closeCode: event.code, closeReason: event.reason, error: obsError, events });
    };
    setTimeout(() => {
      events.push("timeout");
      done({ opened: false, error: obsError ?? "timeout", events });
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }, timeoutMs).unref?.();
  });
}

/* ------------------------------------------------------------------ */
/* 收尾：关闭自己创建的会话 + 断开连接                                  */
/* ------------------------------------------------------------------ */

async function cleanup(): Promise<void> {
  if (runState.cleaned) return;
  runState.cleaned = true;
  const live = runState.clients.filter((c) => c.connected);
  for (const c of live) {
    if (c.boundSessionId) {
      try {
        await c.request({ type: "session.detach", sessionId: c.boundSessionId }, 5000);
      } catch {
        /* ignore */
      }
      c.boundSessionId = null;
    }
  }
  for (const sid of runState.createdSessions) {
    let closed = false;
    for (const c of runState.clients) {
      if (!c.connected) continue;
      try {
        const r = await c.request({ type: "session.close", sessionId: sid }, 10_000);
        if (r.ok) {
          closed = true;
          break;
        }
      } catch {
        /* ignore */
      }
    }
    if (!closed) console.log(`  (cleanup) 未能 close ${sid}（可能已被其他客户端占用）`);
  }
  for (const c of runState.clients) {
    try {
      c.close();
    } catch {
      /* ignore */
    }
  }
  await sleep(120);
}

function finish(startedAt: string): number {
  const pass = checks.filter((c) => c.status === "PASS").length;
  const fail = checks.filter((c) => c.status === "FAIL").length;
  const skipCount = checks.filter((c) => c.status === "SKIP").length;
  const info = checks.filter((c) => c.status === "INFO").length;
  console.log(`\n════════ 汇总：PASS ${pass} / FAIL ${fail} / SKIP ${skipCount} / INFO ${info} ════════`);
  for (const c of checks.filter((c) => c.status === "FAIL")) console.log(`  FAIL ${c.id} ${c.title} — ${c.detail}`);

  const evidencePath = JSON_PATH_CLI ?? `/tmp/probe-hub/${RUN_ID}.json`;
  const payload = {
    runId: RUN_ID,
    startedAt,
    finishedAt: nowIso(),
    hub: runState.discovery
      ? { url: runState.discovery.url, pid: runState.discovery.pid, coreStartedAt: runState.discovery.startedAt, tokenFile: runState.discovery.tokenFile }
      : null,
    createdSessions: runState.createdSessions,
    sessionTitles: { A: TITLE_A, B: TITLE_B },
    checks,
    evidence: runState.evidence,
    llmSkipped: NO_LLM,
  };
  try {
    mkdirSync(evidencePath.slice(0, evidencePath.lastIndexOf("/")) || "/tmp", { recursive: true });
    writeFileSync(evidencePath, JSON.stringify(payload, null, 2), "utf8");
    console.log(`\n证据 JSON：${evidencePath}`);
  } catch (error) {
    console.log(`\n证据 JSON 写入失败：${(error as Error).message}`);
  }
  console.log(`本次创建的测试会话：${runState.createdSessions.join(", ") || "(无)"}`);
  return failures === 0 ? 0 : 1;
}

/* ------------------------------------------------------------------ */

const startedAt = nowIso();
let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  record("FATAL", "脚本异常终止", "FAIL", (error as Error).stack ?? String(error));
  exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (error) {
    console.log(`cleanup 失败：${(error as Error).message}`);
  }
}
process.exit(exitCode);
