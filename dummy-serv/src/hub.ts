/**
 * dummy-serv/hub.ts — 协议中枢：连接、命令、事件、seq、订阅、挂起决策。
 *
 * 它刻意长得像未来的真 hub：所有状态变更都走“事件 → reducer → 广播”，
 * 会话一定属于某个用户，seq 按会话单调递增，快照从状态里长出来。
 */

import type { ServerWebSocket } from "bun";
import type {
  ClientCommand,
  HubError,
  SessionEvent,
  SessionSnapshot,
  UsageRecord,
  User,
} from "../../gui/src/protocol/index.ts";
import type { SessionState } from "../../gui/src/protocol/index.ts";
import { PROTOCOL_VERSION, decodeClientMessage } from "../../gui/src/protocol/index.ts";
import { applyEvent, hydrate } from "../../gui/src/state/session.ts";
import type { Lang, World } from "./store.ts";
import { localizedSeedBlocks, resetWorld, sessionsFor, totals, usageFor } from "./store.ts";
import { runTurn } from "./scenario.ts";
import { verify } from "./auth.ts";

export interface ConnData {
  token?: string;
  lang?: Lang;
}

export type Conn = {
  id: string;
  ws: ServerWebSocket<ConnData>;
  user: User;
  subs: Set<string>;
};

const ok = (id: string, data: unknown) =>
  ({ v: PROTOCOL_VERSION, kind: "result", id, ok: true, data }) as const;

export class Hub {
  readonly world: World;
  private readonly conns = new Map<string, Conn>();
  private readonly decisions = new Map<string, (value: string) => void>();
  private readonly aborts = new Map<string, AbortController>();
  private readonly active = new Set<string>();

  constructor(world: World) {
    this.world = world;
  }

  /* ------------------------------ 连接 ------------------------------ */

  register(ws: ServerWebSocket<ConnData>): Conn | null {
    const token = ws.data.token ?? "";
    const user = verify(this.world, token);
    if (!user) {
      ws.send(
        JSON.stringify({
          v: PROTOCOL_VERSION,
          kind: "result",
          id: "handshake",
          ok: false,
          error: { code: "unauthorized", message: "token invalid or expired", retryable: false },
        }),
      );
      ws.close(4401, "unauthorized");
      return null;
    }
    const conn: Conn = { id: ws.data.token ?? crypto.randomUUID(), ws, user, subs: new Set() };
    this.conns.set(conn.id, conn);
    this.send(conn, { v: PROTOCOL_VERSION, kind: "ready", user });
    return conn;
  }

  unregister(ws: ServerWebSocket<ConnData>): void {
    for (const [id, conn] of this.conns) {
      if (conn.ws === ws) this.conns.delete(id);
    }
  }

  private send(conn: Conn, msg: unknown): void {
    try {
      conn.ws.send(JSON.stringify(msg));
    } catch {
      // 连接已断；关闭由 Bun 自己处理
    }
  }

  private sendError(conn: Conn, id: string, error: HubError): void {
    this.send(conn, { v: PROTOCOL_VERSION, kind: "result", id, ok: false, error });
  }

  /* ------------------------------ 广播 ------------------------------ */

  broadcast(sessionId: string, msg: unknown): void {
    for (const conn of this.conns.values()) {
      if (conn.subs.has(sessionId)) this.send(conn, msg);
    }
  }

  /** 所有状态变更入口：event → reducer → seq++ → 广播 */
  emit(sessionId: string, event: SessionEvent): number {
    const state = this.world.states.get(sessionId);
    if (!state) return -1;
    const next = applyEvent(state, event);
    this.world.states.set(sessionId, next);
    const seq = (this.world.seqs.get(sessionId) ?? 0) + 1;
    this.world.seqs.set(sessionId, seq);

    if (event.type === "stats") {
      const usage: UsageRecord = {
        id: crypto.randomUUID(),
        userId: next.meta.ownerId,
        sessionId,
        turnId: `turn-${seq}`,
        provider: next.meta.provider,
        model: next.meta.model,
        tier: event.tier,
        at: event.at,
        ...event.usage,
      };
      this.world.usage.push(usage);
    }

    this.broadcast(sessionId, {
      v: PROTOCOL_VERSION,
      kind: "event",
      sessionId,
      seq,
      event,
    });
    return seq;
  }

