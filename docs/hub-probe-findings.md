# 真实 Hub 协议实测清单（neo-core-serve v0.0.2 / protocol 1.2）

> 探测对象：**真实运行中的 Hub**（`bun src/main.ts hub --port 0 --dev-auth --cwd current_prj`，pid 64467，`ws://127.0.0.1:61895/ws`），全程未重启、未改 `~/.neo/settings.json`。
> 探测时点：2026-10-29 00:07–00:09（+08:00），Hub 启动于 2026-10-28 23:50（+08:00）。
> 复跑脚本：[`scripts/probe-hub.ts`](../scripts/probe-hub.ts)（`bun run scripts/probe-hub.ts`，需 LLM；`--no-llm` 跳过真实 turn）。
> 本次结果：**14 PASS / 0 FAIL / 2 INFO**（两次全量 + 一次 `--no-llm` 均通过；退出码 0）。
> 原始证据 JSON：`/tmp/probe-hub/probe-20261028160753-ffbb.json`（另：`--no-llm` 运行 `probe-20261028160848-07c5.json`）。
> 约束遵守：GUI/core 源码零改动；只创建并关闭自己的 `probe-*` 会话（每次运行 2 个）；对历史会话只 `attach`+`detach`，未 close/stop。

**LLM 环境**：`~/.neo/settings.json` 的有效 provider 为 `ipsa`（`default` 档 → `glm-5.3-flash`，`fast` 档 → `deepseek-flash`），真实 turn 单轮 2.1–6.7s。

---

## 0. TL;DR（GUI 侧五条最硬的结论）

1. **新建会话必须 `session.create { title }`**：不带 title 时会话文件不落盘，紧接着 `session.attach` 100% `not_found`（P1 可复现）。`session.rename` 要求已 attach（转发类命令），所以**不可能“先 create 再改名”**——title 是 create 的必填语义要求，尽管协议类型里是可选字段。
2. **Hub 是「一条连接同一时刻只能绑定一个会话」**：换会话必须先 `session.detach`，否则 `conflict`；同一会话同时只允许一个客户端 attach（第二个 → `conflict`）。转发类命令（`turn.send`/`command.run`/`transcript.fetch`/`mode.set`/`rename`/`usage.summary`）**在 attach 前一律 `conflict`**，唯一例外是 `settings.get`。
3. **`session.list` 是“磁盘摘要 + 占位值”，不可作为 UI 真源**：`title` 恒为 `会话 <id后6位>`（丢掉真实标题）、`provider` 恒为 `""`、`tier` 恒为 `"default"`、`mode` 恒为 `"ask"`；`status="working"` 只表示 **worker 进程存活**（不是 turn 在跑），且按会话文件 mtime 缓存、会滞后。真实值只能来自 `attach` 后的 `snapshot.meta`。
4. **不要假设流式逐 token**：服务端 16ms/4KB 合批；实测 `glm-5.3-flash`（default 档）**整段回答在轮末一次性到达**（P8：11 帧事件里 9 帧同一毫秒到达），`deepseek-flash`（fast 档）会分 3 个大帧到达（261 字符）。渲染必须以 `assistant.end.text` / `reasoning.end.text` 为权威，按 `blockId` 累积 delta。
5. **握手失败的实测code不是 4401**：错 token / 无 token 时 Hub 直接返回 **HTTP 401**（不 upgrade），Bun 客户端看到 `error + close:1002 "Expected 101 status code"`，浏览器通常表现为 1006。GUI 不要 `if (code===4401)` 才重发现——任何握手失败都应重读 `core.json`/token（Hub 重启会换端口与 token）。

---

## 1. 探测项 ↔ 结果总表

