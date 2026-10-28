/**
 * lib/endpoints.ts — Hub 发现（浏览器侧）。
 *
 * 唯一契约：`GET /__neo/endpoint`
 *   200 {ok:true, url, token, user, coreVersion, protocolVersion, pid, startedAt}
 *   503 {ok:false, reason}
 *
 * dev：Vite 中间件代读 ~/.neo/run/core.json + core.token（见 vite.config.ts）。
 * 生产：Tauri 壳的本地后端实现同一路径。
 *
 * 客户端每次连接/重连都要重新发现：Hub 重启会换端口与 token。
 */

import type { User } from "@/protocol";

export interface Endpoint {
  /** ws://127.0.0.1:<port>/ws */
  url: string;
  token: string;
  user: User;
  coreVersion?: string;
  protocolVersion?: string;
  pid?: number;
  startedAt?: string;
}

export type Discovery = { ok: true; endpoint: Endpoint } | { ok: false; reason: string };

export const isDev = import.meta.env.DEV;

const DISCOVERY_PATH = "/__neo/endpoint";

export async function discoverEndpoint(): Promise<Discovery> {
  try {
    const res = await fetch(DISCOVERY_PATH, { cache: "no-store" });
    if (!res.ok) {
      let reason = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { reason?: string };
        if (body.reason) reason = body.reason;
      } catch {
        /* 非 JSON 响应 */
      }
      return { ok: false, reason };
    }
    const body = (await res.json()) as Partial<Endpoint> & { ok?: boolean; reason?: string };
    if (!body.ok || !body.url || !body.token) {
      return { ok: false, reason: body.reason ?? "发现文件不完整" };
    }
    return {
      ok: true,
      endpoint: {
        url: body.url,
        token: body.token,
        user: body.user ?? {
          id: "local",
          email: "local@localhost",
          displayName: "Local",
          role: "owner",
        },
        coreVersion: body.coreVersion,
        protocolVersion: body.protocolVersion,
        pid: body.pid,
        startedAt: body.startedAt,
      },
    };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}

/** 状态栏展示：ws://127.0.0.1:61895/ws → 127.0.0.1:61895 */
export function endpointLabel(endpoint: Endpoint | null): string {
  if (!endpoint) return "—";
  try {
    return new URL(endpoint.url).host;
  } catch {
    return endpoint.url;
  }
}
