# neo GUI —— 现成项目调研与路线对比

> **最后更新:2026-10-25** · 状态：**调研完成，路线待选**
>
> **页面定位**：可借鉴的现成项目清单 + 一条被低估的路线（ACP 协议）。
> 本页所有数据来自 GitHub API 与官方文档实测，**非记忆**。

## 摘要

三条候选路线，代价递减、可达成的界面完整度递减：

| 路线 | 拿到什么 | 代价 | 判断 |
|---|---|---|---|
| **A. 实现 ACP agent 端** | 立刻可用 Zed / acp-ui 等现成 GUI + 生态互通 | S（一个 stdio JSON-RPC 适配层） | ⭐ **性价比最高，先做这个** |
| **B. A + 自建客户端 GUI** | 完全自有、可分发给团队 | M（A + 前端） | 推荐的终局 |
| **C. 自研后端 + 自研前端** | 完全自有、零协议约束 | M~L | 兜底，不是必须 |

**核心发现：neo 现有的能力集与 ACP 协议几乎逐条对应**（见 §3）。
这不是巧合 —— ACP 是这个领域的事实标准，neo 只是还没说这个语言。

---

## §1 候选项目清单（GitHub API 实测，2026-10-25）

| 项目 | Star | 许可 | 主语言 | 形态 | 活跃度 |
|---|---|---|---|---|---|
| **anomalyco/opencode** | 221,385 | MIT | TypeScript | TUI + **desktop app (beta)** + VS Code/JetBrains/Neovim/Zed/Emacs 扩展 | pushed 今日 13:46 |
| **OpenHands/OpenHands** | 91,790 | MIT | TypeScript | **Agent Canvas** —— local-first 可视化工作区，多 agent 并行 | pushed 今日 11:39 |
| **aaif-goose/goose**（原 block/goose） | 55,687 | Apache-2.0 | Rust | **Desktop app + CLI**，agent runtime，支持 ACP | pushed 今日 01:02 |
| **BloopAI/vibe-kanban** | 28,446 | Apache-2.0 | Rust | 看板形态，多 coding agent 并行 | pushed 09-19 |
| **agentclientprotocol/agent-client-protocol** | 4,501 | Apache-2.0 | Rust | **协议规范本身**（Zed + JetBrains 背书） | pushed 今日 06:34 |
| **openclaw/acpx** | 3,382 | MIT | TypeScript | 无头 ACP CLI 客户端 | pushed 今日 01:32 |
| **formulahendry/acp-ui** | 502 | MIT | **Vue** | 跨平台 ACP 客户端 GUI（桌面 / 移动 / Web） | pushed 05-25 |
| Cline | — | Apache-2.0 | TS | VS Code 扩展 | — |
| Aider | — | Apache-2.0 | Py | 终端（git-native） | — |

### 1.1 最值得看的两个形态

**OpenHands Agent Canvas**（官方自述）：
> a local-first workspace for running **one or multiple agent sessions**, inspecting conversations,
> managing files and terminals … **manages multiple agents in parallel** and switches backends
> from laptop to VM to cloud without changing the UI.

→ 形态上**最接近**用户期待的「多会话并行工作台」。

**OpenCode 架构**（官方自述）：
> **Client-server architecture lets multiple frontends connect to the same server.**
> Terminal TUI, with a desktop app in beta and IDE extensions for VS Code, JetBrains, Neovim, Zed, and Emacs.

→ **这正是 neo 该长的形状**：核心是 server，CLI / GUI / IDE 扩展都是 client。
neo 现在的 CLI 就是 client，缺的是把 core 暴露成 server。

### 1.2 抄 UI 的风险（OpenHands 官方博客原话）

> By mid-2026, **Continue.dev was acquired by Cursor, and Roo Code was archived in May 2026.**

→ 抄一个可能被收购/归档的项目的 UI，有维护风险。抄**协议**没有这个问题。

---

## §2 ACP：Agent Client Protocol

### 2.1 官方定义（agentclientprotocol.com 原文）

> The Agent Client Protocol (ACP) **standardizes communication between code editors/IDEs and coding agents**
> and is suitable for both local and remote scenarios.
>
> ACP solves this by providing a standardized protocol for agent-editor communication,
> **similar to how the Language Server Protocol (LSP)** standardized language server integration.
>
> - **Local agents** run as sub-processes of the code editor, communicating via **JSON-RPC over stdio**.
> - **Remote agents** can be hosted in the cloud, communicating over HTTP or WebSocket.
>
> The protocol re-uses the JSON representations used in MCP where possible,
> but **includes custom types for useful agentic coding UX elements, like displaying diffs.**
>
> The default format for user-readable text is **Markdown**.

传输层：**JSON-RPC 2.0**。协议版本：v1 = Latest，v2 = Draft。
官方库：Kotlin / Java / Python / Rust / **TypeScript** / Testing（Test Compatibility Kit）。
官方背书：Zed Industries + JetBrains（文档站导航链接）。

### 2.2 官方 TypeScript SDK

```bash
npm install @agentclientprotocol/sdk
```

- `agent()` —— 注册 agent 端 typed handlers
- `client()` —— 注册 client 端 typed handlers
- 生产级参考实现：**Gemini CLI** 的 `packages/cli/src/acp`

### 2.3 neo ↔ ACP 逐条对照

