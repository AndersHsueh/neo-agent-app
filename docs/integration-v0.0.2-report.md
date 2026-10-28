# neo-agent-app × neo-core-serve v0.0.2 联调报告

> 日期：2026-10-29 · 环境：macOS (M4P) · 真实 Hub（非 dummy-serv）· 真实 LLM
> 联调指南：`neo-core-serve/docs/gui-integration-v0.0.2.md`（协议 v1.2）
> 结论：**GUI 已切到真实 Hub 跑通**（发现/握手/多会话/流式/审批/提问/命令/附件/断线重连/worker 崩溃恢复），
> 自动化 e2e 与人工冒烟均通过；本文同时记录 Hub 侧发现的 4 个问题与文档纠偏。

---

## 1. 环境与前置

```bash
# 后端（用户已有进程，全程未重启）
cd neo-core-serve && bun src/main.ts hub --port 0 --dev-auth --cwd current_prj
# → ws://127.0.0.1:61895/ws, token ~/.neo/run/core.token, discovery ~/.neo/run/core.json

# 前端
cd neo-agent-app/gui && bun install && bun run dev    # vite :5296
```

- **LLM 配置**：本次联调创建了用户级 `~/.neo/settings.json`（0600，内容来自 `neo/settings.json` 的 `ipsa` provider）。
  没有它 Hub 仍可连、会话可建，但每轮 `stats.error`。文档 §1 推荐的就是这份用户级配置。
- **默认 cwd**：Hub 启动参数是 `--cwd current_prj`，但该目录当时**不存在** → `session.create` 的 worker
  `posix_spawn` 直接 `ENOENT`（报错指向 bun 可执行文件，极具误导性）。已 `mkdir -p current_prj` 修复环境。
- **dummy-serv 已退出联调链路**：`gui/package.json` 删掉 `dummy` / `dev:all` 脚本，Playwright webServer 只起 Vite。
  `dummy-serv/` 仅作为历史代码保留，不参与 dev/test。

---

## 2. GUI 侧改动清单

| 层 | 文件 | 改动 |
|---|---|---|
| 协议 | `gui/src/protocol/{types,guards,fixtures,reducer,commands,commands.json,index}` | 从 core 仓 vendor v1.2；本地补丁见 [vendor-patches.md](vendor-patches.md)（stats 新字段、审批 detail/diff 可空、提问多选/自定义/超时、`UserBlock.attachments` 本地预览、`assistant.end.text`/`reasoning.end.text` 权威覆盖） |
| 发现 | `gui/vite.config.ts`、`gui/src/lib/endpoints.ts` | 新增 dev 中间件 `GET /__neo/endpoint`（代读 `~/.neo/run/core.json` + token，服务端调 `/api/auth/login` 换 user、`/health` 取版本）；删除 dummy 代理；客户端只认这一个发现契约 |
| 传输 | `gui/src/transport/hub.ts` | 每次（重）连重新发现；4401/4408/1006 统一「退避重连 + 重新发现」；ready 超时；发现成功即上抛 endpoint（`onEndpoint`），不等握手 |
| 控制器 | `gui/src/state/app.ts` | 启动链改为「发现即登录」；单连接单会话（换会话先 `detach`）、`attach{lastSeq,epoch}`；`create` 必带 `title`；`close` 后自动 attach 下一条（失败则新建）；`runCommand` 返回 `{ok,blocks,changes,error}`；`fetchTranscript`；`settings.patch` 只读；`turn.aborted` 合成 banner |
| 状态 | `gui/src/state/store.ts`、`session.ts` | store 增加 endpoint/capabilities/versions/boot(connecting/ready/offline)，`session.ts` 退化为 `protocol/reducer` 的 re-export |
| UI | `features/login`、`App.tsx` | 登录页改为「离线兜底」（发现失败显示原因 + 重试）；发现成功但 WS 不通 → 工作台 + `.connbar`，不回登录页 |
| 渲染 | `gui/src/lib/markdown.ts`、`components/Prose.tsx`、`features/transcript/Blocks.tsx`、`styles/components.css` | 助手正文改为完整 markdown 渲染（零依赖、全量转义）：标题 / 列表（两级）/ **GFM 表格（对齐）** / 围栏代码块 / 引用 / 分隔线 / 行内 code·bold·italic·删除线·链接；命令结果 markdown 复用同一渲染器；流式光标插在最后段落内 |
| UI | `features/transcript/Blocks.tsx`、`approval/`、`palette/`、`lib/commands.ts`、`features/composer/` | v1.2 新块（turn.aborted/compact/command.result/ViewBlock/banner/统计新字段）、审批无 diff 显示 detail、提问多选/自由输入、命令面板由 `commands.json` 生成（`/tier fast` 带参、未知命令回执 + `.cmdresult`）、图片选择/粘贴/预览/限流 |
| 测试 | `gui/tests/e2e/**`、`playwright.config.ts`、`gui/tests/unit/vendor-conformance.test.ts`、`scripts/probe-hub.ts` | e2e 切真实 Hub；新增 33→ 单测（含 vendor 一致性 12 条）；Hub 协议探测脚本 |

