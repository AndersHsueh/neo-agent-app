import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig, type Plugin } from "vite";

/**
 * neo 端点发现（仅 dev）：把 Hub 的发现文件 + token 暴露给浏览器。
 *
 * 浏览器拿不到 ~/.neo/run/core.json，所以由 Vite 中间件代读：
 *   GET /__neo/endpoint →
 *     200 {ok:true, url, token, user, coreVersion, protocolVersion, pid, startedAt}
 *     503 {ok:false, reason}
 *
 * 生产（Tauri 壳）由本地后端实现同路径；客户端只认这一个契约。
 */
function neoDiscoveryPlugin(): Plugin {
  return {
    name: "neo-discovery",
    configureServer(server) {
      server.middlewares.use("/__neo/endpoint", async (_req, res) => {
        const send = (status: number, body: unknown): void => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify(body));
        };
        try {
          const runFile = join(homedir(), ".neo", "run", "core.json");
          const run = JSON.parse(readFileSync(runFile, "utf8")) as {
            url?: string;
            pid?: number;
            tokenFile?: string;
            startedAt?: string;
          };
          if (!run.url) return send(503, { ok: false, reason: "core.json 缺少 url" });
          const tokenFile = run.tokenFile ?? join(homedir(), ".neo", "run", "core.token");
          const token = readFileSync(tokenFile, "utf8").trim();
          if (!token) return send(503, { ok: false, reason: "core.token 为空" });

          const httpBase = run.url.replace(/^ws/, "http").replace(/\/ws$/, "");
          // dev-auth 登录换 user（服务端直连，避免浏览器 CORS）；失败不阻塞主流程。
          let user = { id: "local", email: "local@localhost", displayName: "Local", role: "owner" };
          try {
            const login = await fetch(`${httpBase}/api/auth/login`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ email: "local@localhost", password: "" }),
            });
            if (login.ok) {
              const grant = (await login.json()) as { user?: typeof user };
              if (grant.user) user = grant.user;
            }
          } catch {
            /* dev-auth 未开时也能连（token 已足够） */
          }

          let coreVersion: string | undefined;
          let protocolVersion: string | undefined;
          try {
            const health = (await (await fetch(`${httpBase}/health`)).json()) as {
              coreVersion?: string;
              protocolVersion?: string;
            };
            coreVersion = health.coreVersion;
            protocolVersion = health.protocolVersion;
          } catch {
            /* health 可选 */
          }

          return send(200, {
            ok: true,
            url: run.url,
            token,
            user,
            coreVersion,
            protocolVersion,
            pid: run.pid,
            startedAt: run.startedAt,
          });
        } catch (error) {
          return send(503, { ok: false, reason: (error as Error).message });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [preact(), neoDiscoveryPlugin()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5296,
    strictPort: true,
  },
  build: { target: "es2022", sourcemap: true },
});