| ACP 方法 / 通知 | neo 现有对应物 | 状态 |
|---|---|---|
| `initialize` / `authenticate` | `loadConfig()` / provider 校验 | ⚠️ 需包装 |
| `session/new` | `createSession()` | ✅ 直接映射 |
| `session/load` | `loadSession()` / `applyRestored()` | ✅ 直接映射 |
| `session/list` / `session/delete` | `listSessions()` | ✅ 直接映射 |
| `session/prompt` | `Agent.send()` | ✅ 直接映射 |
| `session/update`（message chunks / tool calls / plans / mode changes / compaction） | **`AgentEvent`**（text/reasoning/tool_start/tool_end/turn_end/compact） | ✅ **几乎逐条对应** |
| `session/cancel` | `Agent.cancel()` | ✅ 直接映射 |
| `session/request_permission` | **`approve(tool, detail)`**（`src/agent.ts:821`） | ✅ 直接映射 |
| `session/set_mode` | **`PermissionMode`**（ask / auto-all / auto-edit / plan） | ✅ 直接映射 |
| Slash Commands（advertise + invoke） | **`COMMANDS` 表 32 条**（`src/input/commands.ts`） | ✅ 直接映射 |
| Tool Calls（含 **diff 类型**） | 16 个工具；`edit_file` 的 old/new 字符串 | ⚠️ 需映射 diff 结构 |
| `fs/read_text_file` / `fs/write_text_file` | `read_file` / `write_file` | ✅ 直接映射 |
| `terminal/create` / `output` / `kill` | `shell` 工具 | ⚠️ 需包一层 |
| Content（默认 Markdown） | `renderMarkdown()`（`src/ui/render.ts`） | ✅ 已有 |
| Agent Plan | `plan` 权限模式 | ✅ 直接映射 |
| 协议要求：路径必须绝对、行号从 1 开始 | neo 工具用相对路径 + 行号 | ⚠️ 需转换 |

**结论**：neo 的 16 工具 / 4 权限模式 / 32 命令 / 6 类事件 / 会话持久化，
**几乎是一份 ACP agent 实现的完整素材**。缺的只是一个 JSON-RPC 适配层。

---

## §3 三条路线的具体对比

### 路线 A：只做 ACP agent 端（推荐先做）

**做什么**：在 neo 里加 `src/acp/`，用 `@agentclientprotocol/sdk` 的 `agent()` 注册 handler，
把 `Agent` 的能力暴露成 stdio JSON-RPC。

**立刻得到**：
- **Zed** 里能用 neo（官方扩展已就绪）
- **acp-ui**（MIT，跨平台桌面/移动/Web）能接 neo
- goose / opencode / openclaw 同属 ACP 生态
- 一个兼容测试套件（Test Compatibility Kit）可验证实现正确性

**代价**：S —— 一个适配层 + 路径/行号/权限的映射修正。
**风险**：低 —— 不动核心 Agent，不动 CLI。

### 路线 B：A + 自建 GUI（终局推荐）

在 A 之上，neo 自建客户端 GUI。因为客户端侧也是 `@agentclientprotocol/sdk` 的 `client()`，
**前后端都是自己的代码，但接口是标准的**。

**架构**：
```
neo core (Agent + 16 工具 + memory + mailbox)
   └─ ACP server（stdio JSON-RPC）
        ├─ neo CLI（今天的 readline client）
        ├─ neo GUI（Tauri 壳 + ACP client）
        └─ Zed / acp-ui / 任何第三方 ACP 客户端（白送）
```

**优势**：
- GUI 与 CLI **共用一个协议边界**，行为天然一致（比"两套命令实现"可靠）
- 32 条命令只需在 ACP 层映射一次，CLI 和 GUI 同时受益
- 未来进 IDE 零成本

**代价**：M —— A + 前端。

### 路线 C：自研后端 + 自研前端（兜底）

原策划路线（`gui/gui-prd.md` §4）。自定义 HTTP + SSE 协议。

**什么时候才需要 C**：
- 不接受任何外部协议依赖
- 需要 GUI 里有 ACP 表达不了的能力（多会话看板、跨会话对端面板、文件树等）

**代价**：M~L，且 GUI 与 CLI 的命令面要靠漂移守卫维持一致。

---

## §4 建议

**先做 A，再决定 B 或 C。**

理由：
1. A 的产出（ACP agent 端）**在 B 和 C 里都不会浪费** —— ACP 层是第三种客户端（CLI）的同源物。
2. A 一旦跑通，**你手上就有一个能用的图形界面**（Zed 或 acp-ui），
   可以在此基础上判断「还差什么」—— 这比对着空白页设计准得多。
3. A 顺带给出了 **diff 的标准类型**（ACP 明确定义了 diff 展示类型），
   §原策划 里「GUI 的第一个增量价值」不用自己设计了。
4. 抄 UI 有维护风险（§1.2）；接协议没有。

**风险**：
- ACP v1 与 v2 并存（v2 在 Draft）→ 实现时锁 v1，跟进 v2 迁移文档
- 协议里有 4 处需要适配 neo 现状：路径绝对化、行号 1-based、terminal 包一层、diff 结构化

**工作量**：A ≈ S（比原策划的 M0 少），B ≈ M，C ≈ M~L。
