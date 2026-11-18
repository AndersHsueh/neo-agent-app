# neo-agent-app · NEO 桌面工作台

> 版本 **v0.1.0** · 已接入 **matrix-core v0.0.2 Hub**（真实后端，非仿真）
> 前端：Preact + Vite + signals + 自有设计系统 · 测试：vitest；Playwright 默认只跑不依赖 Hub 的 GUI 组

neo 的图形工作台：把「多会话 agent」做成本地可操作的控制台——会话并行、流式正文与思维链、
工具调用卡、审批与提问、命令面板、图片附件、断线重连，全部连真实 Hub。

```
┌──────────────────────────────┐
│ 浏览器（Preact，dev）         │
│ 或 Tauri 壳（生产，未接）     │
└──────────────┬───────────────┘
               │ ① GET /__neo/endpoint   （发现 ws 地址 + token + user）
               ▼
┌──────────────────────────────┐
│ Vite dev 中间件 / 本地后端    │──② 读 ~/.neo/run/core.json + core.token
└──────────────┬───────────────┘
               │ ③ WebSocket /ws（子协议 neo.v1 + bearer.<token>）
               ▼
┌──────────────────────────────┐
│ matrix-core hub v0.0.2        │  （neo-core-serve，独立仓库）
│  ├─ session 元数据/发现/鉴权  │
│  └─ 每会话一个 worker 子进程  │──→ Agent + LLM + 工具（shell/文件/搜索…）
└──────────────────────────────┘
```

## 快速开始

前置：**matrix-core 在运行**，且 `~/.neo/settings.json` 里配好可用 provider（否则能连上但不能对话）。

```bash
# 1) 起后端（另一个仓库）
cd ../neo-core-serve
bun src/main.ts hub --port 0 --dev-auth --cwd current_prj
#   → ws://127.0.0.1:<port>/ws，发现文件 ~/.neo/run/core.json

# 2) 起前端
cd ../neo-agent-app/gui
bun install
bun run dev            # http://localhost:5296（自动发现 Hub，无登录页）
```

Hub 没起时前端显示离线兜底页（原因 + 重试）；Hub 中途挂掉则显示工作台 + 离线横条并退避重连。

## 工程闸门

```bash
cd gui
bun run check          # typecheck + biome + vitest
bun x playwright test  # 默认 @gui：布局夹具和离线兜底，不需要 Hub，也不需要模型
bun run build          # typecheck + vite build

# 下面三组默认不跑。打开之后如果前提不在，对应用例失败，不会被跳过。
NEO_E2E_HUB=1 bun x playwright test --project=hub
# 真实 Hub，不含模型回合（发现、命令、附件超限、离线后重试）

NEO_E2E_FAKE_LLM=1 bun x playwright test --project=fake-llm
# 选出 @llm 用例。这个开关只决定跑哪些用例，不会拦住 Hub 去访问 settings 里的地址。
# 零外部费用靠的是把 provider 配成 127.0.0.1 的假服务，不是这个开关本身。

NEO_E2E_LLM=1 bun x playwright test --project=llm
# 外部真提供方。会打到 settings 里的地址，可能产生费用。
```

`bun run test:e2e` 就是 `playwright test`，因此默认也只有 `@gui`。
当前单测是 vitest 47。Playwright 不再有「默认 12 pass、而且必须有真模型」这一档。
分组和某次隔离联调的计数见 [`gui/tests/e2e/README.md`](gui/tests/e2e/README.md) 与 [`docs/integration/README.md`](docs/integration/README.md)。

## 仓库结构

```
gui/                    前端（唯一在维护的代码）
  src/protocol/         vendored 协议真源（types/guards/fixtures/reducer/commands.json）
  src/transport/        WS 传输：发现、配对、4401/4408、退避重连
  src/state/            signals store + 控制器（app.ts）+ reducer 兼容层
  src/lib/              端点发现、markdown 渲染、附件、命令目录适配
  src/components/       设计系统原子 + Prose/CodeBlock
  src/features/         boot / login(离线兜底) / workbench / transcript / composer /
                        approval / palette / settings / usage
  src/i18n/             zh/en 类型化字典（缺 key 编译期报错）
  src/styles/           令牌与组件样式
  tests/unit|e2e/       单测 + 真实 Hub e2e
docs/
  integration-v0.0.2-report.md   联调总报告（改动/验证/后端问题/限制）
  hub-probe-findings.md          真实 Hub 协议实测清单（14 项）
  vendor-patches.md              协议 vendor 与 core 的差异清单
  shots/integration-v0.0.2/      界面证据截图
  gui-v1-*.md, gui-build-plan.md 早期产品/架构/设计/计划文档
dummy-serv/              v0.0.1 时期的协议仿真器（**已退出联调链路**，仅历史参考）
scripts/probe-hub.ts     Hub 协议探测脚本（bun run scripts/probe-hub.ts）
```

## 已实现（v0.1.0）

- **真实 Hub 接入**：发现即登录（`/__neo/endpoint`）、`neo.v1` 子协议、按 capabilities 降级
- **多会话**：磁盘会话列表、新建/切换/关闭/resume、两会话并行互不串流、单连接单会话绑定
- **对话**：流式正文（完整 markdown：标题/列表/GFM 表格/代码块/引用/链接）、思维链折叠、
  工具卡、轮次统计（耗时/token/工具数/上下文/结束原因）
- **交互**：写文件审批（内联 + 弹窗，无 diff 显示 detail，倒计时）、AskUser（单选/多选/自由输入）
- **命令**：面板由 `commands.json` 生成，支持 `/tier fast` 带参、未知命令回执、结果卡（7 种 ViewBlock）
- **附件**：选择/粘贴图片 → 预览 → 发送（≤5 张、单张 ≤5MB、png/jpeg/webp，超限有提示）
- **可靠性**：刷新后新开一条 WebSocket 再 attach，快照重建、不重影。这次隔离联调验证的是这一条，外加发现、登录、建会话、关闭后再 attach、离线兜底。同一页上的指数退避恢复、Hub 进程重启恢复、回合进行中的恢复，这次没有测。
- **中英切换**、上下文用量条、设置/用量面板（设置只读，Hub v0.0.2 未实现写入）

## 已知限制

- 历史轮次的图片不回显（v0.0.2 协议不回传附件元数据）；`settings.patch` 只读；同会话单客户端 attach
- Hub `detach` 不回收 worker（无空闲回收）→ 长时间切会话会堆进程，需 Hub 侧修（见联调报告 §5）
- 生产壳（Tauri）未接：`/__neo/endpoint` 需由壳的本地后端实现同契约
- 长会话未做虚拟化；Windows/Linux 未实机验收

## 文档

- 联调报告（推荐先读）：[`docs/integration-v0.0.2-report.md`](docs/integration-v0.0.2-report.md)
- Hub 实测清单：[`docs/hub-probe-findings.md`](docs/hub-probe-findings.md)
- 协议 vendor 差异：[`docs/vendor-patches.md`](docs/vendor-patches.md)
- 前端细节与命令：[`gui/README.md`](gui/README.md)
- 后端联调指南（core 仓）：`neo-core-serve/docs/gui-integration-v0.0.2.md`

## 版本

| Tag      | 内容                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------- |
| `v0.1.0` | GUI 接入真实 matrix-core v0.0.2 Hub：多会话/流式/审批/提问/命令/附件/重连 + markdown 渲染；e2e 切真实链路 |
