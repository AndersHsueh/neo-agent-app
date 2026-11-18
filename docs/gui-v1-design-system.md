# neo GUI v1 —— 设计系统

> 状态：M0–M3 已实现 · 2026-10-28
> 视觉基准：`neo-prototype-2/`（已验收）。实现按组件重建，**不搬 HTML**，令牌与类名对齐以便对照。

## 1. 立场

工作台结构仍借多会话、状态可见、审批可审。视觉改成暖纸：燕麦 / 米白表面、炭黑文字、
陶土橙只作点缀，衬线标题配无衬线正文。留白松一点，分割靠发丝线，圆角软，几乎没有阴影，
也不做装饰渐变。动效短而安静。

不要霓虹、不要 CRT / 终端监视器、不要扫描线胶片颗粒当默认材质，也不要组件库的默认铬质感。

## 2. 令牌

### 颜色

| 令牌 | 值 | 用法 |
|---|---|---|
| `--void` / `--surface-0..5` | `#f3eee6` → `#d3c8b8` | 燕麦纸到略深的槽；不是纯白，也不是灰 |
| `--line-0..4` | `rgba(43,37,34, 0.06→0.42)` | 发丝分割线，同一条炭黑只改 alpha |
| `--ink-1..5` | `#2b2522` → `#6e655c` | 可读文本在米白上 ≥ 4.5:1（含 `--ink-5` 的提示） |
| `--accent` | `#a24a32` | 陶土。链接、主按钮、当前项；不铺大面积 |
| `--tier-deep/balanced/fast/default` | `#b23b32 / #3d6b4a / #3a627c / #6a5e54` | 档位角色还在，墨色压暗，纸上不再用霓虹 |
| 状态色 | `ok/warn/danger/info` | 同一原则：能读，不发光 |

### 字体

- 衬线（Iowan / Palatino / 宋体栈）：标题、空态字标、会话名。
- 无衬线（`-apple-system` 栈 + PingFang）：正文、说明、设置项、eyebrow。
- 等宽（`SF Mono` 栈）：身份、状态、数值、路径、工具名、代码。
- 字号：`10.5 / 11 / 12 / 13 / 14 / 16 / 20 / 26`；中文行高 1.66、英文 1.58（按 `lang` 切换）。

### 尺度

- 间距 4 基准：4/8/12/16/20/24/32/40/56。
- 圆角：6/8/10/14/18/24。软，但不改四区骨架的间距。
- 顶栏档位和权限是整词，不按字折行。顶栏放不下时整组收成图标，不缩小字号。
- 普通文字对比度不低于 4.5:1，大字不低于 3:1。层次靠墨色深浅，不靠发灰。
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

默认没有扫描线、胶片颗粒、磷光和焦点光晕。纸的颜色本身就是表面。
设置里仍可以把扫描线 / 颗粒打开，那是可选项，不是这套界面的样子。
焦点是 1px 环。

## 6. 与原型的关系

- 令牌、类名、视觉决策一致；实现是 Preact 组件 + 同一套 CSS。
- 差异：原型里一次性的演示逻辑（脚本打字机、假计时器）替换为协议事件驱动；
  新增登录、账号、用量、组件墙四个界面。
- 视觉回归：关键屏截图存 `docs/shots/gui-v1/`；改令牌或布局后与原型的 `neo-prototype-2/docs/shots/` 对照。

## 7. 已知缺口

- 没有自带字体：衬线 / 无衬线 / 等宽都走系统栈。
- 只有这一套暖纸主题。
- 长会话无虚拟化；几千块时滚动性能待测。
- 应用图标在 `docs/branding/icons/`（`icon.icns` 与 Tauri 那一套 PNG / ICO）。源稿在 `docs/branding/source/`。
