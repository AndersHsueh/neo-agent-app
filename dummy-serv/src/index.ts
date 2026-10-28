/**
 * dummy-serv/index.ts — 假后端入口。
 *
 * HTTP 只做三件事：健康检查、登录、登出。其余全走 WebSocket。
 * 端口默认 5292（Vite 把 /api 与 /ws 代理过来，前端不需要知道端口）。
 *
 * 环境变量：
 *   NEO_DUMMY_PORT=5292
 *   NEO_DUMMY_FAULTS=drop-ws,slow-token,token-expire,approval-timeout
 */

import { initAuth, login, verify, logout } from "./auth.ts";
import { Hub, type ConnData } from "./hub.ts";
import { createWorld } from "./store.ts";

const PORT = Number(process.env["NEO_DUMMY_PORT"] ?? 5292);
const FAULTS = new Set(
  (process.env["NEO_DUMMY_FAULTS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const world = createWorld("zh", FAULTS);
await initAuth(world);
const hub = new Hub(world);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });

/** token 从子协议里取：["neo.v1", "bearer.<token>"]，不落 URL 日志 */
function tokenFromProtocol(req: Request): string | undefined {
  const header = req.headers.get("sec-websocket-protocol") ?? "";
  for (const part of header.split(",").map((s) => s.trim())) {
    if (part.startsWith("bearer.")) return part.slice("bearer.".length);
  }
  return undefined;
}

function bearer(req: Request): string | undefined {
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : undefined;
}

const server = Bun.serve<ConnData>({
  port: PORT,
  async fetch(req, srv) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/ws") {
      const token = tokenFromProtocol(req);
      const lang = url.searchParams.get("lang") === "en" ? "en" : "zh";
      const upgraded = srv.upgrade(req, {
        data: { token, lang },
        headers: { "sec-websocket-protocol": "neo.v1" },
      });
      return upgraded ? undefined : new Response("upgrade failed", { status: 400 });
    }

    if (url.pathname === "/api/dev/reset" && req.method === "POST") {
      hub.reset();
      return json({ ok: true, reset: true });
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, port: PORT, faults: [...FAULTS] });
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as { email?: string; password?: string } | null;
      if (!body?.email || !body?.password) return json({ error: "missing credentials" }, 400);
      const grant = await login(world, body.email, body.password);
      if (!grant) return json({ error: "invalid credentials" }, 401);
      return json(grant);
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      const token = bearer(req);
      if (token) logout(world, token);
      return json({ ok: true });
    }

    if (url.pathname === "/api/me") {
      const token = bearer(req);
      const user = token ? verify(world, token) : null;
      return user ? json({ user }) : json({ error: "unauthorized" }, 401);
    }

    return json({ error: "not found" }, 404);
  },
  websocket: {
    open(ws) {
      const conn = hub.register(ws);
      if (!conn) return;
      if (FAULTS.has("token-expire") && !world.firedFaults.has("token-expire")) {
        world.firedFaults.add("token-expire");
        setTimeout(() => {
          try {
            ws.send(
              JSON.stringify({ v: 1, kind: "event", sessionId: "__auth__", seq: 1, event: { type: "auth.expired" } }),
            );
            ws.close(4401, "token expired");
          } catch {
            /* already closed */
          }
        }, 5_000);
      }
    },
    async message(ws, message) {
      await hub.handle(ws, typeof message === "string" ? message : message.toString());
    },
    close(ws) {
      hub.unregister(ws);
    },
  },
});

console.log(`[dummy] neo hub listening on http://127.0.0.1:${server.port}`);
console.log(`[dummy] faults: ${[...FAULTS].join(", ") || "none"}`);
