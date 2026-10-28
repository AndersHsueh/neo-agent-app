# neo GUI v1 —— 前端架构

> 状态：M0–M3 已实现 · 2026-10-28 · 与 `gui/src` 一一对应

## 1. 分层

```
protocol/     类型 + 边界校验 + fixtures       ← 唯一事实源（dummy 也 import）
   ▲
transport/    WebSocket：请求配对 / 重连 / seq      ← 不懂业务
   ▲
api·state/    控制器（app.ts）→ signals store       ← 唯一能改状态的地方
   ▲
components/   设计系统原子（无 store、无请求）
features/     能力切片（读 store、调动作）
```

依赖只能向下。`components` 不 import `state`；`transport` 不 import `features`。

## 2. 连接与重连

`HubClient`（`transport/hub.ts`）：

- 认证：token 走 WebSocket 子协议 `bearer.<token>`，不落 URL；
- 请求-响应：`id` 配对 + 15s 超时；
- 断线：指数退避（300ms × 2^n，封顶 5s + jitter），状态机 `connecting → authenticating → attaching → live`；
- 重连成功后由控制器 `attach{lastSeq}` 拉快照；缺口太大时 hub 直接发全量快照。

**状态机**

```
disconnected ──connect──▶ authenticating ──ready──▶ attaching ──snapshot──▶ live
      ▲                        │                      │                    │
      └──── auth.expired ◀─────┘                      └── 断线 ──▶ reconnecting
```

## 3. 状态模型

- **signals**：`store.ts` 只有可观察状态（user/connection/sessions/activeId/states/settings/usage/overlay/mode…）。
- **纯 reducer**：`state/session.ts` 的 `applyEvent(state,event)` 是唯一的会话状态变更入口；
  `hydrate(snapshot, previous)` 负责“快照 + 保留未落盘的本地乐观消息（按 clientId）”。
- **乐观更新**：发送时先用 `clientId` 上屏；`turn.start` 到达时按 clientId 去重并对齐服务器时间戳。
- **派生**：`activeSession / pendingApproval / pendingQuestion / isBusy` 是 computed，不重复存。

新增一个事件类型的顺序：`protocol/types.ts` → `guards.ts` → reducer → 视图 → fixture → 单测。

## 4. 渲染

- 时间线一次渲染全部块（M1 规模够用）；新增块与流式增量都会触发跟随滚动
  （用户上滑则停止跟随，回到底部附近自动恢复）。
- 流式正文由事件增量驱动，不做前端打字机；`assistant.delta` 直接拼进最后一个段落。
- i18n 是 signal：切换语言时读 `t()` 的组件自动重渲染，不需要手动刷树。
- 所有浮层走 `components/Modal.tsx`：`#app.inert` + 文档捕获阶段焦点陷阱 + Esc + 焦点归还。

## 5. 错误模型

- 协议错误（`decodeServerMessage`）→ 不进入业务层，只提示“协议不兼容”。
- 命令失败：`result{ok:false,error}` → 按 `HubErrorCode` 映射 i18n（`errors.*`），不解析字符串。
- 流中错误：`event{type:"error"}` → 时间线里的 `error` 块（红条 + code）。
- 登录过期：`auth.expired` → 清理 store/token → 回登录页。

## 6. 安全

- token：**sessionStorage**（刷新保留、不进 localStorage、不跨标签共享）；退出即清。
- 密钥：前端永远拿不到明文；`settings.get` 只返回 `apiKeyMask`；`settings.patch` 不接收密钥字段。
- 渲染：markdown 只走白名单（行内 code/bold/em），代码高亮是自写转义器；不用 `innerHTML` 渲染模型原文。
- 浮层：背景 `inert`，焦点陷阱在 `document` 捕获阶段。

## 7. 性能

- 事件按消息粒度更新，不整树重建；每条事件只改一个会话的引用。
- 已知瓶颈：极长会话没有虚拟化；几千块时需要按 window 切片（M2 之后的增量）。
- 视觉上：`prefers-reduced-motion` 与设置开关都能把动画降到 1ms。

## 8. 测试

| 层 | 工具 | 覆盖 |
|---|---|---|
| 协议 | vitest | 每条 fixture 被接受、坏样本被拒、命令校验 |
| 状态 | vitest | hydrate/乐观消息/事件归并/审批生命周期/未知块容错 |
| i18n | vitest | key 奇偶、无空文案、英文无 CJK、插值 |
| e2e | playwright（本机 Chrome） | 登录与用户隔离、完整轮次、焦点陷阱、断线重连、命令面板+英文无中文 |
| 视觉 | 手工截图 + `?gallery=1` | 组件矩阵与关键屏（`docs/shots/gui-v1/`） |

`bun run check && bun run test:e2e` 是唯一闸门；e2e 自带 dummy（注入 `drop-ws`）与 Vite。

## 9. 扩展点

- **换真 hub**：只改 `lib/endpoints.ts` 与 `transport` 的 URL/token 约定；协议与 reducer 不动。
- **换登录方式**：`api/auth` 换成 OIDC code flow；`AuthState` 与守卫不变。
- **加一种块**：见 §3 的五步；`renderBlock` 用穷举 switch，漏了会编译报错。
- **加一个设置页**：`SettingsDialog` 里加 TAB 项 + `body` 分支；写操作走 `patchSettings`。
