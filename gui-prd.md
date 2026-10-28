# neo GUI —— 策划（定案版 v2）

> **最后更新:2026-10-25** · 状态：**形态已拍板，待开工** · 依据：`neo` v0.2.3 实测代码（HEAD `cca3759`）+ 用户决策 + 官方文档核实
>
> **页面定位**：GUI 的形态定案 + 架构方案 + 里程碑规划。本页是**策划**，不是实现规格。
>
> **不是**：实现级 PRD（开工前需再出一份带接口签名的规格）、发布说明。

## 摘要

**形态定案：Tauri 桌面壳 + Bun 多进程后端，开发期用浏览器直连，生产期打成安装包分发给团队。**

v1 草案推荐「纯本地 Web 面板」，本轮深挖后**改变结论**，原因是三条新证据：

1. **同进程多会话走不通**（硬约束）。工具注册表是模块级全局，重复注册直接抛错，
   且 `task` 工具的闭包绑定具体 agent 实例 → 第二个会话注册时炸。
   → 后端必须**多进程**，每个会话一个子进程。
2. **Bun 1.3 已具备团队分发的全部能力**（已核实官方博客）：
   全栈 app 单文件编译、**跨平台交叉编译**、**macOS/Windows 代码签名**。
   → 「分发给团队」不需要额外运行时，Bun 编译产物直接进安装包。
3. **多进程恰好契合既有 mailbox 设计**。跨会话消息本来就是文件状态机
   （`.alive` + heartbeat + watchdog），为跨进程协作而生 —— CLI 多开即多进程。
   → 多进程不是妥协，是**顺着原设计走**。

工作量：M0+M1 合并（用户拍板「聊天 + 多会话一步到位」）= **M**，
M2 文件树 + diff = **M**，M3 Tauri 打包分发 = **M**。

---

## §1 用户决策（已拍板）

| 项 | 决策 |
|---|---|
| 形态 | 无强偏好，硬选偏 **Tauri**；附加问题：Claude Code 的 app 是什么形态 → 见 §2 |
| 分发范围 | **要分发给团队** → 打包、代码签名、配置迁移全部要设计 |
| MVP 范围 | **聊天 + 多会话一步到位**（M0+M1 合并） |

---

## §2 对标：Claude Code 的 app 是什么形态

> 以下均来自 Anthropic 官方文档与官网，非记忆。

### 2.1 官方表面清单

Anthropic 开发者文档站的导航栏直接列出全部表面：

> Developer docs / Blog / **Desktop** / **VS Code** / **JetBrains** / **On the web** / **Slack** / `curl` / CLI

即 **6 个表面**：桌面 App、VS Code 扩展、JetBrains 扩展、Web 版、Slack、CLI。
Claude Code **不是**一个软件，而是同一套 agent 的多个入口。

### 2.2 桌面 App 的能力（2026 年版）

| 能力 | 说明 |
|---|---|
| **可视化 diff 审阅** | 在桌面 diff 视图里直接留评论、标 bug、提建议；逐行接受/拒绝 |
| **PR / CI 监控** | 开 PR 后跟踪 CI 通过/失败，可开 auto-fix 甚至 auto-merge |
| **多会话侧边栏 + 历史列表** | 「Redesigned Desktop app」的定位原文：*Built to help you run more Claude Code tasks at once* |
| **定时任务** | 设每日自动执行 |
| **并行分派** | 同时跑多个自动化任务 |
| **快捷键** | `Ctrl+Esc` 呼出、`Alt+Ctrl+K` 插入文件引用 |
| **Computer use** | 桌面 App（macOS/Windows）可让 Claude 操作 GUI |

### 2.3 会话在表面之间流动

- CLI 里 `/desktop` → 把完整会话上下文带进桌面 App
- 桌面 App 的「Continue with Claude Code on the web」→ 本地会话移到云端
- 桌面 App 起的任务，可在手机 App 里接着做

### 2.4 对 neo 的启示（三条可直接抄）

1. **桌面 App 的定位不是「更好看的终端」，而是「多任务工作台」** ——
   并行会话、任务看板、后台自动化。neo 的 `mailbox` + 多会话正好对位这个位置。
