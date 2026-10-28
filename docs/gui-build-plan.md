# neo GUI · 落地计划（v1）

> 状态：**已拍板并完成 M0–M3**（前端 + dummy-serv） · 日期：2026-10-28
> 拍板：路径 `neo-agent-gui/gui/` + `docs/`；栈 Preact+Vite+Signals；范围 = 前端 + dummy + mock 登录（Tauri 推迟 M4）
> 上游：`gui-prd.md`（形态定案 v2）、`neo-prototype-2/`（设计原型，已过用户验收）、
> `neo` CLI 的 `settings.example.json` 与 `src/input/commands.ts`（唯一事实源）
> 本文是**计划**：定范围、定栈、定结构、定验收。开工后按 CLI 的 PRD 体例拆成
> `gui-v1-prd.md` / `gui-v1-architecture.md` / `gui-v1-protocol.md`。

---

## 0. 一句话

把已经过验收的原型，**重写成一套有类型、有分层、可测试、可扩展的生产级前端**，
配一个用同一份协议类型写成的 `dummy-serv`；真后端与 Tauri 壳不在本轮。

**原型是视觉基准，不是代码基准。** HTML/CSS 不搬，按设计系统在组件层重建；
原型的截图与 `neo-prototype-2/css/tokens.css` 作为回归对照。

---

## 1. 范围

### 本轮做

| # | 交付 | 说明 |
|---|---|---|
| 1 | `gui/` 前端应用 | Preact + TS + Vite（待拍板），严格分层，零第三方 UI 组件库 |
| 2 | `dummy-serv/` | Bun HTTP + WebSocket；登录、会话、事件流、审批、故障注入；与前端共用协议类型 |
| 3 | 文档 | 本计划 + PRD + 架构 + 协议（含登录/计费）+ 里程碑验收 |
| 4 | 工程闸门 | tsc strict / vitest / playwright e2e + 视觉回归 / biome / i18n key parity / 协议 fixture |
| 5 | 登录（mock 打通） | 前端登录页 + token + 当前用户 + 按用户隔离的会话与用量，**为将来真实登录留完整接缝** |

### 本轮不做

- 真后端（Bun 多进程 hub、每会话子进程、`AgentEvent` 适配）——只定义协议与假实现。
- Tauri 壳、打包、签名、自动更新——下一轮（M4）。
- 真实 SSO / OIDC / 团队中心化账号——只留接口与数据模型。
- 文件树 / diff 逐段接受 / 对端面板的实时数据——M2 之后按原型逐步补。

---

## 2. 技术选型（**待拍板**）

| 方案 | 内容 | 优点 | 代价 | 判断 |
|---|---|---|---|---|
| **A. Preact + Vite（推荐）** | TS + Preact + `@preact/signals`；CSS 用原型 tokens；vitest + playwright | 状态多（多会话、流式增量、审批挂起、登录态）时组件化收益最大；Preact 3KB，最终能被 Bun 打包进 Tauri；Vite dev 快；无 UI 库，视觉仍 100% 自有 | 前端仓从“零依赖”变成有依赖（不污染 `neo` CLI 的零依赖） | ✅ 推荐 |
| B. 纯 TS + 手写 DOM（沿原型） | 与原型同构，零依赖 | 与 CLI 气质一致；无构建 | 到 15+ 界面状态后 imperative 代码会堆起来；组件状态矩阵与测试都难 | 备选（若你坚持零依赖） |
| C. React + 生态 | React + Vite | 生态最大 | 体积/复杂度过度；容易滑向“装一个组件库”从而失去自有视觉 | 不推荐 |

**结论**：选 A。**依赖纪律**：运行时依赖只允许 `preact` + `@preact/signals`；
开发依赖允许 vite / vitest / playwright / biome。**不引** UI 库、图标库、状态库、CSS 框架。

---

## 3. 仓库与目录