---

## 3. 验证结果

### 3.1 自动化

| 闸门 | 结果 |
|---|---|
| `bun run typecheck` | ✅ 0 error |
| `bun run test`（vitest） | ✅ 5 files / **47 pass**（reducer、protocol、i18n、vendor conformance） |
| `bun run test:e2e`（Playwright + 真实 Hub + 真实 LLM） | ✅ 12 pass / 0 fail（约 41–47s，连续 5 次全绿） |
| `bun x vite build` | ✅ 62 modules |
| `bun run lint`（biome 改动文件） | ✅ 0 error（components.css 仅有 2 个 baseline warning） |
| `bun run scripts/probe-hub.ts`（Hub 协议探测） | ✅ **14 PASS / 0 FAIL**（`--no-llm` 11 PASS / 3 SKIP） |

### 3.2 人工冒烟（Playwright 驱动真实浏览器 + 真实 Hub，Lead 执行）

| # | 场景 | 结果 | 证据 |
|---|---|---|---|
| S1 | 发现即登录（无登录页）→ 会话列表 128+ → 新建 → 发消息 → 流式正文/思维链 → `.stats` | ✅ | `/tmp/gui-smoke/03-turn.png` |
| S2 | 附件：选 1×1 PNG → 预览 → 发送 → Hub 落盘 `~/.neo/sessions/attachments/<sid>/img-*.png` | ✅ | `10-attach.png` |
| S3 | 会话内 6 张附件（绕过前端校验）→ 服务端 `too_large` → GUI danger toast「内容太大…」 | ✅ | — |
| S4 | 两会话并行：A 跑到一半切 B 发消息 → 互不串流；切回 A 期间完成的轮次由快照补齐（含 stats、tierline、banner） | ✅ | `30-parallel-a.png` |
| S5 | 刷新重连：`page.reload()` → 自动重连 → attach 完整快照 → 历史不重影（同 clientId 消息不重复） | ✅ | `11-reload.png` |
| S6 | `session.close`（owner）→ worker 退出 → 自动切下一条（含失效会话跳过）；再次 `attach` 被关会话 → resume 恢复 5 块 | ✅ | — |
| S7 | ask_user 提问：单选/多选/自由输入；提问卡渲染 header/context/倒计时 | ✅ | `20-question.png` |
| S8 | 审批：ask 模式下 `write_file` → 无 diff 显示 detail + 倒计时 → allow → 工具执行（`tool:ok`） | ✅ | `22-approval.png` |
| S9 | worker 崩溃恢复：`kill -9` 全部 worker → Hub 发 `session.status{dead}` 解绑 → GUI 自动 re-attach（resume）→ 下一条消息正常收口 | ✅ | `50-after-crash.png` |
| S10 | Hub WS 不可达（发现 200 + 坏 url）→ 工作台 + 离线条 + 退避重试；发现 503 → 离线兜底页（原因 + 可点重试） | ✅ | `60-badws.png`、`61-offline.png` |
| S11 | 命令面板：`/tier ` 由 catalog 生成 `模型与档位` 分组 → 执行 → `.cmdresult`（kv 结果 + changes）；`/nope` → `data.ok:false` + notice | ✅ | `31-palette.png`、`32-palette-result.png` |
| S13 | markdown 渲染：真实 LLM 输出 GFM 表格 → `<table>/<th>/<td>` 正确渲染（`|---|` 分隔行不外泄）、无原始竖线文本；XSS 全量转义（单测 14 条覆盖） | ✅ | `95-markdown.png` / `07-markdown-table.png` |
| S12 | 权威全文：`assistant.end.text` 覆盖 delta（段落单段、无重复）；stats 带 finishReason/contextUsage/error | ✅ | `40-final-turn.png` |

### 3.2.1 界面证据

`docs/shots/integration-v0.0.2/`

| 文件 | 内容 |
|---|---|
| `01-workbench.png` | 真实 Hub 工作台：会话列表（真实标题）、流式回答、统计行、右侧上下文/用量/provider |
| `02-approval.png` | 审批卡（无 diff → detail、倒计时、允许/拒绝） |
| `03-question.png` | ask_user 提问卡（单选） |
| `04-palette.png` | 命令面板（由 `commands.json` 生成、`/tier [tier]` 带参） |
| `05-offline-connbar.png` | 发现成功但 Hub WS 不可达：工作台 + 离线横条 + 退避重连 |
| `06-offline-page.png` | 发现失败（503）：离线兜底页 + 原因 + 重试 |
| `07-markdown-table.png` | 助手正文 markdown 渲染：GFM 表格（对齐/表头）、段落换行、工具调用链 |

