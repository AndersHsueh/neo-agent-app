/**
 * transport/hub.ts — 与 hub 的 WebSocket 长连接。
 *
 * 职责只有四件：建连/重连、请求-响应配对、把帧交给协议校验、把状态变化上报。
 * 业务语义一律不在这里（在 state/app.ts）。
 */

import { wsUrl } from "@/lib/endpoints.ts";
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

export interface HubClientOptions {
  getToken: () => string | null;
  getLang: () => "zh" | "en";
  onMessage: (msg: ServerMessage) => void;
  onStatus: (status: ConnStatus) => void;
  onReady: (isReconnect: boolean) => void;
  onProtocolError: (message: string) => void;
}

const REQUEST_TIMEOUT = 15_000;

let seq = 0;
const nextId = () => `r${++seq}`;

export class HubClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private everConnected = false;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
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

  connect(): void {
    if (this.stopped) return;
    const token = this.opts.getToken();
    if (!token) {
      this.opts.onStatus("idle");
      return;
    }
    this.opts.onStatus(this.everConnected ? "reconnecting" : "connecting");

    const url = wsUrl(this.opts.getLang());
    const ws = new WebSocket(url, ["neo.v1", `bearer.${token}`]);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.retry = 0;
      this.opts.onStatus("authenticating");
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
        if (waiter) {
          clearTimeout(waiter.timer);
          this.pending.delete(msg.id);
          if (msg.ok) waiter.resolve(msg.data);
          else waiter.reject(Object.assign(new Error(msg.error.message), { code: msg.error.code }));
        }
        return;
      }
      if (msg.kind === "pong") return;
      if (msg.kind === "ready") {
        this.opts.onStatus("attaching");
        this.opts.onReady(this.everConnected);
        this.everConnected = true;
        return;
      }
      this.opts.onMessage(msg);
    });

    ws.addEventListener("close", () => {
      if (this.stopped) return;
      this.failPending("connection closed");
      this.opts.onStatus("reconnecting");
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      this.opts.onStatus("error");
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = Math.min(5_000, 300 * 2 ** this.retry) + Math.random() * 120;
    this.retry += 1;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private failPending(reason: string): void {
    for (const [id, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      this.pending.delete(id);
      waiter.reject(new Error(reason));
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
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.failPending("disconnected");
    this.ws?.close();
    this.ws = null;
    this.everConnected = false;
    this.opts.onStatus("idle");
  }
}
