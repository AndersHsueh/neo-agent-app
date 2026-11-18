# e2e（Playwright × 真实 neo-core-serve v0.0.2 Hub）

这套 e2e 不再使用 `dummy-serv`，也不再有登录页：GUI 启动时通过 Vite dev 插件的
`GET /__neo/endpoint` 发现**已在运行的真实 Hub**（`~/.neo/run/core.json` + token），
自动登录并 attach 会话。一轮消息走真实 LLM（约 3–8s）。

## 前置

1. Hub 在跑（测试**不启动、不杀、不重启**它）：

   ```bash
   matrix-core hub --dev-auth        # 发现文件 ~/.neo/run/core.json
   curl http://127.0.0.1:<port>/health   # {"ok":true,"mode":"hub",...}
   ```

2. `~/.neo/settings.json` 的 provider 可用（否则首个 turn 以 `stats.error` 收口）。

Vite（5296）由 Playwright 的 `webServer` 起；如果本地已经有 dev server，
`reuseExistingServer: true` 会直接复用。浏览器用本机 Chrome（`channel: "chrome"`）。

## 运行

```bash
cd gui
bun x playwright test                                      # 默认只有 @gui
NEO_E2E_HUB=1 bun x playwright test --project=hub          # 真实 Hub，不含模型回合
NEO_E2E_LLM=1 bun x playwright test --project=llm          # 真实 Hub + 真实模型回合
```

`hub` / `llm` 默认不进运行列表（not-run，不是 skip）。
显式打开之后，Hub 或提供方不在就失败，连接被拒绝不会被记成通过。

失败产物（trace / screenshot / aria snapshot）在 `test-results/`；
`trace: "retain-on-failure"`、`screenshot: "only-on-failure"`。

## 用例 ↔ 联调验收清单（gui-integration-v0.0.2.md §8）

| 用例                                  | 覆盖                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hub.spec.ts` 1) 启动                 | 发现即登录（无登录页）；`ready.capabilities` 含 `sessions/transcript.replay/attachments.image`；`session.list` → 侧栏；hub 标签 + connection=live |
| `hub.spec.ts` 2) 新建会话 + 一轮 turn | `session.create`→`attach` 空快照；被选中；真实 LLM 流式（turnActive）；`.stats` 收口；`assistant.end.text` 不重复不缺字                           |
| `hub.spec.ts` 3) 两会话并行           | A 跑 turn 时切 B 发消息互不串流；`detach/attach`；切回 A 历史完整                                                                                 |
| `hub.spec.ts` 4) close / resume       | owner `session.close` → worker 退出（`session.list` 状态 idle/dead、DOM 状态 chip）；再次 attach 恢复历史（resume）                               |
| `hub.spec.ts` 5) 刷新重连             | `page.reload()` 后自动重连、attach 完整快照、用户消息/回复/stats 不重影                                                                           |
| `hub.spec.ts` 7) transcript 历史      | 切到有历史的会话块渲染完整；`transcript.fetch{fromSeq,limit}` 翻页含 `turn.start/assistant.end/stats`                                             |
| `commands.spec.ts` 6a                 | `/tier balanced`（真实生效）与 `/tier fast`：`.cmdresult` 渲染 + 档位标识/meta 变化                                                               |
| `commands.spec.ts` 6b                 | 未知命令 `/nope`：`.cmdresult.is-error` 提示、页面不崩、会话/连接不变                                                                             |
| `attachments.spec.ts` 8a              | 选 1 张 PNG → 预览 → 发送 → 本轮回显 `img.chatimg` + 正常收口                                                                                     |
| `attachments.spec.ts` 8b              | >5 张 / >5MB 本地拦截提示；协议层 `too_large` 回传 danger toast；预览可移除                                                                       |
| `offline.spec.ts` 9a `@gui`           | 发现 503 → 离线兜底页（原因 + 重试按钮）。恢复登录是 `@hub`                                                                                       |
| `offline.spec.ts` 9b                  | 发现成功但 WS 不可达 → 工作台 `.connbar` 离线提示 + 退避重试，**不进登录页**                                                                      |

未覆盖（需要受控 fake LLM / 注入工具调用，或属 §8 可选）：审批卡 allow/deny/allow-session、
提问单选/多选/自定义、非 owner close → `forbidden`、慢消费者 4408、手工 kill worker。

## 用例约定（Hub v0.0.2 行为）

- **每浏览器 context 都会新建会话**：干净 localStorage → 启动时自动 `session.create`；
  用例结束把当前会话改名为 `e2e-*`（便于按前缀清理），**不删会话文件**（Hub 语义：close 保留文件）。
- 断言不依赖 `~/.neo/sessions` 的历史条数或历史内容；每个用例自建自用。
- `session.list` 的 `title` 是**占位值**（由 id 派生）→ 按 `sessionId`（`store` + 列表索引）定位会话，
  不按标题查找；选中后以 `snapshot.meta` 为准。
- v0.0.2 **同一 session 同时只允许一个客户端 attach**（第二个 → `conflict`）；用例串行（`workers: 1`），
  刷新用例依赖旧连接先断开。
- 服务端会**合批 delta**：不对分片数/连续 seq 断言；以 `assistant.end.text` 为权威全文。
- 附件：协议不回传附件元数据 → 图片只在**本轮回显**；刷新/历史不显示属 v0.0.2 已知限制。
- 真实 Hub 的 `/tier deep_reasoning` 因 minimax(anthropic 未接入) 会降级到 default，
  用例改用 `balanced`/`fast` 断言真实生效。
- 错误路径用 `page.route("**/__neo/endpoint")` 注入（503 / 200+坏 url），不碰 `gui/src`、不启停 Hub。

## 失败归类口径

报告里失败分三类，不混为一谈：

1. **GUI bug**：GUI 与 `gui-integration-v0.0.2.md` 契约不一致（附复现命令 + 期望/实际 + trace）。
2. **Hub 行为不符合文档**：Hub 侧问题（附请求/回执/事件序列）。
3. **测试假设错误**：用例对协议/时序/选择器的假设不成立（修 spec）。

## 分组

| 组             | 何时跑                       | 环境不在时                                       |
| -------------- | ---------------------------- | ------------------------------------------------ |
| `gui` (`@gui`) | 默认 `bun x playwright test` | 这些用例自己 mock 端点或用视觉夹具，必须真的执行 |
| `hub` (`@hub`) | `NEO_E2E_HUB=1`              | 失败，不跳过                                     |
| `llm` (`@llm`) | `NEO_E2E_LLM=1`              | 失败，不跳过                                     |

视觉夹具（`openVisualFixture`）只用于顶栏和对比度，不是 Hub 验收。