2. **diff 审阅是桌面 App 的第一杀手锏** —— neo 的 `edit_file` 审批现在只有一行文字，
   GUI 把它升级成 diff 视图，是与 CLI 的**第一个明确增量**。
3. **会话必须在表面之间可迁移** —— neo 的会话本来就是 `~/.neo/sessions/*.json`，
   天然可迁移，**白送**。

### 2.5 我没查到的

**Claude Code 桌面 App 的技术栈（Electron / 原生 / Tauri）没有官方说明。**
我检索了官方文档与工程博客，只找到第三方讲 Electron 开发通用实践的文章，
没有 Anthropic 自己披露桌面 App 的实现栈。

→ 这一项**未验证**，不要拿它当选型依据。下面的 Tauri 结论是基于 neo 自身条件推出的，不是「Anthropic 也用 Tauri」。

---

## §3 现状盘点（已验证，含文件行号）

### 3.1 技术底座

| 项 | 事实 | 证据 |
|---|---|---|
| 运行时 | Bun + TypeScript | `package.json` `engines.bun>=1.1.0` |
| 依赖 | **零运行时依赖**，devDeps 仅 `@types/bun` + `typescript` | `package.json` |
| 代码量 | 63 个 `.ts`，15808 行 | `src/` 实测 |
| 测试基线 | `bun test` **530 pass / 0 fail**（27 文件），`tsc` 零错误 | 项目记忆「当前状态」 |
| 工作区 | **v0.2.4 输入增强未落定**：`src/input/`、`tests/{commands,completion,file-index,multiline,references}.test.ts` 未跟踪 | `git status` |

### 3.2 核心可复用点

`src/agent.ts` **不 import readline**（readline 只在组合根 `src/index.ts`）。
Agent 只认两个契约：

| 契约 | 位置 | 内容 |
|---|---|---|
| `AgentIO` | `src/agent.ts:32-54` | 输出接口：`line/blank/info/warn/error/toolHeader/toolResult/indent/startSpinner/updateSpinner/stopSpinner/beginStream/writeStream/endStream/ensureStreamClosed/confirm` + `width` |
| `AgentEvent` | `src/agent.ts:56-67` | 事件流：`text / reasoning / tool_start / tool_end / turn_end / compact / error / aborted` |
| `Agent.send()` | `src/agent.ts:391` | 单一入口。入参 `string \| {text, images}`，返回 `TurnStats` |
| `TurnStats` | `src/agent.ts:102-113` | `durationMs / promptTokens / completionTokens / reasoningTokens / toolCalls / iterations / finishReason / aborted / tierSwitch` |
| 审批链路 | `src/agent.ts:816-826` | `approve(tool, detail)` 按 mode 分派：`auto-all` 全放行 / `auto-edit` 放行非 shell / `plan` 全拒 / 否则问用户 |
| `ToolCtx` | `src/tools/types.ts:30-48` | `cfg / approve / host / signal / onNotice / onProgress` |
| 控制面 | `src/agent.ts:189-340` | `toolSpecsFor() / cancel() / requestCompact() / noteModelChange() / reset() / compactNow() / contextUsage()` |

### 3.3 ⚠️ 硬约束：工具注册表是进程级全局

这是**决定架构的关键事实**，必须写清楚：

```ts
// src/tools/index.ts:817
const registry = new Map(TOOLS.map((t) => [t.spec.function.name, t]));

// src/tools/index.ts:829-833
export function registerTool(impl: ToolImpl): () => void {
  const name = impl.spec.function.name;
  if (registry.has(name)) {
    throw new Error(`工具 ${name} 已注册，不能重复注册`);
  }
  ...
}
```

而组合根每个会话都要注册一次绑定自身 agent 的工具：

```ts
// src/index.ts:524-528
registerTool(makeTaskTool({
  run: (prompt, tier, ctx) => runSubagent(agent, prompt, tier, ctx),
}));
```

**推论**：