| 编号 | 探测项（任务项） | 实测结果（关键值） | 判定 |
|---|---|---|---|
| **P0** | 发现 + 握手 + `ready` | `ws://127.0.0.1:61895/ws`，`coreVersion=0.0.2`，`protocolVersion=1.2`，capabilities 9 项（含 `sessions`/`attachments.image`/`transcript.replay`/`snapshot.live`/`activity`）；**`ready` 帧没有 `sessionId`/`epoch` 字段** | ✅ |
| **P1** | create 带/不带 title + attach（任务 1） | 带 title：create 回执时文件已存在 → attach `ok{role:"owner"}`；不带 title：创建回执后文件不存在（150ms 后仍不存在）→ attach `not_found`；close 后文件才落盘 | ✅ |
| **P2** | `session.list` 形状（任务 2） | 128 条磁盘会话；字段 12 个；`title="会话 x8tmjx"`、`provider=""`、`tier="default"`、`mode="ask"`、`ownerId="local"`、`unread=0`；`status` ∈ {working(9), idle(119)} | ✅ |
| **P3** | attach 历史磁盘会话（resume，任务 3） | resume 零 turn 旧会话 **19ms**；snapshot keys = `meta/seq/epoch/blocks/context`；旧会话（无 transcript）→ **seq 重置为 1、新 epoch、有损重建 4 个块 + banner「transcript 缺失…degraded」** | ✅ |
| **P3b** | detach 后 worker 生命周期 | `health.sessions` attach 后 11 → detach 后仍 **11**（worker 不回收）；该会话 `list.status` 仍显示 `idle`（metaCache 按 mtime 滞后） | ℹ️ |
| **P4** | 单连接绑定 / 未 attach（任务 4） | 已绑 A 再 attach B → `conflict`；detach 后 attach B → ok；第二客户端 attach 同会话 → `conflict`；未 attach 的 6 类命令 → `conflict`（措辞 `请先 session.attach`）；`settings.get` → ok（掩码 `sk-xxx…xxxx`）；同连接重复 attach 同会话 → ok；转发命令显式 `sessionId` **被忽略**（返回绑定会话数据） | ✅ |
| **P5** | close / 权限 / resume（任务 5） | owner close ok（15ms），close 后 `list.status=idle`；非 owner close → `forbidden`；detach 后任意连接 close → ok；重复 close、close 不存在 id → **ok（幂等 no-op）**；close 后再 attach → resume 恢复 20 个块、seq 33→33 不变、`lastTurn` 带回 | ✅ |
| **P5b** | close→resume 的 seq/epoch | close 前 transcript 最后 seq=45 → resume 快照 seq=**45**（不新增 durable 事件），epoch 保持 | ℹ️ |
| **P6** | `command.run` 结果形状（任务 7） | `/help`→`markdown`；`/tier`→`kv`（4 个档位）；`/compact`→`text`；`/clear`→`text`+`session.cleared`；`/nope`→`result.ok=true` 但 **`data.ok=false` + `error.code=unsupported`**；`/tier fast`→`changes{tier,provider,model}` + `tier.switch`/`session.meta` 事件 | ✅ |
| **P7** | `transcript.fetch` 分页（任务 6） | 首条 durable 事件 = `session.meta` seq=1；seq 连续 1..13；`fromSeq` **闭区间**；`nextSeq`=下一页首条 seq；`limit>1000` 截到 1000；`fromSeq` 超尾 → `{events:[]}`；`fromSeq=0,limit=0` → 收敛到 1/1 | ✅ |
| **P8** | 真实 turn 事件序列/stats/activity（任务 8） | 11 帧：`turn.start, activity(llm), reasoning.start/delta/end, assistant.start/delta/end, context, session.status, stats`；stats=2040ms、usage、cumulativeUsage、tier、finishReason、error:null、provider/model；durable seq +1 无断层 | ✅ |
| **P8b** | 合批/流式特征（任务 8） | fast 档：回答 **261 字符仅 3 个 delta 帧**（116/80/65，到达偏移 1576/1934/2113ms），delta 拼接 == `assistant.end.text`；default 档同样 2 字符回答仅 1 帧 | ✅ |
| **P8c** | turn 中断线重连（任务 3 补充） | 首 delta 后断连 → 新连接 attach 仅 **2ms**，`snapshot.live={turnId, assistant:{blockId,text(146 字符 partial)}}`，blocks=18；重连后仍收到 `stats`/`assistant.end`（351 字符） | ✅ |
| **P9** | 附件限制（任务 9） | 1x1 png：turn 正常收口（stats.error=null），服务端落盘 `attachments/<sid>/img-*.png`，**`turn.start` 无附件元数据**；6 张→`too_large`；`text/plain`→`protocol`；magic 不符→`protocol`；非法 base64→`protocol`；单张 5.25MB→`too_large`（帧 7,340,199 字节 < 8MB，连接仍可用） | ✅ |
| **P10** | 错误信封（任务 10） | 统一 `{v,kind:"result",id,ok:false,error:{code,message,retryable}}`；未知 type→`protocol`（id 保留）；非法 JSON→`protocol` 且 **id="?"**；`v:2`→`protocol`；attach 缺 sessionId→`protocol`；不存在→`not_found`；`settings.patch`/`auth.whoami`→`unsupported`；`ping`→`pong`（无 result 帧） | ✅ |
| **P11** | 握手失败 / Origin（任务 11） | 错 token / 无 token：**HTTP 401 + close 1002**（无 4401）；恶意 Origin→403「forbidden origin」；无 token→401；`tauri://localhost` 与 `http://127.0.0.1:*` 通过 Origin 校验；`POST /api/auth/login`（无 Origin）→200 返回与磁盘一致的 token，恶意 Origin→403；`/health`→`{mode:"hub",sessions:...}` | ✅ |

> 证据编号 = 脚本里的 check id，可在证据 JSON 的 `checks[].id` 直接定位（`--no-llm` 时 P8/P8b/P8c 为 SKIP）。

---

## 2. 逐项事实与实测证据

### 2.1 新建会话：带 title 是唯一可行路径（P1，可复现）

Hub 的 `session.create` 是 **spawn worker + 可选 rename**；`host.rename()` 才会 `persistMessages()` 把 `<sid>.json` 写盘。没有 title 时 worker 只有内存会话，磁盘没有文件 → Hub 的 `session.attach` 首行 `existsSync(sessions/<sid>.json)` 直接 `not_found`。

实测（`probe-20261028160753-ffbb`）：

```jsonc
// 1) create 带 title：回执时文件已存在，attach 立刻成功
createALatencyMs: 66,
fileAExistsOnCreateReply: true,
attachASnapshotKeys: ["meta", "seq", "epoch", "blocks", "context"],
attachASeq: 1,
attachAMeta.title: "probe-20261028160753-ffbb-A-titled",   // 真实标题
attachAMeta.provider: "ipsa", attachAMeta.model: "glm-5.3-flash",
attachAMeta.status: "idle", attachAMeta.mode: "ask",

// 2) create 不带 title：文件始终不存在，attach 必然 not_found
createBLatencyMs: 37,
fileBExistsOnCreateReply: false,
fileBExistsAfter150ms: false,
attachBError: { code: "not_found", message: "会话 20261029-000753-435519 不存在", retryable: false },

// 3) close（未 attach 也可 close）之后文件才落盘
closeBLatencyMs: 9,
fileBExistsAfterClose: true
```

**由此推出 GUI 正确姿势**：