```
neo-agent-gui/
  docs/
    gui-build-plan.md          # 本文
    gui-v1-prd.md              # M0 产出：产品 PRD（角色/流程/屏幕/验收）
    gui-v1-architecture.md     # M0 产出：前端分层、状态、渲染、错误模型
    gui-v1-protocol.md         # M0 产出：前端 ⇄ hub 协议（只写类型与语义）
    gui-v1-design-system.md    # M0 产出：令牌、组件矩阵、动效与 a11y
  gui/                         # ★ 本轮实现
    package.json  vite.config.ts  tsconfig.json  biome.json  index.html
    src/
      main.tsx
      app/            # 组合根：providers、路由、错误边界、启动序列
      protocol/       # 唯一协议源：types + 运行时校验 + fixtures（dummy-serv 直接 import）
      transport/      # ws 客户端、重连、seq 续传、增量合批
      api/            # 面向业务的客户端（auth / sessions / turns / approvals / settings）
      state/          # store（signals）+ 纯 reducer + selectors
      auth/           # 登录态、token 生命周期、路由守卫
      components/     # 设计系统原子组件（自有，无外部 UI 库）
      features/       # 按能力切片：workbench / transcript / composer / approval /
                      #   palette / settings / usage / boot / peers
      i18n/           # zh/en 字典 + 类型化 key + 奇偶校验
      styles/         # tokens / base / layout / components（从原型收敛）
      dev/            # gallery（组件状态矩阵）、fixtures
    tests/
      unit/           # reducer、protocol、i18n、格式化
      e2e/            # playwright：登录→多会话→审批→重连→设置
      visual/         # 截图基线（gallery + 关键屏）
  dummy-serv/
    src/{index.ts, auth.ts, hub.ts, scenario.ts, usage.ts, store.ts}
    scenarios/*.json              # 场景脚本（正常/慢/断线/催审批/过期 token）
  neo-prototype-2/                # 设计原型（保留；不参与构建、不被 import）
```

**为什么 `gui/` 不放在 `neo/` 里**：两套发布节奏、两套依赖、两拨验收；
CLI 守零依赖，GUI 允许前端依赖。协议类型将来会提取成 `packages/protocol`，
dummy-serv 与真 hub 共用——这是本轮就要保证的接缝。

---

## 4. 前端分层与数据流

单向、无全局事件总线：

```
transport(ws) → protocol.validate → 事件入站队列
     → sessionReducer(纯函数) → store(signals) → view(组件)
     → 用户操作 → api(rpc) → transport → hub
```

- **`protocol/`**：唯一事实源。命令与事件的 TS 类型 + 运行时校验（手写窄化，不引 zod）
  + `fixtures/`（每条事件至少一个样本，单测用它驱动 reducer）。
- **`transport/`**：连接、重连（指数退避 + jitter）、`seq` 断点续传、快照回退、
  入站事件按 16ms 合批（避免流式 token 触发重渲染风暴）。
- **`state/`**：`SessionState` 只由 reducer 改；视图只读 selectors。
  流式文本作为 `streamBuffers` 单独存，render 时与已完成块合并——避免每 token 复制整棵消息树。
- **`features/`**：一个能力一个目录，对内可组合 components，对外只暴露一个入口。
- **错误模型**：`HubError{ code, message, retryable }`，`code` 是联合类型；
  UI 按 code 映射文案（i18n），不解析字符串。

**关键状态机**（写在 `gui-v1-architecture.md` 里，M0 定稿）：

```
disconnected ──connect──▶ authenticating ──ok──▶ attaching ──snapshot──▶ live
      ▲                        │                  │                    │
      └──── auth.expired ◀─────┘                  └── seq gap ──▶ resync ─┘
turn: idle → sending → streaming{text|reasoning|tools} → awaiting_approval → done|aborted|error
```

---

## 5. 协议草案（前端视角，M0 出完整版）

**传输**：`ws://127.0.0.1:<port>/ws`，令牌走 `Sec-WebSocket-Protocol`（不塞 query，
避免落日志）；HTTP 仅用于登录与静态健康检查。

**信封**（所有消息同构）：

```ts
type Envelope =
  | { v: 1; kind: "command"; id: string; cmd: Command }
  | { v: 1; kind: "result";  id: string; ok: true;  data: unknown }
  | { v: 1; kind: "result";  id: string; ok: false; error: HubError }
  | { v: 1; kind: "event";   sessionId: string; seq: number; event: SessionEvent }
  | { v: 1; kind: "snapshot";sessionId: string; seq: number; snapshot: SessionSnapshot };
```