- 同一进程开第二个会话 → `registerTool(task)` 直接**抛异常**
- 即便不抛错，`task` 的 `run` 闭包绑的是**第一个** agent → 子代理会派到错误的会话
- 同理受影响的还有 `remember`（`src/tools/memory.ts`）、`send_message` / `list_peers`（`src/tools/mailbox.ts`）、`wiki_search` / `wiki_write`（`src/tools/wiki.ts`）

→ **单进程多会话不可行**，除非把工具注册表改成 per-session 工厂（改核心，成本高）。
→ **选择：多进程**。每个会话一个 Bun 子进程，工具注册天然隔离。

### 3.4 多进程与既有设计同构

| 既有机制 | 为谁设计 | 多进程下表现 |
|---|---|---|
| mailbox `.alive` 锁 | 防同 sessionId 双开 | 不同 sessionId 互不冲突 ✅ |
| heartbeat（`src/index.ts:449-459`） | 长 turn 也刷新，防止误报 dead | 独立心跳，多进程各自刷新 ✅ |
| watchdog | 检测停滞会话 | 跨进程看彼此状态 ✅ |
| `list_peers` / `send_message` | 跨会话协作 | **正是多进程场景的主场** ✅ |

CLI 现在多开两个窗口就是两个进程 —— GUI 多 tab 直接沿用同一套语义。

### 3.5 `src/index.ts` 的拆分边界（可抽取）

| 行段 | 内容 | 归属 |
|---|---|---|
| 265-634 | 参数、配置、session、memory、mailbox、agent 装配、`registerTool`、`-p` 单次模式 | → **抽到 `src/app.ts`** |
| 635-1195 | readline 交互层：`createInterface`、hotkeys、paste、completion、multiline、prompt 循环 | → 留在 CLI |
| 1226-2144 | `handleCommand()` 32 条命令 | → 抽到 `src/commands.ts`（CLI 与 server 共用） |

`handleCommand` 有两处 TTY 分支（`src/index.ts:1331` / `1419` / `1535` / `1803`）走 `select` 选择器，
GUI 需要换成自己的下拉 —— 抽接口时一并抽象。

**命令表 `src/input/commands.ts` 是唯一数据源**，`tests/commands.test.ts` 有漂移守卫。
搬迁后守卫必须继续覆盖，否则 GUI 与 CLI 的命令面静默分叉。

### 3.6 状态全在文件系统

| 状态 | 位置 |
|---|---|
| 会话 | `~/.neo/sessions/<ts>-<id>.json`（`SessionFile{version,meta,messages}`），图片附件外置 `attachments/<sessionId>/` |
| 跨会话信箱 | mailbox root，按 `sessionId` 分目录 |
| 记忆 | `~/.neo/memorys`（用户级）+ 项目级 |
| 记忆 wiki | `<cwd>/.neo/wiki/`（raw/ wiki/ outputs/） |
| 技能库 | `~/.neo/skills/<name>/SKILL.md` |

### 3.7 工具面（16 个）

`read_file` `write_file` `edit_file` `list_dir` `glob` `grep` `shell` `web_fetch`
`use_skill` `compact_ctx` `task` `remember` `send_message` `list_peers` `wiki_search` `wiki_write`

---

## §4 架构定案

### 4.1 全景

```
┌──────────────── Tauri 壳（Rust，薄壳，~200 行）────────────────┐
│  开窗 / 托盘 / 菜单 / 代码签名 / 单实例 / 自动更新               │
│  内嵌 WebView 加载 http://127.0.0.1:<随机端口>                 │
└───────────────────────────┬───────────────────────────────────┘
                            │ 启动 / 关闭
┌───────────────────────────┴───────────────────────────────────┐
│  Bun 后端（gui/server）                                        │
│    ├─ HTTP API：会话 CRUD / 发消息 / 审批 / 命令 / 侧栏 / 文件    │
│    ├─ SSE：按会话推送 AgentEvent + 审批请求 + 对端消息          │
│    └─ 会话池：每个会话 spawn 一个子进程 ──────────────────┐    │
└──────────────────────────────────────────────────────────┼────┘
                                                           │ JSONL over stdin/stdout
                                    ┌──────────────────────┴────────────┐
                                    │  neo 会话进程（每会话一个）         │
                                    │    src/app.ts（抽出的组合根）       │
                                    │      ├ Agent（src/agent.ts）       │
                                    │      ├ 工具注册（进程内唯一）      │
                                    │      ├ memory bridge              │
                                    │      └ mailbox identity           │
                                    └────────────────────────────────────┘
```