```
session.create { title }            // title 必须非空；建议 "新会话 HH:mm:ss" 之类
  → result { sessionId }
session.attach { sessionId }        // 必填；同连接未绑定其他会话
  → result { role: "owner" } + snapshot 帧（按 sessionId 关联，不是按请求 id）
用 snapshot.meta 校正列表项（title/provider/tier/mode 真实值）
```

另：带 title 的会话在 create 阶段就写入了首个 durable 事件 `session.meta`（seq=1），所以 `transcript.fetch` 首条即 `session.meta`：

```json
{"seq":1,"event":{"type":"session.meta","meta":{"id":"…","title":"probe-…-A-titled","ownerId":"local","status":"idle","tier":"default","provider":"ipsa","model":"glm-5.3-flash","mode":"ask",…}}}
```

> 无 title 会话的后续（容易被忽略）：close 后文件虽在，但 **transcript 只有 header、没有任何 durable 事件**；再次 attach 得到 `snapshot.seq=0`、`blocks=[]`（P4 `resumeEmptySnapshot: {seq:0, blocks:0}`），`transcript.fetch` 返回 `{events:[]}`。GUI 必须容忍 **seq=0 / 空事件数组**。

### 2.2 `session.list`：磁盘摘要 + 占位值 + 缓存滞后（P2 / P3b）

```jsonc
// P2 实测：128 条，字段固定 12 个
{ id, title, ownerId, status, tier, provider, model, cwd, createdAt, updatedAt, unread, mode }
entryA(带 title 的活跃会话): {
  id: "20261029-000753-x8tmjx",
  title: "会话 x8tmjx",          // ← 真实标题 probe-…-A-titled 被丢弃，恒为「会话 + id 后 6 位」
  ownerId: "local",
  status: "working",             // ← worker 进程存活（即使 idle，没在跑 turn）
  tier: "default",               // ← 恒 default
  provider: "",                  // ← 恒空串
  model: "glm-5.3-flash",        // ← 唯一来自磁盘 meta 的真实字段
  mode: "ask"                    // ← 恒 ask
}
statusCounts: { working: 9, idle: 119 }   // working 数 ≈ 存活 worker 数，与 health.sessions 一致
```

两个坑，都有实测：

1. **status 语义**：`worker 存活` 即 `working`，与“是否正在跑 turn”无关；真实状态看 `snapshot.meta.status`（`idle|working|waiting`，由 worker 按 turn/审批状态计算）。
2. **status 会滞后**（P3b）：Hub 用 `(会话文件 path, mtime)` 做 `metaCache`。我们先 list（旧会话 cached=idle），再 attach 拉起 worker，再 list → 仍返回 **idle**（文件 mtime 没变），而 `health.sessions` 已从 10 → 11。也就是说 **`session.list` 的 status 既不是实时值也可能过期**，不能据此做“会话忙/闲”的强判断。

P5 里 close 后列表返回同一会话（文件保留）值得注意：`title` 仍为占位、`status=idle`、`updatedAt` 已更新。

### 2.3 `attach` / `snapshot` 语义（P1 / P3 / P5 / P8c）

- **总是返回完整快照**（协议文档承诺的 `lastSeq/epoch` 增量在 v0.0.2 未实现）：attach 的 `result` 先到，随后是一条独立 `snapshot` 帧（`kind:"snapshot", sessionId, seq, snapshot`）。客户端要按 `sessionId` 关联；不要等 result 里带快照。
- snapshot 形状（按存在性出现，**可选字段经常会缺**）：

```jsonc
// 新建空会话（P1）
{ meta, seq: 1, epoch: "9b8f58cfb349d1f3", blocks: [], context: { used: 5042, limit: 512000, compactAt: 0.75 } }

// 有历史的会话 resume 后（P5）
{ meta, seq: 45, epoch, blocks: [20 个，kinds: banner/tierline/user/turn/reasoning/assistant/stats],
  context, lastTurn: { kind:"stats", durationMs:2671, usage:{…}, toolCalls:0, iterations:1, tier:"fast" } }

// turn 进行中断线重连（P8c）
{ meta, seq: 38, epoch, blocks: [18 个], context, lastTurn,
  live: { turnId, assistant: { blockId, text: "…146 字符 partial…" } } }
```

- 缺省规则：`lastTurn` 只在有完成轮时出现；`live` 只在 turn 进行中出现（可能只有 `turnId`+`activity`，也可能带 `assistant`/`reasoning`/`tool`）；`pendingApprovalId`/`pendingQuestionId` 只在审批/提问挂起时出现。
- **旧磁盘会话（v0.0.1 无 transcript）resume 会降级重建**（P3）：

```jsonc
sessionId: "20261014-200020-mrazqd", wallMs: 19,
snapshot: { seq: 1, epoch: "21eaf8a1426a9188", blockCount: 4,
            blockKinds: ["user","turn","assistant","banner"], lastTurn: null },
transcriptFirstPage: { events: [ { seq: 1, event: { type: "banner", level: "info",
  text: "transcript 缺失：已从会话 messages 有损重建视图（degraded）" } } ] }
```

即：**老会话 attach 会得到新 epoch、seq 从 1 重新开始、并带一条 degraded banner**。GUI 的 `lastSeq`/`epoch` 必须以本次快照重置，不能拿旧值续拉。

### 2.4 单连接绑定语义（P4）

