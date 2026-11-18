# 隔离 Hub 联调（6221d28）

不是视觉夹具。GUI 通过 Vite 的 `GET /__neo/endpoint` 读到这份 Hub 的发现文件，再走真实 WebSocket。

## 提交

- GUI：见本次提交的 `git rev-parse HEAD`
- Hub：`6221d2816cd397a90d321a5dfb92751368641e18`（`https://github.com/AndersHsueh/neo-core-serve`，只检出这一笔）

## 隔离

全部在 `/tmp/neo-itest`。没有写 `/home/ubuntu/.neo`（联调前后该目录都不存在）。

| 用途 | 路径 |
| --- | --- |
| `HOME` | `/tmp/neo-itest/home` |
| `NEO_HOME` | `/tmp/neo-itest/home/.neo` |
| 发现文件 | `/tmp/neo-itest/home/.neo/run/core.json` |
| Hub 工作目录 | `/tmp/neo-itest/work`（里面只有测试用 `settings.json`） |
| 假 OpenAI | `127.0.0.1:18123`，`/v1/chat/completions` |
| Hub | `ws://127.0.0.1:43221/ws`，`bun src/main.ts hub --port 0 --dev-auth --cwd /tmp/neo-itest/work` |
| Vite | 同一 `HOME`，`127.0.0.1:5296` |

停进程只杀这次拉起的 tmux 会话 `neo-fake-llm`、`neo-hub`、`neo-vite-iso`。Hub 收到 SIGTERM 后只清自己那份 `core.json`。

## 对比度

算法写在 `gui/tests/e2e/layout.spec.ts` 文件头。数字来自 `getComputedStyle` 的最终前景色，再按祖先的 `background-color` 做 alpha 合成。渐变的 `background-color` 是透明，所以底记到页面 `--void`。这一轮没有再改色。

| 元素 | 对比度 | 计算前景 | 合成背景 |
| --- | --- | --- | --- |
| 空态大字 | 13.08 | rgb(43, 37, 34) | rgb(243, 238, 230) |
| 空态正文 | 8.42 | rgb(74, 67, 60) | rgb(243, 238, 230) |
| 空态提示 | 6.50 | rgb(92, 83, 76) | rgb(243, 238, 230) |
| 输入占位 | 8.42 | rgb(74, 67, 60) | rgb(243, 238, 230) |
| 会话元信息 | 7.99 | rgb(74, 67, 60) | rgb(239, 232, 220) |
| 输入栏下方说明 | 8.42 | rgb(74, 67, 60) | rgb(243, 238, 230) |

## 这一次的计数

`NEO_E2E_HUB=1 NEO_E2E_FAKE_LLM=1 bun x playwright test`

- gui：6 passed / 0 failed / 0 skipped
- hub：5 passed / 0 failed / 0 skipped
- fake-llm：6 passed / 0 failed / 0 skipped
- llm（外部真提供方）：6 not-run

合计 17 passed。日志：`playwright-rerun.txt`、`hub.stderr`、`fake-llm.log`。
