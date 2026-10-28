/**
 * dev/Gallery.tsx — 组件墙（?gallery=1）。
 * 每个原子的状态矩阵一屏可看；视觉回归以这一页为基线。
 */

import { CodeBlock } from "@/components/CodeBlock.tsx";
import { DiffView } from "@/components/DiffView.tsx";
import { Icon } from "@/components/Icon.tsx";
import { Prose } from "@/components/Prose.tsx";
import { Button, Tag, Toggle } from "@/components/primitives.tsx";
import {
  ApprovalCard,
  AssistantMessage,
  QuestionCard,
  ReasoningMessage,
  StatsRow,
  ToolCard,
  UserMessage,
} from "@/features/transcript/Blocks.tsx";
import { t } from "@/i18n";
import { TIER_ICONS, TIER_KEYS } from "@/lib/tiers.ts";
import type {
  ApprovalBlock,
  AssistantBlock,
  QuestionBlock,
  ReasoningBlock,
  StatsBlock,
  ToolBlock,
} from "@/protocol";
import { FIXTURE_DIFF } from "@/protocol";

const assistant: AssistantBlock = {
  kind: "assistant",
  id: "g-a",
  at: Date.now(),
  tier: "deep_reasoning",
  segments: [
    {
      type: "p",
      text: "漂移是单向的：命令表里有四个档位别名，`handleCommand` 的 switch 里只有 `/tier`。",
    },
    { type: "ul", items: ["别名本身没错 —— `/deep` 更顺手。", "错在归一化的位置。"] },
  ],
};

const reasoning: ReasoningBlock = {
  kind: "reasoning",
  id: "g-r",
  at: Date.now(),
  text: "先确认漂移的方向：命令表多了，还是 switch 多了。守卫按「表 → switch」单向检查。",
  durationMs: 1100,
  tokens: 196,
  done: true,
};

const tool: ToolBlock = {
  kind: "tool",
  id: "g-t",
  at: Date.now(),
  name: "shell",
  icon: "terminal",
  arg: "bun test tests/commands.test.ts",
  state: "error",
  durationMs: 1900,
  output: "1 pass, 1 fail\nmissing branches: /deep /balanced /fast /default",
  foot: "exit 1 · 4 commands missing branches",
};

const approval: ApprovalBlock = {
  kind: "approval",
  id: "g-ap",
  at: Date.now(),
  tool: "edit_file",
  path: "src/input/commands.ts",
  diff: FIXTURE_DIFF,
  state: "pending",
  deadlineAt: Date.now() + 120_000,
};

const question: QuestionBlock = {
  kind: "question",
  id: "g-q",
  at: Date.now(),
  prompt: "用哪条路修？三条都能让守卫变绿，代价不同。",
  options: [
    { key: "1", label: "入口归一化（推荐）", description: "别名与规范名只有一份映射。" },
    { key: "2", label: "在 switch 里补四个 case", description: "最快，但重复四遍。" },
  ],
};

const stats: StatsBlock = {
  kind: "stats",
  id: "g-s",
  at: Date.now(),
  durationMs: 8400,
  usage: { promptTokens: 12400, completionTokens: 1800, reasoningTokens: 640, costMicros: 11000 },
  toolCalls: 5,
  iterations: 4,
  tier: "deep_reasoning",
};

export function Gallery() {
  return (
    <div class="gallery">
      <header class="gallery__head">
        <span class="eyebrow">{t("gallery.title")}</span>
        <h1>{t("gallery.subtitle")}</h1>
        <a class="gallery__back" href="/">
          ← {t("nav.constructs")}
        </a>
      </header>

      <section class="gallery__section">
        <h2>Buttons / Tags</h2>
        <div class="gallery__row">
          <Button variant="primary">Primary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="ghost" icon="check">
            With icon
          </Button>
          <Tag>plain</Tag>
          <Tag tone="accent">accent</Tag>
          <Tag tone="warn">warn</Tag>
          <Tag tone="danger">danger</Tag>
          <kbd class="kbd">⌘K</kbd>
        </div>
      </section>

      <section class="gallery__section">
        <h2>Tiers / Status</h2>
        <div class="gallery__row">
          {(["deep_reasoning", "balanced", "fast", "default"] as const).map((tier) => (
            <span class={`seg seg--${TIER_KEYS[tier]} is-on`} key={tier}>
              <Icon name={TIER_ICONS[tier]} />
              <span class="seg__label">{tier}</span>
            </span>
          ))}
          {["working", "waiting", "stalled", "idle", "dead"].map((status) => (
            <span class="session__state" key={status}>
              <i
                class={`led ${status === "working" ? "led--live" : status === "waiting" ? "led--warn" : status === "dead" ? "led--danger" : "led--dim"}`}
              />
              {t(`state.${status}` as never)}
            </span>
          ))}
        </div>
      </section>

      <section class="gallery__section">
        <h2>Fields / Toggles</h2>
        <div class="gallery__grid">
          <label class="field">
            <span class="field__label">
              <span class="field__main">网关地址</span>
              <code>base_url</code>
            </span>
            <input class="input" value="https://ipsapro.isoftstone.com/thor/v1" readOnly />
          </label>
          <label class="field">
            <span class="field__label">
              <span class="field__main">密钥</span>
              <code>api_key</code>
            </span>
            <input class="input input--masked" value="sk-···7f2a" readOnly />
          </label>
          <div class="panel__card">
            <Toggle on label="启用环境探测" hint="env.enabled" onChange={() => undefined} />
            <Toggle
              on={false}
              label="工具调用细节"
              hint="toolcall_info_details"
              onChange={() => undefined}
            />
          </div>
        </div>
      </section>

      <section class="gallery__section">
        <h2>Code / Diff</h2>
        <div class="gallery__grid">
          <CodeBlock
            file="src/input/commands.ts"
            lang="ts"
            code={
              'const TIER_ALIAS = new Map([\n  ["deep", "deep_reasoning"],\n]);\n// 归一化放在分发入口'
            }
          />
          <DiffView diff={FIXTURE_DIFF} />
        </div>
      </section>

      <section class="gallery__section">
        <h2>Messages</h2>
        <div class="gallery__stream">
          <UserMessage
            block={{
              kind: "user",
              id: "g-u",
              at: Date.now(),
              text: "先定位，别急着改。",
              refs: [{ icon: "file", label: "tests/commands.test.ts" }],
            }}
          />
          <AssistantMessage block={assistant} streaming={false} />
          <ReasoningMessage block={reasoning} />
          <ToolCard block={tool} />
          <ApprovalCard block={approval} />
          <QuestionCard block={question} />
          <StatsRow block={stats} />
        </div>
      </section>

      <section class="gallery__section">
        <h2>Prose</h2>
        <Prose
          segments={[
            {
              type: "p",
              text: "行内 `code`、**加粗**、*强调*，以及一个 [链接](https://example.com)。",
            },
            { type: "code", lang: "ts", code: "const a = 1;" },
          ]}
        />
      </section>
    </div>
  );
}