| 操作 | 结果 |
|---|---|
| 已 attach A，再 `attach B` | `conflict`「当前连接已绑定其他会话」 |
| `detach A` 后 `attach B` | ok |
| 第二连接 attach 同一会话 | `conflict`「会话已被其他客户端 attach」（v0.0.2 单客户端） |
| 同一连接重复 attach 同一会话 | ok（幂等，并再次下发 snapshot） |
| 未 attach 发 `turn.send`/`command.run`/`transcript.fetch`/`mode.set`/`session.rename`/`usage.summary` | 一律 `conflict`「请先 session.attach」——**显式带 sessionId 也不绕过** |
| 未 attach 发 `settings.get` | **ok**（唯一例外，Hub 按默认 cwd 读配置、不 spawn worker） |
| attach 后发 `settings.get` | ok（转发给 worker，`SettingsView` 16 个键，`apiKeyMask` 形如 `sk-xxx…xxxx`） |
| 绑定 B 时 `transcript.fetch(sessionId=A)` | ok，但**返回 B 的数据**（Hub 强制用连接绑定覆盖 sessionId） |
| 绑定 B 时 `session.close(sessionId=A)` | **ok** —— close 的显式 sessionId **不**被忽略（仅检查 owner），可关闭非当前绑定的无主会话 |
| `ping` | 回 `pong` 帧（没有 result 帧） |

### 2.5 `session.close` / resume（P5）

```jsonc
非 owner close → { code: "forbidden", message: "只有会话 owner 可以 close" }
owner close   → ok（15ms），close 后 list.status=idle（worker 已退出）
detach 后 close（owner 为空）→ ok
重复 close / close 不存在的 id → ok（幂等 no-op，data={}）
close 后 attach → resume：wall 61ms，blocks=20（user/turn/reasoning/assistant/stats/tierline/banner），
                   snapshot.lastTurn 带回，seq=45（close 前最后 durable seq=45，**resume 不新增 seq**）
```

注意：**close 只停 worker，会话文件保留**；close 不是“删除会话”。GUI 若要“关掉会话不再显示”，需要自己做本地隐藏，Hub 没有 delete。

### 2.6 `transcript.fetch` 分页（P7）

```jsonc
// 首次拉取（limit 1000）：13 条，seq 连续 1..13，nextSeq 缺省
// 首条：{"seq":1,"event":{"type":"session.meta",...}}
// page1 {fromSeq:1, limit:3} → events[1,2,3], nextSeq=4
// page2 {fromSeq:4, limit:3} → events[4,5,6]      ← fromSeq 是闭区间
// {fromSeq:1000000} → {events:[]}                  ← 超尾无 nextSeq
// {fromSeq:0, limit:0} → {events:[{seq:1}]}        ← 下界收敛到 1/1
// {limit:10000} → 最多返回 1000 条
```

逐页 limit=2 翻完得到的 seq 序列与全量一致（无重无漏）。`nextSeq` 缺省 = 已到末尾。注意 `transcript.fetch` 只回放 **durable** 事件，`assistant.delta`/`activity` 等 ephemeral 不在其中（历史正文来自 `assistant.end.text`）。

### 2.7 `command.run` 的 `result.data` 形状（P6）

`command.run` 的 **传输层 result 永远 `ok:true`**；命令成功/失败在 `data.ok` 里：

```jsonc
// /help
{ ok: true, blocks: [{ kind: "markdown", text: "## Matrix-Core 命令\n\n### 会话\n…" }] }
// /tier（查询）
{ ok: true, blocks: [{ kind: "kv", items: [
  { k: "● default", v: "ipsa / glm-5.3-flash" },
  { k: "○ deep (deep_reasoning)", v: "minimax / MiniMax-M3 (未接入)" },
  { k: "○ balanced", v: "ipsa / glm-5.3-flash" },
  { k: "○ fast", v: "ipsa / deepseek-flash" } ] }] }
// /compact（空上下文）
{ ok: true, blocks: [{ kind: "text", text: "对话太短或压缩失败，未做处理。" }] }
// /clear
{ ok: true, blocks: [{ kind: "text", text: "上下文已清空。" }] }     // 另发 durable session.cleared
// /nope（未知命令）
{ ok: false,
  blocks: [{ kind: "notice", level: "error", text: "不支持的命令 /nope。可用命令：help, ?, clear, …" }],
  error: { code: "unsupported", message: "不支持的命令 /nope。可用命令：…" } }   // result.ok 仍是 true
// /tier fast（会变更）
{ ok: true, blocks: [{ kind: "text", text: "档位 → fast（ipsa / deepseek-flash）" }],
  changes: { tier: "fast", provider: "ipsa", model: "deepseek-flash" } }
```

同时每个 `command.run` 都产生一条 durable **`command.result` 事件**（含 `blockId/name/ok/blocks/changes/error`），另有 `tier.switch`+`session.meta`（切档）、`session.cleared`（/clear）等事件。GUI 可用 `result.data.blocks` 立即渲染，也可用 `command.result` 事件做历史回放；两者不要重复渲染。

### 2.8 真实 turn：事件序列 / stats / activity（P8）

default 档真实 turn（`只回复两个字：收到`，2.0s）的完整帧序列（相对首帧时间）：

| # | 事件 | seq | 相对到达 |
|---|---|---|---|
| 1 | `turn.start` (userText/clientId/source=user/msgCount) | 14 | +21ms |
| 2 | `activity {phase:"llm", since}` | 14 | +21ms（与 turn.start 同批） |
| 3 | `reasoning.start` | 15 | +2060ms |
| 4 | `reasoning.delta` | 15 | +2060ms |
| 5 | `assistant.start` (tier) | 16 | +2060ms |
| 6 | `assistant.delta` | 16 | +2060ms |
| 7 | `reasoning.end` (durationMs/tokens/text?) | 17 | +2060ms |
| 8 | `assistant.end` (text 权威全文) | 18 | +2060ms |
| 9 | `context {used,limit,compactAt}` | 19 | +2060ms |
| 10 | `session.status {status:"idle"}` | 20 | +2060ms |
| 11 | `stats` | 21 | +2060ms |

