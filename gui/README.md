# neo GUI（v1 前端）

neo 的桌面工作台前端。**严格分层 + 自有设计系统**，对接真实后端 **Matrix-Core v0.0.2 Hub**
（`neo-core-serve`，本地多会话、每会话一个 worker 子进程）。

```
浏览器(Preact) ──GET /__neo/endpoint（发现+token）──▶ Vite dev 中间件 ──读──▶ ~/.neo/run/core.json
       └──────────── WebSocket /ws（neo.v1 + bearer.<token>）────────────▶ matrix-core hub
```

> `dummy-serv/` 是 v0.0.1 时期的协议仿真器，**联调已不再使用**（保留仅作历史参考，不参与 dev/test）。

## 快速开始

```bash
# 1) 起后端（另一个仓库）
cd ../neo-core-serve && bun src/main.ts hub --port 0 --dev-auth --cwd current_prj

# 2) 起前端（本目录）
cd ../neo-agent-app/gui
bun install
bun run dev            # vite :5296，自动发现 Hub 并连上（无登录页）
# 打开 http://localhost:5296
```

LLM 配置走用户级 `~/.neo/settings.json`（0600，勿提交）；不给也能连上 Hub，只是发消息会 `stats.error`。

其他命令：

| 命令                | 作用                                                     |
| ------------------- | -------------------------------------------------------- |
| `bun run dev`       | vite dev；`GET /__neo/endpoint` 由插件代读 `~/.neo/run/` |
| `bun run typecheck` | `tsc --noEmit`（strict + noUncheckedIndexedAccess）      |
| `bun run test`      | vitest（reducer / protocol / i18n）                      |
| `bun run test:e2e`  | playwright（真实 Hub + vite，需 Hub 在跑）               |
| `bun run lint`      | biome（0 error 才算过）                                  |
| `bun run check`     | typecheck + lint + unit                                  |
| `?gallery=1`        | 组件墙（视觉基线）                                       |

## 目录

```
src/
  protocol/    vendored 协议真源（来自 neo-core-serve/src/protocol，见 ../docs/vendor-patches.md）
               types / guards / fixtures / reducer / commands + commands.json
  transport/   WebSocket 客户端：发现端点、请求-响应配对、4401/4408、退避重连
  state/       signals store + 纯 reducer（protocol/reducer 的兼容层）+ 控制器（app.ts）
  lib/         端点发现、附件读取、命令目录适配、档位、动效
  components/  设计系统原子（自有，无 UI 库）+ SVG sprite
  features/    boot / login(离线兜底) / workbench / transcript / composer / approval /
               palette / settings / usage
  i18n/        zh/en 类型化字典（少 key 编译期红）+ t()
  styles/      原型收敛的令牌与组件样式
  dev/         gallery（组件状态矩阵）
```

## 启动与连接语义（v0.0.2）

1. `bootstrap()` → `GET /__neo/endpoint`（dev 由 Vite 插件读 `~/.neo/run/core.json` + `core.token`）。
2. 连 `ws://127.0.0.1:<port>/ws`，子协议 `["neo.v1","bearer.<token>"]`；失败 4401 → 重新发现（token 轮换）。
3. `ready` 后 `session.list` + `settings.get`；恢复上次会话（`localStorage["neo.activeSession"]`），没有就新建。
4. 换会话必须 `session.detach` 再 `attach`（单连接单会话）；`attach` 总是拿完整 snapshot。
5. 断线重连以 snapshot 重建（`lastSeq/epoch` 会带上，v0.0.2 不做增量回放）。
6. `session.create` 必须带 `title`：Hub 只在 title/首轮时落盘，否则紧接着 `attach` 会 `not_found`。

## 工程闸门

```
bun run check && bun run test:e2e
```

## 已经能做什么

- 自动发现真实 Hub（无登录页；Hub 未启动显示离线页 + 重试）
- 多会话侧栏（磁盘会话 + 运行中状态）、新建/切换/关闭/恢复（resume）
- 流式正文（**完整 markdown 渲染**：标题/列表/GFM 表格/代码块/引用/链接，零依赖安全渲染）、思维链折叠、工具卡、轮次统计（v1.2 新字段：finishReason/contextUsage/error）
- AskUser：单选、多选、自由输入；写文件审批（内联 + 弹窗；无 diff 显示 detail，倒计时读 deadlineAt）
- 命令面板由 `commands.json` 生成（`/tier fast` 带参、未知命令有回执、结果卡 7 种 ViewBlock）
- 图片附件：选择/粘贴 → 预览 → `turn.send.attachments`（≤5 张 / 单张 ≤5MB / png|jpeg|webp）
- 断线自动重连、离线兜底页、刷新后恢复会话与历史
- 中英完整切换

## 没做（本版）

- Tauri 壳与分发
- 历史轮次的图片回显（v0.0.2 协议不回传附件元数据，刷新后消失）
- `settings.patch` 写入（Hub 未实现，UI 只读）
- 多客户端同时 attach 同一会话（Hub v0.0.2 限制）
- 长会话虚拟化

## 文档

- 联调：`../docs/integration-v0.0.2-report.md`
- 协议快照补丁：`../docs/vendor-patches.md`
- 产品/架构/协议/设计/计划：`../docs/gui-v1-*.md`、`../docs/gui-build-plan.md`
- 后端联调指南（在 core 仓）：`neo-core-serve/docs/gui-integration-v0.0.2.md`