### 3.3 Hub 协议探测（`scripts/probe-hub.ts`，14 项）

发现/握手/ready caps、create 带/不带 title、list 占位形状、attach resume 快照、单连接绑定语义、
close 幂等与 resume、transcript.fetch 分页、command.run 结果形状、真实 turn 事件与合批、
mid-turn 断线重连 `snapshot.live`、附件限制与错误码、错误信封、token/Origin 校验。
详见 [hub-probe-findings.md](hub-probe-findings.md)。

### 3.4 Playwright e2e（真实 Hub）

**`bun x playwright test` → 12 passed / 0 failed（约 41–47s；连续 5 次全绿）**

前置：真实 Hub 在跑 + `~/.neo/settings.json` 可用；Playwright 只起 Vite（Hub 由外部提供，测试不重启它）。
覆盖联调指南 §8 的 12 项：

| # | 用例 | 耗时 |
|---|---|---|
| 1 | 启动：`/__neo/endpoint` 发现即登录（无登录页）、capabilities 含 `sessions`/`transcript.replay`/`attachments.image`、hub 在线 + 会话列表 | 0.6s |
| 2 | 新建会话 → 选中；真实 turn 流式（turnActive）→ `.stats`；`assistant.end.text` 不重复不缺字；用户消息不重影 | 6.4s |
| 3 | 两会话并行：A 跑 turn 时切 B 发消息互不串流；切回 A 历史完整 | 5.9s |
| 4 | `close` → worker 退出（列表状态 idle/dead）；再次 attach resume 历史 | 3.9s |
| 5 | 刷新重连：attach 完整快照，用户/回复/stats 各 1 份不重影 | 3.3s |
| 6a | `/tier balanced` 真实生效（`.cmdresult` + `.seg.is-on` + meta.tier） | 0.9s |
| 6b | `/nope` 未知命令 `.cmdresult.is-error`，页面不崩、会话/连接不变 | 0.7s |
| 7 | 历史会话切回、块渲染完整 + `transcript.fetch(1,200)` 含 turn.start/assistant.end/stats | 9.2s |
| 8a | 1 张 PNG 预览 → 发送 → 本轮回显 `img.chatimg` → 正常收口 | 6.2s |
| 8b | >5 张 / >5MB 本地拦截；协议层 `too_large` → danger toast；预览可移除 | 1.0s |
| 9a | 发现 503 → 离线兜底页（原因 + retry）；恢复后点重试自动登录 | 0.6s |
| 9b | 发现 200 + 坏 url → 工作台 `.connbar` 离线 + 退避重试 ≥2 次，不进登录页 | 1.1s |

说明与未覆盖：用例按 sessionId 定位（`session.list` 标题是占位值），每个用例自建会话并以 `e2e-` 前缀命名，
不依赖历史会话总数；断言不假设 delta 分片/连续 seq。未覆盖（需要受控 fake LLM/工具注入或 §8 标可选）：
审批 allow/deny/allow-session、提问单选/多选/custom、非 owner close→forbidden、慢消费者 4408。
其中审批与提问已由 Lead 人工冒烟覆盖（§3.2 S7/S8），慢消费者与 >8MB 帧受客观条件限制未测。
详见 `gui/tests/e2e/README.md`。


---

## 4. 关键适配决策（为什么这么改）

1. **`create` 必带 `title`**：Hub 只有 `rename`/首轮才 `persistMessages()` 落盘；`session.attach` 第一步
   `existsSync(sessions/<sid>.json)` → 不带 title 新建后立刻 attach 100% `not_found`。GUI 用
   `新会话 HH:MM:SS` 作为 title（也满足「先 create 再 rename 不可能」的约束）。
2. **换会话串行 detach → attach**：Hub 一条连接只绑一个会话，且同会话只允许一个客户端；未 attach 的转发命令
   一律 `conflict`（唯一例外 `settings.get`）。并发 attach 会互相 conflict，所以 `selectSession` 串行化。
3. **真源是 snapshot.meta**：`session.list` 的 title/provider/tier/mode 全是占位值，`status=working` 只代表
   worker 存活。UI 列表只用 id/status 壳，选中后以 attach 的 snapshot 校正。
4. **流式不可假设逐 token**：服务端 16ms/4KB 合批（实测 default 档整段一次到、fast 档 261 字 3 帧）。
   渲染以 `assistant.end.text` / `reasoning.end.text` 覆盖，delta 只做过程展示。
5. **列表标题以本地 snapshot.meta 校正**：`session.list` 的 title 是占位值（`会话 <id后6位>`），
   `refreshSessions()` 用已 attach 会话的 `snapshot.meta` 覆盖列表字段，避免刷新后被占位标题打回。