`stats` 形状（终态，与 `turn.aborted` 二选一）：

```jsonc
{ type: "stats", blockId: "stats_dafulp0", at: 1793203676894, durationMs: 2040,
  usage: { promptTokens: 5740, completionTokens: 19, reasoningTokens: 16, costMicros: 0 },
  cumulativeUsage: { promptTokens: 5740, completionTokens: 19, reasoningTokens: 16, costMicros: 0 },
  toolCalls: 0, iterations: 1, tier: "default", turnId: "turn_8wrp5j5",
  contextUsage: 0.010203125, finishReason: "stop", error: null, emptyResponse: false,
  provider: "ipsa", model: "glm-5.3-flash" }
```

要点：
- `turn.start` **回显 `clientId`**（重连去重可用）、`source:"user"|"mailbox"`、`msgCount`；**没有 attachments 字段**。
- `seq` 只在信封；durable 事件严格 +1（实测无断层），**ephemeral（delta/activity/notice）携带当前 durable seq，可重复**（本 turn 中 seq 14 出现两次、16 出现两次）。
- 终态前一定会先有 `context` + `session.status:idle`（同一批），GUI 不要提前自行收口。

### 2.9 合批与“非流式”真相（P8 / P8b）

| 档位/模型 | 回答长度 | delta 帧数 | 帧大小 | 到达偏移 | 结论 |
|---|---|---|---|---|---|
| default / `glm-5.3-flash` | 2 字符 | 1 帧 | 2 字符 | 轮末 | **整段一次性到达**（非流式） |
| fast / `deepseek-flash` | 261 字符 | 3 帧 | 116/80/65 字符 | 1576/1934/2113ms（轮末 2.1s） | 有渐进但**按大块合并**，不是逐 token |

- 服务端 `EventBatcher`：同 block 的 `assistant.delta`/`reasoning.delta` 在 16ms 窗口内合并，4KB/64 帧立即 flush。
- 客户端渲染规则：**按 `blockId` 累积文本 → 用 `assistant.end.text`/`reasoning.end.text` 覆盖**（实测 delta 拼接 === end.text，trim 后完全相等）；不要对帧数/单帧长度/到达间隔做断言。
- 对 UI 的影响：不能把 delta 帧当动画 tick（可能是 3 帧 261 字符）；spinner/“思考中”要基于 `activity`/`session.status`，正文出现后再停止。

### 2.10 turn 中断线重连（P8c）

实测：fast 档长回答进行中，收到首个 `assistant.delta` 后直接 `ws.close()`，新连接 `attach`：

```jsonc
resumeAttachWallMs: 2,
snapshotKeys: ["meta","seq","epoch","blocks","context","lastTurn","live"],
live: { turnId: "turn_mnyc959",
        assistant: { blockId: "asst_o8w976h", text: "1. 连接方式：长轮询每次都要新建 HTTP 请求…（146 字符 partial）" } },
snapshotSeq: 38, snapshotBlockCount: 18,
// 重连后继续收到本轮剩余事件：assistant.delta… assistant.end(351 字符), context, session.status, stats
```

GUI 重连策略（可用证据支撑）：
1. 记 `sessionId/lastSeq/epoch`，重读发现文件+token，重连；
2. `attach{sessionId}`（Hub 仍回完整快照）→ 用 `snapshot` 重建 blocks；
3. 若存在 `snapshot.live`，把 partial 正文渲染为“正在流式”，并**继续等本轮终态**（不要新开一轮）；
4. 本地乐观消息按 `clientId` 与 `turn.start.clientId` 去重。

### 2.11 附件（P9）

| 用例 | 结果 |
|---|---|
| 1 张 1×1 PNG（合法） | `turn.send` ok → 正常 turn（stats.error=null）；服务端落盘 `~/.neo/sessions/attachments/<sid>/img-<hash>.png`；**`turn.start`/durable 事件不含任何附件元数据** |
| 6 张 1×1 PNG | `too_large`「附件最多 5 张，收到 6 张」 |
| mime=`text/plain` | `protocol`「附件 #1 的 mime "text/plain" 不支持（只接受 png/jpeg/webp）」 |
| 声明 png 但内容非 png | `protocol`「附件 #1 的内容不是 image/png（magic=unknown）」 |
| 非法 base64 | `protocol`「附件 #1 的 dataBase64 不是合法 base64」 |
| 单张解码 5.25MB | `too_large`「附件 #1 解码后 5.25MB，超过单张 5MB 上限」；整帧 7,340,199 字节（<8MB），**连接未被关闭**，随后 `session.list` 仍可用 |

限制与 GUI 结论：
- 入站帧上限 8MB（base64 膨胀 4/3）：**5 张 × 1MB 图就已经逼近 8MB 帧上限**，GUI 应在前端先压缩（如单张 ≤1MB、总数 ≤4MB base64 更安全），否则可能被传输层直接断连（本脚本刻意没测 >8MB 帧）。
- **v0.0.2 协议不回传附件**：历史轮 images 无法从 snapshot/transcript 还原。GUI 只能在发送当轮本地预览/缓存。**不要自己拼 `~/.neo` 路径**去读附件。
- 服务端会在校验失败时 **不留下半轮**（title 校验在开轮前），GUI 可以直接展示错误码提示压缩/减张。