### 4.2 为什么是这个形状

| 设计点 | 理由 |
|---|---|
| **多进程而非单进程** | §3.3 的硬约束；且崩溃隔离、内存隔离、mailbox 语义全部天然成立 |
| **后端仍是 Bun** | Agent 逻辑是 TS，运行时不能换；Bun 1.3 已支持单文件编译 + 交叉编译 + 代码签名（§5） |
| **Tauri 而非 Electron** | 团队分发要控制安装包体积：Tauri 壳 ~10MB，Electron ~200MB。Bun 后端二进制约 90-100MB，两者打包后 Electron 方案约 300MB，Tauri 方案约 100MB |
| **前端无框架** | 本项目 UI 复杂度中等；无框架 → 零构建步骤，`bun build` 直接产出静态资源。嫌繁琐再引 Preact |
| **开发期用浏览器** | 开发 Tauri 壳要 Rust 工具链 + 编译，慢。前端迭代阶段直接 `bun run gui` 用浏览器，壳留到最后写（壳不动核心） |

### 4.3 会话进程协议

**下行（前端 → 会话进程）**，JSONL over stdin：

```json
{"type":"send","text":"...","images":["data:image/png;base64,..."]}
{"type":"command","name":"mode","args":["ask"]}
{"type":"approve","id":"ap-1","approved":true}
{"type":"cancel"}
{"type":"compact"}
```

**上行（会话进程 → 前端）**，JSONL over stdout：

```json
{"type":"event","seq":12,"event":{"type":"text","data":"增量文本"}}
{"type":"event","seq":13,"event":{"type":"tool_start","data":{"name":"edit_file","args":{...}}}}
{"type":"approval","id":"ap-1","tool":"edit_file","detail":"...","diff":{...}}
{"type":"ready","sessionId":"...","model":"...","tier":"..."}
{"type":"stats","data":{...TurnStats}}
```

**协议纪律**（必须遵守，否则调试成本爆炸）：

1. **stdout 只走协议**。日志、警告一律走 stderr。CLI 的 `ui.line()` 在协议模式下必须改道 ——
   这是 `Console` 实现的一个变体（`ProtocolConsole`），不是到处打补丁。
2. **事件带 `seq`**。SSE 断线重连时按 `cursor` 补发，避免丢 token 流。
3. **审批请求必须有超时兜底**（默认拒绝）。`approve()` 是 `Promise<boolean>`，
   用户不点就永久挂起，后端会一直等。

### 4.4 HTTP API（草案）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/sessions` | 会话列表（`listSessions()`） |
| POST | `/api/sessions` | 新建会话 → spawn 子进程 |
| GET | `/api/sessions/:id` | 会话详情（`loadSession()`） |
| POST | `/api/sessions/:id/messages` | 发消息 → 转发到子进程 |
| POST | `/api/sessions/:id/cancel` | 取消本轮 |
| POST | `/api/sessions/:id/approve` | 回审批决定 |
| POST | `/api/sessions/:id/commands` | 执行斜杠命令 |
| GET | `/api/commands` | 命令表（复用 `COMMANDS`） |
| GET | `/api/skills` `/api/memory` `/api/wiki` `/api/peers` | 侧栏数据 |
| GET | `/api/files?path=` | 文件树 / 文件内容（白名单在 `cwd` 内） |
| GET | `/api/sessions/:id/events` | **SSE**，每会话一条连接 |

### 4.5 渲染映射：行式 → 块式

`AgentIO` 是行式（`line("...")` 追加一行），GUI 要块式（一条消息一个卡片）。

**原则：GUI 主要消费 `AgentEvent`**（已结构化），`AgentIO` 只作降级通道。