  snapshotFor(sessionId: string, lang: Lang = "zh"): SessionSnapshot | null {
    const state = this.world.states.get(sessionId);
    if (!state) return null;
    const rawTitle = this.world.rawTitles.get(sessionId);
    const seed = localizedSeedBlocks(this.world, sessionId, lang);
    return {
      meta: rawTitle ? { ...state.meta, title: rawTitle[lang] } : state.meta,
      seq: this.world.seqs.get(sessionId) ?? 0,
      blocks: seed ?? state.blocks,
      context: state.context,
      lastTurn: state.lastTurn,
      pendingApprovalId: state.pendingApprovalId,
      pendingQuestionId: state.pendingQuestionId,
    };
  }

  /* ------------------------------ 命令分发 ------------------------------ */

  async handle(ws: ServerWebSocket<ConnData>, raw: string): Promise<void> {
    const conn = [...this.conns.values()].find((c) => c.ws === ws);
    if (!conn) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.sendError(conn, "unknown", { code: "protocol", message: "invalid JSON", retryable: false });
      return;
    }
    const decoded = decodeClientMessage(parsed);
    if (!decoded.ok) {
      this.sendError(conn, "unknown", decoded.error);
      return;
    }
    const envelope = parsed as { id?: string };
    const id = typeof envelope.id === "string" ? envelope.id : "unknown";