### 2.12 错误信封与错误码（P10）

统一形状（`result.ok=false`）：

```json
{"v":1,"kind":"result","id":"c5-2","ok":false,
 "error":{"code":"not_found","message":"会话 probe-…-nope 不存在","retryable":false}}
```

| 输入 | code | message（实测） |
|---|---|---|
| 未知 command type | `protocol` | `command: unknown type nope.cmd`（id 原样保留） |
| 非法 JSON（非 JSON 文本） | `protocol` | `invalid JSON frame`（**id="?"**） |
| `v:2` | `protocol` | `command: unsupported version 2` |
| 缺 `command` 字段 | `protocol` | `command: bad envelope` |
| `session.attach` 缺 sessionId | `protocol` | `session.attach 需要 sessionId` |
| attach 不存在的会话 | `not_found` | `会话 … 不存在` |
| `settings.patch` | `unsupported` | `v0.0.2 Hub 不支持 settings.patch` |
| `auth.*` | `unsupported` | `Hub 使用本地 token / --dev-auth HTTP 登录` |
| `command.run` 缺 args | `protocol` | `command.run: args must be array` |
| `turn.send` 缺 clientId | `protocol` | `command turn.send: bad clientId` |
| 未 attach 的转发命令 | `conflict` | `请先 session.attach` |
| 已被别人 attach | `conflict` | `会话已被其他客户端 attach` |
| 非 owner close | `forbidden` | `只有会话 owner 可以 close` |

`retryable` 的实测规律：`protocol`/`not_found`/`conflict`/`forbidden`/`unsupported`/`too_large` 全是 `false`；仅 `internal`/`timeout`/`rate_limited` 可能为 `true`（源码 dispatch 规则，本次只观测到 false 的用例）。`ping` 没有 result 帧，直接回 `{"kind":"pong"}`。

### 2.13 握手 / Origin / dev-auth / health（P11）

| 用例 | 实测 |
|---|---|
| 错 token WS | `opened=false`，`error:"…failed: Expected 101 status code"`，`close code=1002`（**没有 4401**） |
| 无 bearer 子协议 WS | 同上 |
| 错 token fetch `/ws`（带合法 Origin） | HTTP **401**（body 无 JSON） |
| 恶意 Origin（`http://evil.example`）+ 合法 token | HTTP **403**「forbidden origin」 |
| `Origin: tauri://localhost` + 合法 token（无 Upgrade） | HTTP 400「upgrade failed」（= Origin 通过、token 通过，只是不是真 WS） |
| `Origin: http://127.0.0.1:57682`（本次 DSH GUI 端口）+ 合法 token | HTTP 400「upgrade failed」→ 通过白名单 |
| `POST /api/auth/login`（无 Origin） | 200 `{token, expiresAt, user:{id:"local",role:"owner"}}`，token 与磁盘一致 |
| `POST /api/auth/login`（恶意 Origin） | 403 |
| `GET /health` | `{ok:true, mode:"hub", coreVersion:"0.0.2", protocolVersion:"1.2", sessions:<worker 数>}` |

结论：文档里「握手失败直接关闭 4401」**与实现不符**（源码里也没有 4401）。浏览器 WebSocket 拿不到 HTTP 状态码，只会 `onerror` + `onclose(1006/1002)`；因此**任何“未收到 ready 就关闭”都应视为鉴权/发现失败 → 重新 discovery（重读 core.json+token）后重连**，而不是等 4401。Origin 白名单 = `http(s)://127.0.0.1[:port]`、`http(s)://localhost[:port]`、`tauri://localhost`、`null`（脚本无 Origin 直接放行）。

### 2.14 工程事实：detach 不回收 worker（P3b + ps）

`session.detach` 只解绑 owner，worker 继续存活并持有会话锁；`session.list` 仍显示 `working`（或缓存滞后显示 idle）。实测系统上 worker 进程：

```
$ ps axo pid,rss,command | grep "serve --stdio"
69623 69.0MB … serve --stdio --cwd …/neo --resume 20261014-200020-mrazqd   ← 本脚本 P3 attach 的历史会话（未 close，遵守“不关别人会话”）
… 同机另有十余个并行联调/其他探测产生的 worker，单进程 RSS 60–85MB
```

GUI 切会话的后果：访问 N 个会话 = N 个常驻 worker × 60–85MB。当前版本**只有 `session.close` 能释放**（owner-only）。GUI 需要策略：切走即 `close`（代价：再 attach 要重新 resume，实测 19–87ms，可接受）或限制活跃 worker 数、或接受堆积并在 v0.0.3 等 Hub 空闲回收。

---

## 3. GUI 侧必须适配（按严重程度排序）

> 以下全部有 P 编号实测证据；序号即建议优先级。