| GUI 元素 | 数据来源 |
|---|---|
| 助手消息正文 | `AgentEvent{type:"text"}` 增量拼接 |
| 思维链（可折叠） | `AgentEvent{type:"reasoning"}` 增量拼接 |
| 工具卡片 | `tool_start` 开卡 + `tool_end` 收口（带 `ok` / `truncated`） |
| 工具输出详情 | `AgentIO.toolResult(body, maxLines, ok)` 的 body（抽屉看全文） |
| 轮次统计条 | `TurnStats` |
| 审批弹窗 | `approve(tool, detail)` 被调用时挂起 deferred，附 diff |

---

## §5 团队分发链路（已核实 Bun 1.3 能力）

Bun 1.3 官方博客（bun.com/blog/bun-v1.3）明确提供：

| 能力 | 命令 |
|---|---|
| 全栈 app 单文件可执行 | `bun build --compile ./index.html --outfile myapp` |
| **跨平台交叉编译** | `bun build --compile --target=bun-linux-x64\|bun-darwin-arm64\|bun-windows-x64 ./app.ts` |
| **macOS 代码签名** | `codesign --sign "Developer ID" ./myapp` |
| **Windows 代码签名** | `signtool sign /f certificate.pfx ./myapp.exe` |
| Windows 可执行元数据 | `--title --publisher --version --description --copyright` |

### 分发产物

```
bun build --compile --target=bun-<plat>-<arch> gui/server/main.ts --outfile neo-gui
  ↓
Tauri 打包：macOS .dmg（Developer ID 签名 + 公证）/ Windows .msi / Linux .deb
  ↓
安装包 ≈ 100MB（其中 Bun 运行时约 90MB，Tauri 壳约 10MB）
```

### 团队配置迁移（"分发给团队"必须解决的三件事）

| 问题 | 方案 |
|---|---|
| `settings.json` 不进版本控制 | 首次启动**引导页**：填 provider / base_url / api_key → 写入**用户级** `~/.neo/settings.json`（不碰项目目录） |
| 密钥下发 | **不预置密钥**。团队各自填自己的 key；或提供「导入配置」按钮读一个本地文件 |
| 多 provider 清单 | 引导页支持批量粘贴 `settings.json`，前端只显示掩码，**api_key 不进前端产物** |

**红线**：任何路径都不得把 api_key 送到前端。`maskKey()`（`src/config.ts` 已导出）必须在 API 层就应用。

---

## §6 UI 信息架构

### 6.1 四区布局

```
┌──────────┬────────────────────────────────┬──────────────┐
│  左栏     │            中间：对话流         │  右栏         │
│ 会话列表  │  用户消息（@ 引用 / 图片）       │ 上下文用量     │
│  ├ 新建   │  助手消息（markdown + 代码）     │ token 成本     │
│  └ 恢复   │  思维链（折叠 ▸）               │ 档位/分类器    │
│ 项目工作区 │  工具卡片（可展开看输出）        │ 权限模式       │
│  ├ 文件树 │  审批弹窗（写操作 diff 预览）    │ 存活对端会话   │
│  ├ 记忆   │                                │              │
│  ├ wiki   │                                │              │
│  └ 技能   │                                │              │
├──────────┴────────────────────────────────┴──────────────┤
│  输入框：多行 / @ 文件 / 粘贴图片 / 斜杠命令面板（⌘K）      │
└────────────────────────────────────────────────────────────┘
```

对标 Claude Code 桌面 App 的定位：**多会话工作台**，不是「更漂亮的聊天框」。
所以左栏的会话区是一等公民（可并行、可命名、可看状态），不是附属。

### 6.2 三个交互要点

**① 命令面板（⌘K）** — 复用 `COMMANDS` 表（32 条），走 `/api/sessions/:id/commands`，
与 CLI 同一份实现（§3.5），保证两个界面行为不分叉。

**② 审批弹窗 + diff** — `edit_file` / `write_file` 审批时展示变更前后对比。
CLI 现在只有一行文字（`src/agent.ts:826` 附近），这是 GUI 的**第一个明确增量价值**。
需要工具层把 diff 信息透出，属于 §3.5 同一次改造的附带项。

**③ @ 引用与文件选择** — 复用 `src/input/{fileIndex,references}.ts` 的匹配逻辑，
UI 换成「输入 `@` 弹候选列表」，不受终端列数限制。