**命令**（前端 → hub，节选）：`auth.login/logout/whoami`、`session.list/create/attach/
detach/rename/close`、`turn.send/abort`、`approval.resolve`、`question.answer`、
`command.run`、`settings.get/patch`、`usage.summary`。

**事件**（hub → 前端）：`ready`、`session.meta`、`event`(`text|reasoning|tool_start|
tool_end|turn_end|compact|tier_switch|error|aborted`)、`approval.request`、
`question.request`、`stats`、`peer.update`、`usage`、`auth.expired`。

**纪律**：
1. `seq` 每会话单调递增；`attach{lastSeq}` 续传，缺口过大 → 发 `snapshot`。
2. 写操作幂等：`turn.send` 带 `clientId`，重连后 `attach` 返回已收到的请求，不重放副作用。
3. `approval.request` 在快照里保留（刷新页面后仍能看到挂起的审批）。
4. 前端不看见任何 provider 密钥：`settings.get` 只返回掩码。

完整类型骨架先写在 `gui-v1-protocol.md`（只类型、不实现），等你否过再落 `protocol/`。

---

## 6. 登录与计费（为将来预留，本轮打通）

**问题**（你的原话）：同一台机器多用户登录会造成计费混乱。

**模型**：

```ts
type User = { id: string; email: string; displayName: string; role: "owner" | "member" };
type AuthState = { user: User; token: string; expiresAt: number } | null;
type UsageRecord = {
  id: string; userId: string; sessionId: string; turnId: string;
  provider: string; model: string; tier: Tier;
  promptTokens: number; completionTokens: number; reasoningTokens: number;
  costMicros: number; at: number;
};
```

**隔离规则**（写进 PRD，实现与 dummy 都遵守）：

| 资源 | 归属 | 隔离方式 |
|---|---|---|
| 会话 / 消息 / 审批 | 发起登录的用户 | 每用户命名空间；列表只返回自己的 |
| provider 配置与密钥 | 用户 | 用户级 settings；密钥在后端，前端只见掩码 |
| 用量与账单 | 会话所有者（发起 turn 的用户） | `UsageRecord.userId` = session owner |
| 跨会话消息 | 归属**接收方会话的所有者** | 派发方在 UI 里显示为“由 @tom 派发”，但不改计费归属 |

- **Token**：短时（2h）+ 刷新；桌面端放内存（Tauri 期再进系统钥匙串），**不落 localStorage**。
- **登录失败/过期**：`auth.expired` 事件 → 清理 store → 回登录页，保留未发送草稿。
- **多用户同机**：hub 内是账号体系；退出登录后本地不残留上一个用户的数据（缓存按 userId 键）。
- **将来真实登录**：`auth.login` 换成 OIDC code flow 时，前端只换 `api/auth` 一层，
  `AuthState` 与守卫不变。

**dummy-serv 账号**：`neo` / `tom` / `jacky` 三个本地账号（密码在 `users.json`，
`Bun.password` 哈希），登录后各自看到自己的会话与用量；带 `?user=tom` 的快捷登录便于 e2e。

---

## 7. dummy-serv

- **同一份协议类型**：`import type { ... } from "../gui/src/protocol"`；不允许复制字符串。
- **场景引擎**：`scenarios/*.json` 描述一轮的时序（思考 1.1s → 工具 0.8s → 审批挂起 →
  允许 → 复跑 → 升档 → 统计），带 `delay`/`chunk`；前端拿到的波形与真 hub 同构。
- **故障注入**（e2e 用）：`drop-ws`、`slow-token`、`token-expire`、`approval-timeout`、
  `snapshot-gap`——每个都能通过 URL/环境变量开启。
- **刻意不做**：不实现工具真实执行、不 spawn 进程、不接模型。它只负责“协议正确 + 可插拔故障”。

---

## 8. 设计系统落地

**从原型收敛，不是照抄**：