| # | 坑 | 后果 | GUI 必须怎么做 | 证据 |
|---|---|---|---|---|
| **1 (P0)** | `session.create` 不带 title | 新会话 attach 必 `not_found`，新建流程直接坏 | create 必带非空 title；不要走“先建再改名” | P1 |
| **2 (P0)** | 单连接单会话 + 单客户端 | 切会话不 detach → `conflict`；同会话被占 → `conflict` | 切会话严格 `detach(旧) → attach(新)` 串行；冲突时提示「该会话已在别处打开」并回退 activeId | P4 |
| **3 (P0)** | 硬编码 dummy 端点 | 连不上真实 Hub | 每次（重）连都 discovery：读 `~/.neo/run/core.json` + `core.token`（dev 由 Vite 中间件代读）；Hub 重启会换端口+token | P0/P11 |
| **4 (P1)** | 用 `session.list` 当会话真源 | 标题“会话 xxxxxx”、tier/provider/mode 全错、status 假忙/滞后 | 列表只做“id+时间+磁盘存在”；选中后以 `snapshot.meta` 覆盖；状态判断用 `snapshot.meta.status`；不要按 list.status 禁发消息 | P2/P3b |
| **5 (P1)** | 假设逐 token 流式 | 动画/节流逻辑异常、字符丢/重 | 按 `blockId` 累积 delta，**`*.end.text` 覆盖**；不按帧数/长度断言；spinner 用 activity/status | P8/P8b |
| **6 (P1)** | 重连后自己收口/丢 partial | 刷新后回答消失或重复 | 重连 attach 用完整快照重建；`snapshot.live`（turnId+partial 正文）存在时继续等终态；乐观消息按 clientId 去重 | P8c/P1 |
| **7 (P1)** | seq/epoch 用旧值续拉 | 换 epoch（旧会话重建）后历史错乱/重影 | 每次 attach 用 `snapshot.seq`/`snapshot.epoch` 重置；seq 只在信封，不要从事件体取；durable +1、ephemeral 可重复 | P3/P5b/P8 |
| **8 (P1)** | 把 `command.run` 的 `result.ok` 当命令成功 | 未知命令不提示/把失败当成功 | 命令成败看 `data.ok`+`data.error`；`data.blocks` 渲染（markdown/kv/list/table/notice/diff）；错误命令也会回 `result.ok=true` | P6 |
| **9 (P2)** | 附件：不压缩、数量/大小不限 | `too_large`，大帧可能被传输层断连 | 前端限 5 张、单张 ≤5MB（建议 ≤1MB）、仅 png/jpeg/webp；错误码 `too_large` 提示压缩/减张；`protocol` 提示格式 | P9 |
| **10 (P2)** | 期望历史图片可还原 | 刷新后图片消失（v0.0.2 已知限制） | 仅当轮本地预览/缓存；不拼 `~/.neo` 路径；历史轮占位说明 | P9 |
| **11 (P2)** | 等 4401 才处理鉴权失败 | 错 token 无限重连 | 任何“未收到 ready 就关闭”都重 discovery + 重连（浏览器只给 1006/1002）；退避 300ms×2ⁿ 封顶 5s | P11 |
| **12 (P2)** | 未 attach 调 `settings.get` 之外的命令 | 启动链 `conflict` 报错 | `settings.get` 是 attach 前唯一合法的业务命令；其余等 attach | P4 |
| **13 (P2)** | attach 前无 `sessionId` 兜底 | `protocol` 错误 | `session.create{}`/`attach` 均校验返回值；不存在→`not_found` 时从列表刷新 | P10 |
| **14 (P2)** | 切会话只 detach 不 close | 每会话一个 60–85MB worker 常驻 | 策略化 `close`（owner 才有权，实测 close 15ms、resume 19–87ms）；或接受堆积并监控 `/health.sessions` | P3b/P5/ps |
| **15 (P3)** | 空会话断言 `seq>=1`/事件非空 | 无 title/空会话 `snapshot.seq=0`、`fetch {events:[]}` | 容忍 seq=0 与空事件数组 | P4/P1 |
| **16 (P3)** | 等 `sessions/settings/usage` 推送帧 | 永远等不到（Hub 全部走 `result` 帧） | 用 request/response；pong 例外（ping 无 result） | P10/P0 |

补充（GUI 可选的体验适配）：
- `snapshot.meta.status` 有 `waiting`（审批/提问挂起，源码推导：host 按 turn+待决项计算）；`session.list` 永远不会给 waiting。
- `turn.start.source="mailbox"` 的轮次也会广播给 owner，GUI 需要按 clientId 去重本地乐观消息。
- 重命名用 `session.rename`（需已 attach）；重命名后 Hub 广播 `session.meta` 事件，所有订阅者可见——**更新本地标题要以事件为准**（list 仍返回占位）。
- `command.result` 是 durable 事件：历史回放时命令结果会重现，GUI 避免同时渲染 `result.data.blocks` 和 `command.result` 造成重复。

---

## 4. 错误码 → GUI 行为对照

| code | 触发场景（实测） | 建议 GUI 行为 |
|---|---|---|
| `protocol` | 未知命令/坏信封/错误版本/缺字段/附件格式错/非法 JSON（id="?"） | 提示“客户端与 Hub 协议不匹配”，上报日志；不要重试同一帧 |
| `not_found` | attach 不存在的会话（含 create 无 title 的坑） | 刷新列表；若刚 create → 必须带 title 重试 |
| `conflict` | 未 attach 发命令 / 换会话未 detach / 会话被他人占用 | 自动 `detach→attach` 重试；仍失败提示“已在别处打开” |
| `forbidden` | 非 owner close | 只在 owner 会话展示“关闭会话” |
| `session_gone` | worker 已退出（源码路径；未见实测） | 重新 attach（resume 拉起） |
| `unsupported` | settings.patch/auth.*/未知斜杠命令（`data.ok=false`） | 隐藏或不提供入口；斜杠命令展示 unsupported 文案 |
| `too_large` | >5 张 / 单张 >5MB / 总 base64 超限 | 提示压缩/减少张数 |
| `slow_consumer` | 连接积压（4408，本次未构造） | 停止灌历史、指数退避重连、attach 快照重建 |
| `internal` / `timeout` | 服务端异常（retryable=true） | 可重试，退避 |

---

## 5. 未验证 / 无法验证项（含原因）

