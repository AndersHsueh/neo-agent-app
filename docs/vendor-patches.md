# 协议 vendor 补丁清单（neo-agent-app ↔ neo-core-serve v0.0.2）

> 日期：2026-10-29 · 适用：`gui/src/protocol/**`（从 `neo-core-serve/src/protocol/**` vendor 而来）
> 真源：`neo-core-serve/src/protocol/{types,guards,fixtures,reducer,commands,commands.json}`（协议 v1.2）
> 原则：**只增不改语义**。以下补丁都是「客户端渲染需要、但当前 core 侧类型/快照没带」的字段，
> 已尽量保持与 core 未来字段同名同形；等 core 补齐后可直接重新 vendor 覆盖，删掉本清单对应条目。

## 1. `types.ts`

| # | 位置 | 补丁 | 原因 |
|---|---|---|---|
| T1 | `StatsBlock` | 新增可选 `turnId?` / `contextUsage?` / `finishReason?` / `error?` | `stats` 事件带这些字段（v1.2），但块类型没有；不补则统计行拿不到收口原因/错误 |
| T2 | `UserBlock` | 新增可选 `attachments?: { mime: string; dataUrl: string }[]` | v0.0.2 协议**不回传**附件元数据；只有本轮本地发送的消息能显示图片（已知限制） |
| T3 | `QuestionBlock` | 新增可选 `deadlineAt?` | `question.request` 事件带超时时间，块类型漏了 |

## 2. `reducer.ts`

| # | 位置 | 补丁 | 原因 |
|---|---|---|---|
| R1 | `approval.request` | 建块时保留 `requestId?` / `detail?` / `diff?`（原来是必填 path+diff，且丢 detail） | 无 diff 的审批（如新建文件、shell 命令）只能显示 detail |
| R2 | `question.request` | 建块时保留 `header?` / `context?` / `multiSelect?` / `allowCustom?` / `deadlineAt?` | 多选/自由输入/倒计时 UI 需要 |
| R3 | `question.resolve` | 同时写 `answeredKeys?` / `custom?` | 多选与自由输入的收口态 |
| R4 | `stats` | 块里保留 `turnId` / `contextUsage` / `finishReason` / `error` | 同 T1 |
| R5 | `appendOptimisticUser` | input 支持可选 `attachments` | 本地乐观消息携带图片预览（同 T2） |

> 未改的行为（保持 core 口径）：`turn.aborted` 只收口流式状态（可见提示由 `state/app.ts` 合成 banner）；
> `compact.start` 不产生块；`compact.end` 产生中文 banner；`session.cleared` 清空时间线；
> `command.result` 成功不产生块（结果由命令面板用 `command.run` 回执渲染）、失败产生 error banner。

## 3. 与 core 侧的已知差异 / 待上游

1. `core/serve` 的 `session-host` 快照目前不带 `live` 之外的流式状态也够用，但**历史轮次的附件不回传**（协议 v0.0.3 计划）。
2. `session.create` 不带 `title` 时 Hub 不落盘 → GUI 新建会话一律带 `title`（见 `state/app.ts::createSession`）。这是 Hub 行为，不是 GUI 补丁；已记录在联调报告。
3. `settings.patch` Hub 返回 `unsupported` → GUI 设置页按只读处理（`patchSettings` 只 toast）。
4. `turn.aborted` / `compact.*` / `command.result` 的展示文案本地化只在 GUI 层做，core 的 banner 文案仍是中文（`compact.end`）。

## 4. 重新 vendor 的流程

```bash
cd /path/to/neo-core-serve
bun run commands:gen           # 若命令表有变
cd /path/to/neo-agent-app/gui
cp ../../neo-core-serve/src/protocol/{types,guards,fixtures,reducer,commands,commands.json,index}.ts src/protocol/
# 然后按本清单逐条重放补丁（T1–T3 / R1–R5），跑 bun run check 与 e2e
```
