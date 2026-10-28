# neo GUI v1 —— 设计系统

> 状态：M0–M3 已实现 · 2026-10-28
> 视觉基准：`neo-prototype-2/`（已验收）。实现按组件重建，**不搬 HTML**，令牌与类名对齐以便对照。

## 1. 立场

Claude Desktop 是审美对标，不是视觉模板。借它的**工作台结构**（多会话、状态可见、审批可审）
与**动效分寸**；不借它的暖米色/陶土橙/大留白。neo 的界面要让人一眼认出与 CLI 同源。

## 2. 令牌

### 颜色

| 令牌 | 值 | 用法 |
|---|---|---|
| `--void` / `--surface-0..5` | `#050807` → `#1c2b25` | 绿偏 2° 的石板黑；不是纯灰 |
| `--line-0..4` | `rgba(126,240,178, 0.055→0.42)` | 所有描边都从同一条绿派生，只改 alpha |
| `--ink-1..5` | `#dbe9e1` → `#55695f` | 标签层下限 4.8:1（`--ink-4`）；`--ink-5` 不承载可读文本 |
| `--accent` | `#5ee0a3` | 只表达“当前/在线/焦点”，**不表达档位** |
| `--tier-deep/balanced/fast/default` | `#ff4a3d / #2ef07a / #35c9ff / #b6ffc4` | 原样继承 CLI；只出现在档位选择、路由表、署名、升档行 |
| 状态色 | `ok/warn/danger/info` | 琥珀色只给“需要人”：审批、停滞、压缩阈值 |

### 字体

- 无衬线（`-apple-system` 栈 + PingFang）：正文、说明、设置项。
- 等宽（`SF Mono` 栈）：身份、状态、数值、路径、工具名、代码、eyebrow。
- 字号：`10.5 / 11 / 12 / 13 / 14 / 16 / 20 / 26`；中文行高 1.66、英文 1.58（按 `lang` 切换）。

### 尺度

- 间距 4 基准：4/8/12/16/20/24/32/40/56。
- 圆角 8 基准：4/6/8/12/16/22；比阅读型 UI 更收。
- 动效四档：`100 / 180 / 280 / 420ms`，曲线只有 ease-out / ease-in-out / ease-in，**无过冲**；
  唯一例外是开机名字变幻 620ms。`prefers-reduced-motion` 或设置开关 → 动画 1ms、循环 1 次。

## 3. 组件矩阵

| 层 | 组件 | 状态要点 |
|---|---|---|
| 原子 | Button（primary/ghost/danger/quiet）· IconButton · Chip · Tag · Segmented · Kbd · Toggle · Field/Input/Select · ProgressRing · Modal | 键盘可达；Modal 必带焦点陷阱与背景 `inert` |
| 领域 | TierPicker · StatusLed · SessionRow · MessageBlock（user/assistant/reasoning/tool/approval/question/stats/banner/error）· DiffView · CodeBlock · Prose · UsagePanel · PeerRow | 只吃 props；不读 store、不发请求 |
| 布局 | Rail / Sidebar / Topbar / Aside / Composer / 四区网格 | 断点：1360 收右栏、1120 收档位文字、920 收侧栏、720 收竖脊 |

**状态矩阵**在 `?gallery=1` 一屏可看，是视觉回归基线。

## 4. 可访问性

- 对比度：可读文本 ≥ 4.5:1；装饰性与 `aria-hidden` 元素才低于这一档。
- 焦点：`:focus-visible` 1px 环 + 弱外发光；Modal 打开时 `#app.inert`。
- 键盘：登录 → 发消息 → 答问（1/2/3）→ 审批（Esc/↩）→ 切换会话/档位/语言，全流程可不点鼠标。
- 语义：进度环 `role=progressbar`；会话行是原生 button；装饰 SVG `aria-hidden` 或带 `<title>`。

## 5. 材质

极淡 CRT 扫描线 + 2.8% 胶片颗粒 + 左上角磷光漫射。目标：压掉纯黑的塑料感，不是做特效；
全部可关，关了之后界面仍成立。

## 6. 与原型的关系

- 令牌、类名、视觉决策一致；实现是 Preact 组件 + 同一套 CSS。
- 差异：原型里一次性的演示逻辑（脚本打字机、假计时器）替换为协议事件驱动；
  新增登录、账号、用量、组件墙四个界面。
- 视觉回归：关键屏截图存 `docs/shots/gui-v1/`；改令牌或布局后与原型的 `neo-prototype-2/docs/shots/` 对照。

## 7. 已知缺口

- 没有自带字体：等宽/无衬线走系统栈，Windows 会回退 Consolas，标签层字距会变；
  **M4 随 Tauri 打包子集化字体**（这是“让 Matrix 第一眼立住”性价比最高的一步）。
- 没有浅色主题（有意：绿色是语义，不是皮肤）。
- 长会话无虚拟化；几千块时滚动性能待测。