---

## §7 里程碑与验收

> 用**相对工作量**（S/M/L）而非人天 —— 我没有你的投入信息，给天数是编的。

### 前置：v0.2.4 输入增强落定

当前 `src/input/` + 5 个测试文件是未提交的半成品。**不在半成品上开工** ——
两批改动互相干扰，回归出问题无法定位归属。先让 v0.2.4 提交、测试全绿。

### M0+M1 —— 聊天 + 多会话（M，用户指定合并）

**范围**
- 抽取 `src/app.ts`（组合根）与 `src/commands.ts`（32 条命令）
- `ProtocolConsole`：stdout 改道协议，stderr 走日志
- Bun 后端：HTTP API + SSE + 会话池（每会话 spawn 子进程）
- 前端：对话流（流式/思维链折叠/工具卡片）、审批弹窗、取消
- 多标签页会话 + 会话列表 + 恢复
- ⌘K 命令面板 + 侧栏（会话/记忆/wiki/技能索引）+ 权限模式/档位切换

**验收**
- [ ] `bun run gui` 起服务，浏览器打开即能用
- [ ] 流式逐字出现；思维链可折叠；工具卡片可展开看输出
- [ ] `write_file` 触发审批弹窗，可拒绝；审批超时会自动拒绝（不挂起）
- [ ] 刷新页面能恢复会话（`~/.neo/sessions/` 落盘正确）
- [ ] **两个及以上 tab 并行**，流式输出互不干扰
- [ ] ⌘K 命令面板能执行全部 32 条命令，**与 CLI 行为一致**
- [ ] `tests/commands.test.ts` 漂移守卫仍绿
- [ ] **核心 `src/` 改动仅限抽取，不改行为**；`bun test` 仍 **530 pass / 0 fail**，`tsc` 零错误
- [ ] api_key 不出现在任何前端产物或 API 响应里

### M2 —— 文件树 + diff 审阅 + 对端面板（M）

**范围**：文件树浏览、diff 审阅视图、对端会话实时面板（`list_peers` 数据可视化）、附件拖拽。

**验收**
- [ ] 文件树限制在 `cwd` 内，符号链接不跟随（参考 `tests/symlink-traversal.test.ts`）
- [ ] diff 视图展示 `edit_file` 前后差异，可逐段接受/拒绝
- [ ] 对端会话状态（空闲/工作中/等待人类/停滞/已死）实时刷新

### M3 —— Tauri 打包分发（M）

**范围**：Tauri 壳（开窗/托盘/菜单/单实例/自动更新）、Bun 单文件编译、
三平台交叉编译、代码签名、首次启动引导页（provider/key 配置）。

**验收**
- [ ] macOS `.dmg` 可安装、可启动、可卸载；Developer ID 签名通过
- [ ] Windows `.msi` 可安装（签名证书到位前先出未签名包）
- [ ] 应用内**不需要预装 Bun**（运行时已编译进包内）
- [ ] 首次启动引导页能写入用户级 `~/.neo/settings.json`，且**不写入项目目录**
- [ ] 安装包体积 ≤ 120MB

### 建议开工顺序

```
v0.2.4 落定  →  抽取 app.ts / commands.ts（纯重构，测试须绿）
             →  ProtocolConsole + 会话进程协议（后端最小闭环）
             →  Bun HTTP/SSE 后端 + 前端聊天流（单会话）
             →  多标签页 + 命令面板 + 侧栏
             →  文件树 + diff
             →  Tauri 壳 + 打包分发
```

---

## §8 风险登记

