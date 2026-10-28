/**
 * transport/hub.ts — 与真实 Hub 的 WebSocket 长连接。
 *
 * 职责只有四件：发现端点并建连/重连、请求-响应配对、把帧交给协议校验、把状态变化上报。
 * 业务语义一律不在这里（在 state/app.ts）。
 *
 * v0.0.2 行为要点（见 neo-core-serve/docs/gui-integration-v0.0.2.md）：
 *  - 每次（重）连都重新发现端点：Hub 重启会换端口与 token；
 *  - 子协议 ["neo.v1", "bearer.<token>"]，握手失败直接关闭 4401；
 *  - 慢消费者被服务端关闭 4408，退避重连（300ms×2^n，封顶 5s + jitter）；
 *  - 服务端会合并 delta（16ms/4KB），客户端不能假设逐 token 到达。
 */

import { type Discovery, discoverEndpoint, type Endpoint } from "@/lib/endpoints.ts";
import type { ClientCommand, ServerMessage } from "@/protocol";
import { decodeServerText, makeClientMessage } from "@/protocol";

export type ConnStatus =
  | "idle"
  | "connecting"
  | "authenticating"
  | "attaching"
  | "live"
  | "reconnecting"
  | "error";

type ReadyFrame = Extract<ServerMessage, { kind: "ready" }>;

export interface HubClientOptions {
  onStatus: (status: ConnStatus) => void;
  onMessage: (msg: ServerMessage) => void;
  onReady: (ready: ReadyFrame, endpoint: Endpoint, isReconnect: boolean) => void;
  onProtocolError: (message: string) => void;
  onDiscoveryError: (reason: string) => void;
  /** 发现成功（拿到 url/token/user），此时 WS 可能还没握手成功 */
  onEndpoint: (endpoint: Endpoint) => void;
  /** 4401：token 轮换/被拒 → 上层可清状态并重新发现 */
  onAuthError: () => void;
}

const REQUEST_TIMEOUT = 20_000;
const READY_TIMEOUT = 15_000;

let seq = 0;
const nextId = () => `r${++seq}`;

export class HubClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private everConnected = false;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private endpoint: Endpoint | null = null;
  private readonly pending = new Map<
    string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly opts: HubClientOptions) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get currentEndpoint(): Endpoint | null {
    return this.endpoint;
  }

  start(): void {
    this.stopped = false;
    this.everConnected = false;
    this.retry = 0;
    void this.attempt();
  }

  /** 主动重连（例如用户点重试、或设置页改了端点） */
  reconnectNow(): void {
    if (this.stopped) return;
    this.clearRetry();
    this.retry = 0;
    this.teardown();
    void this.attempt();
  }

  private async attempt(): Promise<void> {
    if (this.stopped) return;
    this.opts.onStatus(this.everConnected ? "reconnecting" : "connecting");
    const discovery: Discovery = await discoverEndpoint();
    if (this.stopped) return;
    if (!discovery.ok) {
      this.opts.onDiscoveryError(discovery.reason);
      this.opts.onStatus("error");
      this.scheduleReconnect();
      return;
    }
    this.endpoint = discovery.endpoint;
    this.opts.onEndpoint(discovery.endpoint);
    this.open(discovery.endpoint);
  }

  private open(endpoint: Endpoint): void {
    this.opts.onStatus("authenticating");
    let ws: WebSocket;
    try {
      ws = new WebSocket(endpoint.url, ["neo.v1", `bearer.${endpoint.token}`]);
    } catch (error) {
      this.opts.onDiscoveryError((error as Error).message);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    this.readyTimer = setTimeout(() => {
      // 连上了但没握手成功：当作坏端点处理，退避重试。
      this.opts.onProtocolError("handshake timeout");
      try {
        ws.close();
      } catch {
        /* closed */
      }
    }, READY_TIMEOUT);

    ws.addEventListener("open", () => {
      /* 真正的"已认证"以 ready 帧为准 */
    });

    ws.addEventListener("message", (event) => {
      const decoded = decodeServerText(String(event.data));
      if (!decoded.ok) {
        this.opts.onProtocolError(decoded.error.message);
        return;
      }
      const msg = decoded.value;
      if (msg.kind === "result") {
        const waiter = this.pending.get(msg.id);
        if (!waiter) return;
        clearTimeout(waiter.timer);
        this.pending.delete(msg.id);
        if (msg.ok) waiter.resolve(msg.data);
        else waiter.reject(Object.assign(new Error(msg.error.message), { code: msg.error.code }));
        return;
      }
      if (msg.kind === "pong") return;
      if (msg.kind === "ready") {
        this.clearReadyTimer();
        this.retry = 0;
        this.opts.onStatus("attaching");
        this.opts.onReady(msg, endpoint, this.everConnected);
        this.everConnected = true;
        return;
      }
      this.opts.onMessage(msg);
    });

    ws.addEventListener("close", (event) => {
      this.clearReadyTimer();
      if (this.stopped) return;
      this.failPending(`connection closed (${event.code})`);
      this.ws = null;
      if (event.code === 4401) {
        this.opts.onAuthError();
        this.opts.onStatus("error");
      } else if (event.code === 4408) {
        this.opts.onProtocolError("slow consumer (4408)：服务端丢弃了积压帧");
        this.opts.onStatus("reconnecting");
      } else {
        this.opts.onStatus("reconnecting");
      }
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      /* close 事件会紧跟其后，统一在那里处理 */
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = Math.min(5_000, 300 * 2 ** this.retry) + Math.random() * 120;
    this.retry += 1;
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.attempt();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private clearReadyTimer(): void {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
  }

  private failPending(reason: string): void {
    for (const [id, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      this.pending.delete(id);
      waiter.reject(new Error(reason));
    }
  }

  private teardown(): void {
    this.clearReadyTimer();
    this.failPending("reconnecting");
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.close();
      } catch {
        /* closed */
      }
    }
  }

  request<T>(command: ClientCommand, timeoutMs = REQUEST_TIMEOUT): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("not connected"));
    }
    const id = nextId();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`request timeout: ${command.type}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });
      this.ws?.send(makeClientMessage(id, command));
    });
  }

  /** 接收推送事件（事件不用回执） */
  emit(command: ClientCommand): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(makeClientMessage(nextId(), command));
  }

  disconnect(): void {
    this.stopped = true;
    this.everConnected = false;
    this.clearRetry();
    this.teardown();
    this.opts.onStatus("idle");
  }
}