    try {
      await this.dispatch(conn, id, decoded.value);
    } catch (error) {
      this.sendError(conn, id, {
        code: "internal",
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      });
    }
  }

  private sessionOf(
    conn: Conn,
    sessionId: string,
  ): { ok: true; state: SessionState } | { ok: false; code: "not_found" | "forbidden" } {
    const state = this.world.states.get(sessionId);
    if (!state) return { ok: false, code: "not_found" };
    if (state.meta.ownerId !== conn.user.id) return { ok: false, code: "forbidden" };
    return { ok: true, state };
  }

  private async dispatch(conn: Conn, id: string, cmd: ClientCommand): Promise<void> {
    switch (cmd.type) {
      case "ping": {
        this.send(conn, { v: PROTOCOL_VERSION, kind: "pong" });
        return;
      }
      case "auth.whoami": {
        this.send(conn, ok(id, { user: conn.user }));
        return;
      }
      case "auth.login":
      case "auth.logout": {
        // 登录走 HTTP；WS 上不支持重新登录
        this.sendError(conn, id, { code: "protocol", message: "use /api/auth/login", retryable: false });
        return;
      }
      case "session.list": {
        this.send(conn, ok(id, { sessions: sessionsFor(this.world, conn.user.id, conn.ws.data.lang ?? "zh") }));
        return;
      }
      case "session.create": {
        const count = [...this.world.states.values()].filter((s) => s.meta.ownerId === conn.user.id).length;
        const sessionId = `c-${1000 + count + Math.floor(Math.random() * 100)}`;
        const now = Date.now();
        const lang = conn.ws.data.lang ?? "zh";
        const state = {
          meta: {
            id: sessionId,
            title: cmd.title ?? (lang === "en" ? "Untitled construct" : "未命名构造"),
            ownerId: conn.user.id,
            status: "idle" as const,
            tier: "balanced" as const,
            provider: "ipsa",
            model: "glm-5.3-flash",
            cwd: "~/work/neo",
            createdAt: now,
            updatedAt: now,
            unread: 0,
          },
          seq: 0,
          blocks: [],
          context: { used: 0, limit: 512_000, compactAt: 0.75 },
        };
        this.world.states.set(
          sessionId,
          hydrate({
            meta: state.meta,
            seq: 0,
            blocks: [],
            context: state.context,
          }),
        );
        this.world.seqs.set(sessionId, 0);
        this.world.turnCounts.set(sessionId, 0);
        this.world.lang.set(sessionId, conn.ws.data.lang ?? "zh");
        this.send(conn, ok(id, { sessionId }));
        return;
      }
      case "session.attach": {
        const found = this.sessionOf(conn, cmd.sessionId);
        if (!found.ok) {
          this.sendError(conn, id, { code: found.code, message: cmd.sessionId, retryable: false });
          return;
        }
        conn.subs.add(cmd.sessionId);
        const snapshot = this.snapshotFor(cmd.sessionId, conn.ws.data.lang ?? "zh");
        if (!snapshot) {
          this.sendError(conn, id, { code: "session_gone", message: cmd.sessionId, retryable: false });
          return;
        }
        this.send(conn, { v: PROTOCOL_VERSION, kind: "snapshot", sessionId: cmd.sessionId, seq: snapshot.seq, snapshot });
        this.send(conn, ok(id, { attached: true }));
        return;
      }
      case "session.detach": {
        conn.subs.delete(cmd.sessionId);
        this.send(conn, ok(id, { detached: true }));
        return;
      }
      case "session.rename": {
        const found = this.sessionOf(conn, cmd.sessionId);
        if (!found.ok) {
          this.sendError(conn, id, { code: found.code, message: cmd.sessionId, retryable: false });
          return;
        }
        const meta = { ...found.state.meta, title: cmd.title, updatedAt: Date.now() };
        this.emit(cmd.sessionId, { type: "session.meta", meta });
        this.send(conn, ok(id, { renamed: true }));
        return;
      }
      case "session.close": {
        const found = this.sessionOf(conn, cmd.sessionId);
        if (!found.ok) {
          this.sendError(conn, id, { code: found.code, message: cmd.sessionId, retryable: false });
          return;
        }
        this.world.states.delete(cmd.sessionId);
        this.send(conn, ok(id, { closed: true }));
        return;
      }
      case "turn.send": {
        const found = this.sessionOf(conn, cmd.sessionId);
        if (!found.ok) {
          this.sendError(conn, id, { code: found.code, message: cmd.sessionId, retryable: false });
          return;
        }
        if (this.active.has(cmd.sessionId)) {
          this.sendError(conn, id, {
            code: "conflict",
            message: "a turn is already running",
            retryable: false,
          });
          return;
        }
        this.send(conn, ok(id, { accepted: true }));
        console.log("[dummy] turn.send", cmd.sessionId, cmd.clientId);
        const lang = conn.ws.data.lang ?? "zh";
        this.localizeSession(cmd.sessionId, lang);
        void this.startTurn(cmd.sessionId, cmd.text, cmd.clientId, cmd.refs);
        return;
      }
      case "turn.abort": {
        const controller = this.aborts.get(cmd.sessionId);
        if (controller) controller.abort();
        this.send(conn, ok(id, { aborted: true }));
        return;
      }
      case "approval.resolve": {
        const state = this.world.states.get(cmd.sessionId);
        if (!state || state.meta.ownerId !== conn.user.id) {
          this.sendError(conn, id, { code: "forbidden", message: "not your session", retryable: false });
          return;
        }
        const resolve = this.decisions.get(cmd.blockId);
        if (!resolve) {
          this.sendError(conn, id, { code: "approval_expired", message: cmd.blockId, retryable: false });
          return;
        }
        this.decisions.delete(cmd.blockId);
        console.log("[dummy] approval.resolve", cmd.blockId, cmd.decision);
        resolve(cmd.decision);
        this.send(conn, ok(id, { resolved: cmd.decision }));
        return;
      }
      case "question.answer": {
        const state = this.world.states.get(cmd.sessionId);
        if (!state || state.meta.ownerId !== conn.user.id) {
          this.sendError(conn, id, { code: "forbidden", message: "not your session", retryable: false });
          return;
        }
        const resolve = this.decisions.get(cmd.blockId);
        if (!resolve) {
          this.sendError(conn, id, { code: "not_found", message: "no pending question", retryable: false });
          return;
        }
        this.decisions.delete(cmd.blockId);
        console.log("[dummy] question.answer", cmd.blockId, cmd.key);
        resolve(cmd.key);
        this.send(conn, ok(id, { answered: cmd.key }));
        return;
      }
      case "command.run": {
        const found = this.sessionOf(conn, cmd.sessionId);
        if (!found.ok) {
          this.sendError(conn, id, { code: found.code, message: cmd.sessionId, retryable: false });
          return;
        }
        this.runSlashCommand(cmd.sessionId, cmd.name, cmd.args);
        this.send(conn, ok(id, { ran: `/${cmd.name}` }));
        return;
      }
      case "settings.get": {
        const settings = this.world.settings.get(conn.user.id);
        if (!settings) {
          this.sendError(conn, id, { code: "not_found", message: "settings", retryable: false });
          return;
        }
        this.send(conn, ok(id, { settings }));
        return;
      }
      case "settings.patch": {
        const current = this.world.settings.get(conn.user.id);
        if (!current) {
          this.sendError(conn, id, { code: "not_found", message: "settings", retryable: false });
          return;
        }
        const patch = cmd.patch;
        this.world.settings.set(conn.user.id, {
          ...current,
          ...patch,
          memory: patch.memory ? { ...current.memory, ...patch.memory } : current.memory,
          env: patch.env ? { ...current.env, ...patch.env } : current.env,
          team: patch.team ? { ...current.team, ...patch.team } : current.team,
          retry: patch.retry ? { ...current.retry, ...patch.retry } : current.retry,
        });
        this.send(conn, ok(id, { settings: this.world.settings.get(conn.user.id) }));
        return;
      }
      case "usage.summary": {
        const records = usageFor(this.world, conn.user.id, cmd.sessionId);
        this.send(conn, ok(id, { range: cmd.range, records, totals: totals(records) }));
        return;
      }
      default: {
        const exhaustive: never = cmd;
        void exhaustive;
        this.sendError(conn, id, { code: "protocol", message: "unhandled command", retryable: false });
      }
    }
  }

  private runSlashCommand(sessionId: string, name: string, args: string[]): void {
    const state = this.world.states.get(sessionId);
    if (!state) return;
    const tierArg = args[0];
    if (name === "tier" || ["deep", "balanced", "fast", "default"].includes(name)) {
      const to =
        name === "tier"
          ? ((tierArg ?? "balanced") as "deep_reasoning" | "balanced" | "fast" | "default")
          : name === "deep"
            ? "deep_reasoning"
            : (name as "balanced" | "fast" | "default");
      this.emit(sessionId, { type: "tier.switch", from: state.meta.tier, to, reason: `/${name}`, at: Date.now() });
      return;
    }
    if (name === "compact") {
      this.emit(sessionId, {
        type: "banner",
        blockId: `banner-${Date.now()}`,
        at: Date.now(),
        level: "info",
        text: "压缩请求已登记（dummy：本轮结束后不真的压缩）",
      });
      return;
    }
    this.emit(sessionId, {
      type: "banner",
      blockId: `banner-${Date.now()}`,
      at: Date.now(),
      level: "info",
      text: `/${name} 在 dummy-serv 里没有实现`,
    });
  }

  /* ------------------------------ 轮次 ------------------------------ */

  /** 会话第一次被某个语言使用时，把种子块与标题切成该语言 */
  private localizeSession(sessionId: string, lang: Lang): void {
    const state = this.world.states.get(sessionId);
    if (!state) return;
    if ((this.world.lang.get(sessionId) ?? "zh") === lang) return;
    const seed = localizedSeedBlocks(this.world, sessionId, lang);
    const rawTitle = this.world.rawTitles.get(sessionId);
    this.world.states.set(sessionId, {
      ...state,
      blocks: seed ?? state.blocks,
      meta: rawTitle ? { ...state.meta, title: rawTitle[lang] } : state.meta,
    });
    this.world.lang.set(sessionId, lang);
  }

  private async startTurn(
    sessionId: string,
    text: string,
    clientId: string,
    refs?: { icon: string; label: string }[],
  ): Promise<void> {
    const state = this.world.states.get(sessionId);
    if (!state) return;
    this.active.add(sessionId);
    const controller = new AbortController();
    this.aborts.set(sessionId, controller);
    const turnCount = this.world.turnCounts.get(sessionId) ?? 0;
    this.world.turnCounts.set(sessionId, turnCount + 1);
    const n = turnCount + 1;
    const turnId = `t-${Date.now()}`;

    this.emit(sessionId, {
      type: "turn.start",
      turnId,
      blockId: `${turnId}-div`,
      n,
      at: Date.now(),
      userText: text,
      clientId,
      refs,
    });
    this.emit(sessionId, { type: "session.status", status: "working" });

    try {
      await runTurn({
        hub: this,
        sessionId,
        turnId,
        turnNo: n,
        realStart: Date.now(),
        text,
        lang: this.world.lang.get(sessionId) ?? "zh",
        signal: controller.signal,
      });
    } catch (error) {
      console.error("[dummy] turn failed", error);
      this.emit(sessionId, {
        type: "error",
        code: "internal",
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      });
    } finally {
      this.active.delete(sessionId);
      this.aborts.delete(sessionId);
      this.emit(sessionId, { type: "session.status", status: "idle" });
    }
  }

  waitApproval(blockId: string, timeoutMs: number): Promise<"allow" | "deny" | "allow-session"> {
    return new Promise((resolve) => {
      this.decisions.set(blockId, (v) => resolve(v as "allow" | "deny" | "allow-session"));
      setTimeout(() => {
        if (this.decisions.has(blockId)) {
          this.decisions.delete(blockId);
          resolve("deny");
        }
      }, timeoutMs);
    });
  }

  waitQuestion(blockId: string): Promise<string> {
    return new Promise((resolve) => {
      this.decisions.set(blockId, resolve);
    });
  }

  reset(): void {
    this.decisions.clear();
    this.aborts.clear();
    this.active.clear();
    resetWorld(this.world);
  }

  closeAll(reason: string): void {
    for (const conn of this.conns.values()) {
      try {
        conn.ws.close(4001, reason);
      } catch {
        /* already closed */
      }
    }
    this.conns.clear();
  }
}

