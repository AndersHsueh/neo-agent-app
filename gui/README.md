# neo GUI（v1 前端）

neo CLI 的桌面工作台前端。**严格分层 + 自有设计系统**，附一个用同一份协议类型写成的
`dummy-serv`。真后端与 Tauri 壳不在这里。

```
浏览器(Preact) ──HTTP 登录──▶ dummy-serv(Bun)
       └─────WebSocket /ws───────┘   每会话一份状态；事件 → reducer → 视图
```

## 快速开始

```bash
cd neo-agent-gui/gui
bun install
bun run dev:all        # dummy-serv :5292 + vite :5296
# 打开 http://localhost:5296
# 账号：neo / tom / jacky，密码即邮箱前缀
```

其他命令：

| 命令                            | 作用                                                |
| ------------------------------- | --------------------------------------------------- |
| `bun run dev` / `bun run dummy` | 分开起前后端                                        |
| `bun run typecheck`             | `tsc --noEmit`（strict + noUncheckedIndexedAccess） |
| `bun run test`                  | vitest（reducer / protocol / i18n）                 |
| `bun run test:e2e`              | playwright（自带 dummy + vite，含断线故障注入）     |
| `bun run lint`                  | biome（0 error 才算过）                             |
| `bun run check`                 | typecheck + lint + unit                             |
| `?gallery=1`                    | 组件墙（视觉基线）                                  |

## 目录

```
src/
  protocol/    唯一协议源：types / guards / fixtures（dummy 也 import 这一份）
  transport/   WebSocket 客户端：请求-响应配对、重连、seq
  state/       signals store + 纯 reducer + 控制器（app.ts）
  auth/        登录态（token 在 sessionStorage，不进 localStorage）
  components/  设计系统原子（自有，无 UI 库）+ SVG sprite
  features/    boot / login / workbench / transcript / composer / approval /
               palette / settings / usage
  i18n/        zh/en 类型化字典（少 key 编译期红）+ t()
  styles/      原型收敛的令牌与组件样式
  dev/         gallery（组件状态矩阵）
dummy-serv/    Bun HTTP+WS；脚本化轮次、审批/提问挂起、多用户、用量、故障注入
```

## 工程闸门

```
bun run check && bun run test:e2e
```

当前：typecheck 0 error · biome 0 error（10 warnings）· vitest 20 pass · playwright 5 pass。
细节见 `../docs/gui-v1-architecture.md`。

## 已经能做什么（M0–M3）

- 登录/登出/切换用户；**每用户会话与用量隔离**（同机多账号不串）
- 多会话侧栏、流式正文、思维链折叠、工具卡、轮次统计
- AskUser 单选卡（点击或 1/2/3）、写文件审批（内联 + 弹窗 diff + 120s 倒计时 + 拒绝路径）
- 档位切换与分类器升档（身份从 NEO 变成 Mr. Andersson）
- 断线自动重连：`attach{lastSeq}` → 快照恢复，挂起问题不丢、用户消息不重复
- ⌘K 命令面板、设置读写（providers 只读掩码 / 路由 / 分类器 / 运行时 / 记忆 / 团队 / 外观）
- 中英完整切换（含对话内容；代码片段里的注释不翻，声明见 docs）

## 没做

- Tauri 壳与分发（M4）
- 真 hub：每会话子进程、真模型、真工具执行
- 文件树 / diff 逐段接受 / 对端实时面板（M2 之后的增量）
- 长会话虚拟化（当前一次渲染全部块；几千块时需要）

## 文档

- 产品：`../docs/gui-v1-prd.md`
- 架构：`../docs/gui-v1-architecture.md`
- 协议：`../docs/gui-v1-protocol.md`
- 设计系统：`../docs/gui-v1-design-system.md`
- 计划与里程碑：`../docs/gui-build-plan.md`
