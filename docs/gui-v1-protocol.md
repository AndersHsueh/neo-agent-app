# neo GUI v1 —— 前端 ⇄ Hub 协议

> 状态：`v=1` 草案已实现（dummy-serv 与前端同一份类型）· 2026-10-28
> 唯一事实源：`gui/src/protocol/types.ts`；运行时校验：`guards.ts`；契约样本：`fixtures.ts`。
> 本文与代码冲突时，**代码是准的**，文档要跟。

## 1. 纪律

1. **边界校验**：只信任通过 `decodeServerMessage` 的字节；未知字段容忍，未知事件/命令拒绝。
2. **seq 单调**：每个会话一个 seq；断线重连时 `attach{lastSeq}`，缺口过大 hub 发全量 `snapshot`。
3. **幂等**：`turn.send` 带 `clientId`；重发不产生第二轮；快照里的 `UserBlock.clientId` 用于去重与保留未落盘消息。
4. **审批/提问可恢复**：它们作为块存在快照里；刷新/重连后仍可见、可回答。
5. **前端不见密钥**：设置只返回掩码。

## 2. 传输与鉴权

- **HTTP**：`POST /api/auth/login {email,password}` → `{token,expiresAt,user}`；`POST /api/auth/logout`；`GET /api/health`。
- **WebSocket**：`/ws?lang=zh|en`，token 走子协议 `["neo.v1","bearer.<token>"]`（不落 URL）。
- 未认证：发送 `result{ok:false,error.code="unauthorized"}` 后关闭（4401）。
- 开发期：前端直连 `127.0.0.1:5292`（`VITE_DUMMY` 可覆写）；生产期同源。

## 3. 信封

```ts
type ClientMessage = { v: 1; kind: "command"; id: string; command: ClientCommand };
type ServerMessage =
  | { v: 1; kind: "ready"; user: User }
  | { v: 1; kind: "result"; id: string; ok: true; data: unknown }
  | { v: 1; kind: "result"; id: string; ok: false; error: HubError }
  | { v: 1; kind: "event"; sessionId: string; seq: number; event: SessionEvent }
  | { v: 1; kind: "snapshot"; sessionId: string; seq: number; snapshot: SessionSnapshot }
  | { v: 1; kind: "sessions"; sessions: SessionMeta[] }   // 推送
  | { v: 1; kind: "settings"; settings: SettingsView }    // 推送
  | { v: 1; kind: "usage"; range: ...; records: UsageRecord[]; totals: Usage }
  | { v: 1; kind: "pong" };
```

命令一律有回执（`result{id}`）；查询类命令的结果放在 `data`（`sessions/settings/usage` 这些 kind 只用于服务端主动推送）。

## 4. 命令

| 命令 | 参数 | 语义 |
|---|---|---|
| `auth.login/logout/whoami` | WS 上不支持登录（走 HTTP）；`auth.whoami` 返回当前 user |
| `session.list` | — | 只返回**当前用户**的会话 |
| `session.create` | `title?` | 新建构造，归属当前用户 |
| `session.attach` | `sessionId, lastSeq?` | 订阅并返回快照；非属主 → `forbidden` |
| `session.detach` | `sessionId` | 退订 |
| `session.rename` | `sessionId, title` | 改名，广播 `session.meta` |
| `session.close` | `sessionId` | 关会话（进程回收在真 hub） |
| `turn.send` | `sessionId, text, clientId, refs?` | 已有一轮在跑 → `conflict` |
| `turn.abort` | `sessionId` | 请求中断本轮 |
| `approval.resolve` | `sessionId, blockId, decision: allow\|deny\|allow-session` | 挂起项不存在 → `approval_expired` |
| `question.answer` | `sessionId, blockId, key` | 回答案；挂起项不存在 → `not_found` |
| `command.run` | `sessionId, name, args` | 斜杠命令（tier/compact/…） |
| `settings.get` | — | 返回 `SettingsView`（掩码） |
| `settings.patch` | `SettingsPatch` | 浅合并 + 嵌套部分合并 |
| `usage.summary` | `range: session\|day\|month, sessionId?` | 只统计当前用户 |
| `ping` | — | `pong` |

错误码：`unauthorized | forbidden | not_found | conflict | rate_limited | timeout | approval_expired | session_gone | protocol | internal`。

## 5. 事件

| 事件 | 关键字段 | 说明 |
|---|---|---|
| `turn.start` | `turnId, blockId, n, at, userText?, clientId?, refs?` | 带用户文本，便于多标签页一致；发送方按 clientId 去重 |
| `assistant.start/delta/end` | `blockId, (at,tier) / text` | 增量正文 |
| `reasoning.start/delta/end` | `blockId, text?, durationMs?, tokens?` | 思维链 |
| `tool.start/end` | `name,icon,arg / state,output,durationMs,foot?` | 工具卡 |
| `approval.request/resolve` | `tool,path,diff,deadlineAt / state` | 写盘闸门 |
| `question.request/resolve` | `prompt,options / key,answerLabel?` | 单选卡；answerLabel 让所有观察者看到“选了哪条” |
| `tier.switch` | `from,to,reason,at` | 档位变化留痕 |
| `stats` | `durationMs,usage,toolCalls,iterations,tier` | 收口一轮；服务端据此记用量 |
| `banner` / `error` | `level,text / code,message,retryable` | 提示与错误 |
| `session.meta/status`、`context`、`peer.update`、`auth.expired` | — | 元信息与连接级事件 |

`SessionEvent` 是穷举联合：新增类型时 `applyEvent` 的 switch 会编译报错，逼你处理。

## 6. 块模型

协议里块由 reducer 生成，形如：

```
turn | user | assistant{segments:p|ul|code} | reasoning | tool | approval |
question | tierline | stats | banner | error
```

`SessionSnapshot = { meta, seq, blocks, context, lastTurn?, pendingApprovalId?, pendingQuestionId? }`。

## 7. 登录、多用户与计费

```ts
User        { id, email, displayName, role: owner|member }
TokenGrant  { token, expiresAt, user }
UsageRecord { id, userId, sessionId, turnId, provider, model, tier, at, ...Usage }
```

- **隔离**：会话/用量/设置都按 `userId` 过滤；服务端在每个命令处校验属主。
- **计费归属**：一个 turn 的用量记在**会话所有者**（`stats.userId = session.ownerId`）。
- **退出**：token 从内存/服务端表移除；前端清 sessionStorage、会话/用量/设置视图。
- **将来**：`auth.login` 换 OIDC；`User`/`UsageRecord` 不变；owner/team 权限模型在 M4 前补。

## 8. dummy-serv 的一致性

- 与前端 **import 同一份** `protocol/` 与控制器的纯 reducer（`gui/src/state/session.ts`），
  不存在“dummy 一套、真 hub 一套”的漂移。
- 只在协议之外补三个开发能力：
  - `POST /api/dev/reset`：把世界复位到种子状态（e2e 每用例隔离）；
  - `NEO_DUMMY_FAULTS=drop-ws|slow-token|token-expire|approval-timeout`；
  - 会话内**合成时钟**（对话时间戳连续），统计用真实耗时。

## 9. 版本演进

- `v` 不匹配 → 拒绝整帧（`protocol` 错误）。
- 新增可选字段不升版本；新事件类型属于不兼容变更，需要 `v=2` 或“先发能力声明”。
- 真 hub 落地时，把 `fixtures.ts` 原样接过去跑契约测试——这是防止漂移的第二道闸。