| # | 风险 | 等级 | 对策 |
|---|---|---|---|
| R1 | **v0.2.4 半成品上开工** → 回归无法定位归属 | 高 | 先落定 v0.2.4，测试全绿再开 GUI |
| R2 | **抽取 app.ts 动到 `src/index.ts`** → 530 测试基线红 | 高 | 纯重构单独 commit；不改行为；全量测试 + tsc 双闸 |
| R3 | **协议 stdout 被日志污染** → 前端解析失败且难查 | 高 | `ProtocolConsole` 统一改道；日志只走 stderr；加一条「stdout 必须是合法 JSONL」的冒烟测试 |
| R4 | 审批 `Promise<boolean>` 无超时 → 后端永久挂起 | 中 | deferred 带超时兜底（超时=拒绝） |
| R5 | `settings.json` 的 api_key 泄露到前端 | 中 | 密钥只留后端；API 层就 `maskKey()`；加一条「前端产物不含 key」的检查 |
| R6 | SSE 断线丢 token 流 | 中 | 事件带 `seq` + `cursor` 断点续传 |
| R7 | GUI 与 CLI 命令面静默分叉 | 中 | 漂移守卫 + M0+M1 验收项「与 CLI 行为一致」 |
| R8 | 文件树越界读到 `cwd` 外 | 中 | 路径白名单 + 符号链接不跟随 |
| R9 | 会话子进程泄漏（GUI 崩了没回收） | 中 | 后端记录所有子进程 pid，退出时统一 kill；加「孤儿进程清理」启动自检 |
| R10 | Tauri 引入 Rust 工具链抬高团队门槛 | 中 | Rust 只在壳层，团队成员不需要装 Rust；壳层可由单人维护 |
| R11 | 前端框架选型过早锁死 | 低 | 无框架起步，嫌繁琐再引 Preact |

---

## §9 关联

- `src/agent.ts` —— GUI 的核心依赖面（`AgentIO` / `AgentEvent` / `send()`）
- `src/tools/index.ts:817-841` —— 进程级全局注册表，**多进程决策的根因**
- `src/input/commands.ts` —— 命令面板数据源 + 漂移守卫
- `src/mailbox/identity.ts:230` —— 多会话身份模型依据
- `tests/commands.test.ts` —— 抽取后必须继续绿
- `tests/symlink-traversal.test.ts` —— 文件树越界的参考实现
- `docs/architecture.md` —— v0.1.0 架构总览（本页是 GUI 分支新增，不改它）

---

## §10 候选方案 B：复用 DeerFlow 的 UI 层（2026-10-25 评估）

> 用户提议：不造轮子，拿字节开源 `~/powerful-app/deer-flow` 的 GUI，不要它的 agent 部分。
> 本节是**实读评估结论**，含可复用的精确边界与真实代价。

### 10.1 前置事实

| 项 | 事实 | 证据 |
|---|---|---|
| 许可证 | **MIT**（Copyright 2025 Bytedance Ltd. and/or affiliates, 2025-2026 DeerFlow Authors） | `LICENSE` 头部 |
| 前端栈 | Next.js 16 + React 19 + Tailwind 4 + Radix + shiki + streamdown + `@xyflow/react` | `frontend/package.json` |
| 后端栈 | **LangGraph Server**（Python，`backend/pyproject.toml` 自述 "LangGraph-based AI agent system"） | `backend/pyproject.toml` |
| 前端规模 | 393 个 ts/tsx，**56245 行** | `frontend/src` 实测 |

### 10.2 分层：哪些能白嫖，哪些必须重写

| 层 | 内容 | 规模 | 耦合 | 判定 |
|---|---|---|---|---|
| 展示组件层 | `components/ui/` 44 文件 | 4957 行 | React + Radix + cva + lucide + motion，**零 LangGraph** | ✅ **直接可拿** |
| 展示组件层 | `components/ai-elements/` 28 文件 | 5374 行 | React + `ai` 包 + `@xyflow/react`，**零 LangGraph**（grep 已验证为空） | ✅ **直接可拿** |
| 单点组件 | `workspace/command-palette.tsx`（依赖仅 `ui/command`+`ui/dialog`+i18n+shortcuts）、`ui/terminal.tsx`（仅 react+motion） | 133 + 257 行 | 极干净 | ✅ **几乎零改** |
| 消息渲染 | `workspace/messages/`（message-list 1419 / message-group 1034 / message-list-item 754） | 3207 行 | 依赖 `core/messages/utils.ts`（865 行，绑 LangGraph 事件） | ⚠️ **UI 可拿，数据层重写** |
| **流式状态层** | `core/threads/hooks.ts`（3163 行，`useStream`）+ `core/api/api-client.ts`（LangGraph `Client`） | ~4700 行 | **LangGraph SDK 深度绑定**（27 个文件依赖 `@langchain/langgraph-sdk`） | ❌ **必须重写，对 neo 零价值** |
| Agent 概念层 | `core/{agents,tools,mcp,channels,sidecar,skills,memory,scheduled-tasks,citations,artifacts,config}/` | ~100 文件 | 后端概念 | ❌ **砍掉** |
| 应用壳层 | `src/app/` Next.js App Router | 39 文件 / 4123 行 | Next.js | ⚠️ **不搬**，改用 Vite + Bun 静态服务 |