| 层 | 内容 |
|---|---|
| tokens | 原型的色/字/间距/圆角/动效四档（100/180/280/420，无过冲）；新增“登录/用量”需要的语义色 |
| primitives | Button / IconButton / Chip / Segmented / Kbd / Field / Input / Select / Toggle / Tooltip / Popover / Dialog / Banner / Toast / Skeleton / ProgressRing |
| domain | TierPicker / StatusLed / SessionRow / MessageBlock / ReasoningBlock / ToolCard / DiffView / ApprovalRequest / QuestionCard / TurnStats / ContextMeter / UsageBar / PeerList |
| 图标 | 继续手绘 SVG sprite（已在原型验证）；按需增补登录/用户/用量图标 |
| gallery | `/dev/gallery`：每个组件的状态矩阵一屏可看；视觉回归的基线页 |

**组件规则**：只吃 props 与 CSS 变量；不读全局 store；不 fetch；a11y 属性与键盘行为
写进组件（Dialog 必带焦点陷阱与 `inert`，原型已验证的那套直接实现为 `components/Dialog`）。

---

## 9. i18n / 可访问性 / 动效

- **i18n**：`zh.ts` / `en.ts` 两份 `as const` 字典，`types.ts` 里用工具类型保证
  **key 集合完全相等**（编译期）+ vitest 奇偶校验（运行期）；禁止在组件里写
  `lang === "zh" ? ... : ...`（lint 规则拦）。
- **a11y**：焦点陷阱与 `inert`、`aria-live` 只给“完成的块”、ProgressRing `role=progressbar`、
  键盘全流程可完成一轮（含审批与登录）、对比度下限 4.5:1（标签层 token 收紧）。
- **动效**：沿用原型的四档与 `data-motion`；`prefers-reduced-motion` 启动即生效；
  流式打字是“批处理 + 光标”，不是逐字 `setTimeout`。

---

## 10. 里程碑与验收

> 体量与验收都按“能交给别人接手”的标准；每个里程碑结束必须过闸门并留证据
> （截图 + 测试输出 + 独立评审报告）。

### M0 · 基座（脚手架 + 协议 + dummy + 登录壳 + gallery） ✅ 已完成

- [ ] `bun run dev` 起前端，`bun run dummy` 起假后端，一条命令 `bun run dev:all` 全起
- [ ] `protocol/` 类型 + 校验 + fixtures；dummy-serv 直接 import 同一份类型
- [ ] 登录页 → dummy 登录 → token → 守卫；`auth.expired` 回登录页
- [ ] gallery 路由：所有 primitives 的状态矩阵
- [ ] 工程闸门全绿：tsc strict / vitest / biome / i18n parity
- [ ] 文档四件套（PRD / 架构 / 协议 / 设计系统）出稿

### M1 · 工作台闭环 ✅ 已完成

- [ ] 多会话侧栏（状态、档位、未读）+ 新建/切换/重命名
- [ ] 流式对话：text / reasoning / tool 卡 / 轮次统计；思维链折叠
- [ ] 命令面板（⌘K）：会话/动作/档位/权限/斜杠命令
- [ ] 设置：providers（掩码）/路由/分类器/运行时/记忆/团队，读写走 `settings.patch`
- [ ] 中英完整；刷新页面从快照恢复

### M2 · 审批与韧性 ✅ 已完成（视觉回归基线为手工截图；自动化视觉对比待 M4）

- [ ] 审批流：内联 + 模态 diff、允许/拒绝/本会话、120s 倒计时、快照里保留挂起审批
- [ ] AskUser 单选卡（键盘 1/2/3）
- [ ] 断线重连：断网 5s 恢复、seq 缺口触发 snapshot、不重复投递
- [ ] 故障注入场景全过（drop-ws / slow-token / token-expire / approval-timeout）
- [ ] 键盘全流程 e2e（登录→发消息→审批→重连→设置）
- [ ] 视觉回归基线建立

### M3 · 多用户与计费 ✅ 已实现（用量面板为总量；按 provider/tier 拆分待补）

- [ ] 登录/登出/切换用户；会话与用量按用户隔离（tom 看不到 neo 的会话）
- [ ] 用量面板：本会话 / 本日 / 本月；按 provider/tier 拆分
- [ ] 跨会话消息的“派发人”标注与计费归属规则可见
- [ ] e2e：两个用户交替登录，数据不串
- [ ] 视觉回归 + 截图 + 独立评审通过