1. **入站帧 >8MB 的 `too_large` 回帧**：任务明确不要发 >8MB 帧（会触发连接层关闭）。本次只验证了「单张解码 >5MB 但整帧 7.34MB」的 `too_large` 路径。
2. **4408 慢消费者**：需要“持续推送却不读帧”的构造，容易把连接弄脏；未做（协议文档给了 512 帧/8MB、丢 ephemeral、退避公式）。
3. **worker 崩溃 → `session.status:dead`**：需要 kill 子进程，会打扰并行联调；未做（Hub 源码逻辑：owner 收到 dead、绑定清空，GUI 应重连 re-attach）。
4. **审批/提问全链路**（approval.request/resolve、question.request/answer、`pendingApprovalId`/`pendingQuestionId`）：触发需要让模型调用需审批工具，CLI 侧默认 `ask` 模式下会卡住等待；任务未列，未做。
5. **`turn.abort` / 轮中 `turn.send` → conflict**：任务未列，未做（源码：轮中发送 `conflict`「本轮仍在运行」）。
6. **`session.create.cwd` 与项目级 `settings.json` 优先级**：本次全部用 Hub 默认 cwd（`…/neo-core-serve/current_prj`，无 settings.json → 回落 `~/.neo/settings.json`）。cwd 传参、配置查找顺序未实测。
7. **浏览器真实 close code**：脚本用 Bun 原生 WS 实测 1002/1006 差异；浏览器 WebSocket 一般报 1006（无 code），需 e2e 在浏览器里最终确认（e2e 队友可覆盖）。
8. **多客户端/多标签同时打开同一会话**：v0.0.2 单客户端（实测 conflict），协作语义 v0.5+。
9. **`history`/`cost`/`context`/`tools` 等其他 command**：未逐一枚举，结构应与 P6 同族（`blocks`+`changes`）。

---

## 6. 脚本行为（可复跑）

```bash
cd neo-agent-app
bun run scripts/probe-hub.ts              # 全量：14 PASS（含 3 条真实 LLM turn，约 15–25s）
bun run scripts/probe-hub.ts --no-llm     # 11 PASS + 3 SKIP（不花 LLM；附件错误路径仍全测）
bun run scripts/probe-hub.ts --json /tmp/out.json
```

- 发现：`NEO_RUN_FILE` → `~/.neo/run/core.json`；token 读 `core.json.tokenFile`（默认 `~/.neo/run/core.token`）。每次运行现读（Hub 重启换 token 也能跑）。
- 每步打印 `PASS/FAIL/SKIP/INFO + check id + 关键数据`；**非零退出码 = 有硬失败**（FAIL）。
- 幂等：每次运行新建 2 个 `probe-<runId>-*` 会话并在 `finally` 里 `detach` + `close`；失败/中断也会尽力清理；重复运行不会冲突（两次全量 + 一次 `--no-llm` 已验证）。
- 安全：不发 >8MB 帧；只操作自己创建的会话；对历史会话只 attach/detach（不 close）。
- 证据 JSON：默认 `/tmp/probe-hub/<runId>.json`，含逐 check 的 data（事件序列、stats、snapshot 形状、错误体等）。

## 7. 盘上副作用（探测产生，供清理/识别）

- 每次运行在 `~/.neo/sessions/` 新增 2 个会话文件（标题 `probe-<runId>-A-titled` / `…-B-renamed`，文件名为核心生成的 `YYYYMMDD-HHmmss-xxxxxx.json`），已 close、无 worker。
- 附件测试会在 `~/.neo/sessions/attachments/<sid>/` 留 1 个 `img-*.png`（1×1）。
- P3 attach 的历史会话是 `20261014-200020-mrazqd`（零 turn、无标题、2026-10-14 的垃圾会话）；因约束“不 close 别人的会话”只 detach，其 worker 会残留到 Hub 重启。选它是因为 turn=0 且历史最久，对用户数据影响最小；建议 Hub 重启后自然清掉。
- 本次探测时 `session.list` 从 96 条增长到 128 条，主要为本次 `probe-*` + 并行 e2e/联调会话；均为可识别的测试会话。

---

## 附：与 `docs/gui-integration-v0.0.2.md` 的差异（实测纠偏）

| 文档说法 | 实测 | 影响 |
|---|---|---|
| 握手失败「直接关闭 4401」 | HTTP 401 → WS close **1002**（Bun）/浏览器 1006 | GUI 鉴权失败处理必须基于“未收到 ready”而非 4401 |
| `session.list` 摘要字段是占位值 | ✅ 一致（title/provider/tier/mode 全占位；status=worker 存活） | 以快照为准 |
| `attach` 总是返回完整快照 | ✅ 一致 | lastSeq/epoch 暂无效 |
| `session.create` 后未持久化可能不出现在列表 | ✅ 一致；更严重：**不带 title 时 attach 直接 not_found** | create 必带 title |
| `transcript.fetch` fromSeq 含 | ✅ 一致（闭区间），`limit` 默认/最大 1000 | — |
| 附件 ≤5 张 / ≤5MB / 8MB 帧 | ✅ 一致；帧 7.34MB 仍可继续使用连接 | 前端要更保守 |
| `session.detach` 后 worker 保活 | ✅ 一致（保活=内存常驻，60–85MB/会话） | 需要资源策略 |
| 「command.run 同 v0.0.1」 | 实测传输层恒 `ok:true`、命令失败在 `data.ok=false` | GUI 必须看 data.ok |
| `snapshot.live` 存在 | ✅ 实测断线重连可拿到 turnId+partial 正文 | 重连可直接续渲染 |