**关键结论**：`core/threads/hooks.ts:1531` 的 `useStream<AgentThreadState>()` 是整个前端的流式心脏，
它订阅的是 LangGraph Server 的 run/checkpoint。
neo 没有 LangGraph Server，neo 有自己的 `AgentEvent`（text/reasoning/tool_start/tool_end/turn_end/compact/error/aborted）。
→ **这 3163 行必须自己写，且它恰好是「拿 GUI 省事」这个收益的主要来源**（省不掉）。

### 10.3 场景匹配度：DeerFlow 是「深度研究」，neo 是「编码」

| DeerFlow 有 | neo 是否需要 |
|---|---|
| `@xyflow/react` 画布 / artifact 产物 | ❌ |
| citations 引用溯源 | ⚠️（`web_fetch`/`grep` 可弱用） |
| browser-view / channels / sidecar / scheduled-tasks / goals / todos | ❌ |
| MCP 集成 / skills 目录 | ⚠️（neo 有自己的） |

| neo 需要 | DeerFlow 有吗 |
|---|---|
| **代码 diff 审阅视图** | ⚠️ `workspace/changes/`（408 行）只做「工作区文件变更汇总」，**不是代码 diff**，且依赖 `core/workspace-changes/` 自己的模型 → UI 壳可参考，数据层重写 |
| 文件树 | ❌ 无 |
| 真终端 | ⚠️ `ui/terminal.tsx`（257 行）依赖极干净但**是终端外观组件，不是可交互终端** |
| 上下文用量 / token 成本 | ✅ `context-usage-badge.tsx` + `token-usage-indicator.tsx` 存在 |

→ 直接套 DeerFlow 的 workspace UI，得到的是**研究型 agent 界面**，不是编码 agent 界面。

### 10.4 真实代价

| 项 | 代价 |
|---|---|
| 依赖 | React 19 + Tailwind 4 + Radix + shiki + streamdown + lucide + motion + `ai` ≈ **30+ 包** + Vite 构建链 + Node/pnpm |
| 仓库性质变化 | neo 核心仍是零依赖纯 TS（守住），但仓库从「零依赖」变成「前端有依赖」 |
| 适配成本 | `@/core/streamdown/plugins`、`@/core/clipboard`、`@/core/uploads`、`@/core/i18n` 等 DeerFlow 私有依赖要逐个替换 |
| 场景错配 | 研究类组件（citations/artifacts/browser-view/sidecar）搬进来是负担不是资产 |
| 与 Tauri 叠加 | Tauri 壳要打包 Vite 产物，多一条构建链（可行，但链路更长） |

### 10.5 建议的「混合路线」（若走复用方案）

**搬**：`components/ui/` + `components/ai-elements/` + `command-palette.tsx` + `messages/` 渲染骨架
**不搬**：`core/threads/`、`core/api/`、全部 LangGraph 相关、研究场景组件、`src/app/`
**自己写**：流式层（对着 `AgentEvent`）、会话管理、命令面板数据源（复用 `COMMANDS` 表）、文件树、diff 审阅
**打包**：Vite → 静态资源 → Bun `serve`；Tauri 壳最后写

**净收益判断**：
- ✅ 省掉最脏的 UI 基础活：shiki 代码高亮、markdown 渲染、思维链折叠、消息气泡、44 个基础组件、输入框
- ❌ 省不掉最难的部分：流式层、会话管理、命令面 —— 这三样本来就得自己写
- ⚠️ 前提是**接受 React 路线**；若坚持无框架纯 TS，则组件搬不过来，只能参考其交互设计