### M4 ·（不在本轮）Tauri 壳与分发 ⏳

开窗/托盘/单实例/自动更新/签名；Bun 单文件编译；首次启动引导页。

---

## 11. 工程闸门

```
bun run check
  = tsc --noEmit（strict, noUncheckedIndexedAccess）
  + biome check（禁止 any / console / 内联 lang 三元）
  + vitest（reducer / protocol fixtures / i18n parity / formatters）
  + playwright（e2e + 视觉回归差值为 0）
bun run dev:all   # 前端 + dummy 一起起
```

- 协议 fixture 是**契约测试**：dummy-serv 发的事件必须能被前端校验器接受；
  将来真 hub 接上时，同一批 fixture 直接复用。
- 视觉回归只对 gallery 与四张关键屏做基线，避免“每改文案就红”。

---

## 12. 迭代方式（怎么保证“拿得出手”）

1. **每 1 个里程碑 = 3 个循环**：实现 → 自检截图（CDP，中英 + 1024/1512）→ 独立评审（fresh 上下文，只读）
2. 评审给 P0/P1 必须在进入下一里程碑前清零；P2 记录不阻塞。
3. 文档跟着代码走：接口变了先改 `gui-v1-protocol.md`，再改实现。
4. 原型 `neo-prototype-2` 冻结为“视觉验收基准”，不再改动。

---

## 13. 风险

| # | 风险 | 对策 |
|---|---|---|
| R1 | 框架选型反复 | 本轮只锁 Preact（若拍板 B 则手写 DOM），组件层与框架解耦（纯 CSS + 纯函数 reducer） |
| R2 | 协议与真 hub 漂移 | 协议类型单一源 + fixture 契约测试；dummy 不复制类型 |
| R3 | 流式渲染性能 | 16ms 合批 + 流缓冲与已完成块分离 + 长会话虚拟化（M2 视情况） |
| R4 | 登录/计费过度设计 | 本轮只做 mock 打通与数据模型；真实 SSO 留接口，不做权限体系 |
| R5 | 视觉回退（工程化后不如原型好看） | gallery + 视觉回归基线；每屏与原型的截图对照评审 |
| R6 | 「零依赖」被破坏的争议 | GUI 与 CLI 分仓；CLI 的零依赖不受影响，GUI 依赖清单白名单化 |

---

## 14. 需要你拍板

1. **路径**：应用放 `neo-agent-gui/gui/`、文档放 `neo-agent-gui/docs/`，原型保留原地？（推荐）
2. **技术栈**：Preact + Vite（推荐）／纯 TS 无框架（零依赖）／React + Vite。
3. **本轮范围**：前端 + dummy-serv + mock 登录（推荐）；Tauri 壳推迟到 M4？

## 15. 开放问题（不阻塞开工，但要在 M2 前定）

- 跨用户派活（tom 给 jacky 的会话发消息）时，计费记给谁？默认“接收方会话所有者”，UI 标注派发人。
- provider 密钥是用户级还是机器级？默认用户级（每人自己的 key），owner 可下发共享 key。
- 同一台机器多用户，会话文件是否要加密/隔离路径？默认 `~/.neo/users/<uid>/…`。
- 登录方式最终形态（本地账号 / OIDC / 团队 SSO / 设备码）——影响 M3 的 UI，但不影响本轮数据模型。


---

## 16. 落地结果（2026-10-28）

| 项 | 结果 |
|---|---|
| 应用位置 | `gui/`（Vite + Preact + Signals） |
| 假后端 | `dummy-serv/`（Bun HTTP + WS，与前端共用协议类型与 reducer） |
| 文档 | PRD / 架构 / 协议 / 设计系统 四件套 |
| 闸门 | `tsc` 0 error · `biome` 0 error · vitest 20 pass · playwright 5 pass |
| 证据 | `docs/evidence/gui-v1-*.txt`；截图 `docs/shots/gui-v1/` |
| 关键额外产出 | 每用户会话/用量隔离、审批焦点陷阱、断线快照恢复、`/api/dev/reset` 测试隔离、故障注入四类 |
| 未完成 | provider/tier 维度用量拆分、跨用户派活计费标注、真 hub、Tauri 壳、长会话虚拟化 |