6. **重连以完整快照重建**：v0.0.2 不做增量回放；`lastSeq/epoch` 照带（未来兼容），本地乐观消息按 clientId 去重。
7. **发现即登录**：浏览器读不到 `~/.neo/run/core.json`，dev 由 Vite 中间件代读并换 dev-auth user；
   生产（Tauri）由本地后端实现同一 `/__neo/endpoint` 契约。
8. **附件前端限流**：≤5 张 / 单张 ≤5MB / png|jpeg|webp（服务端还有 8MB 帧上限；5×5MB 会超帧，故前端先拦）。
   协议 v0.0.2 不回传附件元数据 → 历史图片不可恢复（已知限制，刷新后只剩文本）。

---

## 5. Hub 侧发现的问题 / 文档纠偏（建议反馈给 core 仓）

| # | 问题 | 影响 | 证据 |
|---|---|---|---|
| H1 | **`session.create` 不带 title 时不落盘 → 紧接着 `attach` 必然 `not_found`**，而协议里 `title` 是可选字段 | CLI/客户端按协议可选字段调用会踩坑；GUI 只能强制带 title 规避 | probe P1 |
| H2 | `--cwd` 指向不存在的目录时，Hub 启动无校验；worker `Bun.spawn` 报 `ENOENT` 且错误指向 bun 可执行文件 | 排查成本极高（本次联调实际踩到，误判为 bun 缺失） | 现场复现 |
| H3 | **`detach` 不回收 worker，且无空闲回收（E4 未交付）** | 联调期间 Hub 累积 36 个 worker / 约 2.4GB RSS；GUI 长时间使用切会话会持续堆进程 | probe P3b + `pgrep -P` |
| H4 | 握手鉴权失败实测是 **HTTP 401 + close 1002**（浏览器 1006），文档 §3 写「直接关闭 4401」 | 客户端若只判 4401 会漏掉 token 轮换/被拒；GUI 已改为「任何握手失败都重新发现 + 退避」 | probe P11 |
| H5 | `session.list` 的 title 恒为 `会话 <id后6位>`（丢真实标题）、provider/tier/mode 恒为占位值 | GUI 列表只能显示 id 派生的假标题；真实标题要 attach 后才有 | probe P2 |
| H6 | `turn.aborted` / `compact.start` / `command.result` 在快照 reducer 只收口状态、不产生可见块；`compact.end` 硬编码中文 banner | 各客户端需自行合成提示（GUI 已合成 aborted banner） | probe P6 + vendor patch |
| H7 | 附件历史不回传元数据（协议已知，v0.0.3） | 刷新/重连后图片消失 | probe P9 |

---

## 6. 已知限制 / 未验证

**GUI 侧已知限制**
- 历史轮次图片不回显（协议限制）；`settings.patch` 只读（Hub `unsupported`）；单客户端 attach（Hub v0.0.2）。
- 长会话无虚拟化；会话列表未做服务端分页（磁盘会话 100+ 时全量渲染）。
- 生产打包（Tauri）未接：`/__neo/endpoint` 需要 Tauri 侧后端实现同契约，否则生产构建会显示离线页。

**未验证（客观限制）**
- 服务端 4408 慢消费者（需构造不读帧）；>8MB 单帧（会触发连接层关闭）；Windows/Linux 实机。
- 审批的「允许本会话」与 diff 存在时的逐段审阅（真实 LLM 本次只触发了无 diff 的新建文件审批）。
- Hub 空闲回收/worker 上限（E4 未交付）。

---

## 7. 复跑方式

```bash
# 0) 前置：Hub 在跑 + ~/.neo/settings.json 有可用 provider
cd neo-agent-app/gui
bun install

# 1) 单测（含 vendor 一致性）
bun run typecheck && bun run test

# 2) Hub 协议探测（不依赖 GUI）
cd .. && bun run scripts/probe-hub.ts          # 全量（含真实 LLM turn）
bun run scripts/probe-hub.ts --no-llm          # 只跑协议/错误路径

# 3) e2e（只起 Vite，复用运行中的 Hub）
cd gui && bun run test:e2e

# 4) 人工看界面
bun run dev   # http://localhost:5296
```

---

## 8. 后续建议

1. Hub 侧：`session.create` 落盘时机前移（create 即写 meta），`title` 改为真必填；`--cwd` 启动校验；
   worker 空闲回收（E4）；文档把 4401 改成「握手失败（401/1002/1006）」。
2. 协议侧：`turn.start`/`UserBlock` 回传附件元数据（v0.0.3 已计划）；`turn.aborted`/`command.result`
   进入快照块或提供客户端合成规范。
3. GUI 侧：Tauri 壳实现 `/__neo/endpoint`；会话列表分页/搜索；长会话虚拟化；切走会话时的 worker 释放策略
   （依赖 Hub 空闲回收）。
