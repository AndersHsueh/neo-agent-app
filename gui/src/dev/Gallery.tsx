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

function assistantBlock(): AssistantBlock {
  return {
    kind: "assistant",
    id: "g-a",
    at: Date.now(),
    tier: "deep_reasoning",
    segments: [
      { type: "p", text: t("gallery.sample.drift") },
      { type: "ul", items: [t("gallery.sample.alias"), t("gallery.sample.where")] },
    ],
  };
}

function reasoningBlock(): ReasoningBlock {
  return {
    kind: "reasoning",
    id: "g-r",
    at: Date.now(),
    text: t("gallery.sample.reason"),
    durationMs: 1100,
    tokens: 196,
    done: true,
  };
}

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

function questionBlock(): QuestionBlock {
  return {
    kind: "question",
    id: "g-q",
    at: Date.now(),
    prompt: t("gallery.sample.ask"),
    options: [
      { key: "1", label: t("gallery.sample.opt1"), description: t("gallery.sample.opt1d") },
      { key: "2", label: t("gallery.sample.opt2"), description: t("gallery.sample.opt2d") },
    ],
  };
}

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
        <h2>{t("gallery.buttons")}</h2>
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
        <h2>{t("gallery.tiers")}</h2>
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
        <h2>{t("gallery.fields")}</h2>
        <div class="gallery__grid">
          <label class="field">
            <span class="field__label">
              <span class="field__main">{t("settings.f.baseUrl")}</span>
              <code>base_url</code>
            </span>
            <input class="input" value="https://ipsapro.isoftstone.com/thor/v1" readOnly />
          </label>
          <label class="field">
            <span class="field__label">
              <span class="field__main">{t("settings.f.key")}</span>
              <code>api_key</code>
            </span>
            <input class="input input--masked" value="sk-···7f2a" readOnly />
          </label>
          <div class="panel__card">
            <Toggle
              on
              label={t("settings.team.envEnabled")}
              hint="env.enabled"
              onChange={() => undefined}
            />
            <Toggle
              on={false}
              label={t("settings.classifier.toolinfo")}
              hint="toolcall_info_details"
              onChange={() => undefined}
            />
          </div>
        </div>
      </section>

      <section class="gallery__section">
        <h2>{t("gallery.code")}</h2>
        <div class="gallery__grid">
          <CodeBlock
            file="src/input/commands.ts"
            lang="ts"
            code={`const TIER_ALIAS = new Map([\n  ["deep", "deep_reasoning"],\n]);\n${t("gallery.sample.comment")}`}
          />
          <DiffView diff={FIXTURE_DIFF} />
        </div>
      </section>

      <section class="gallery__section">
        <h2>{t("gallery.messages")}</h2>
        <div class="gallery__stream">
          <UserMessage
            block={{
              kind: "user",
              id: "g-u",
              at: Date.now(),
              text: t("gallery.sample.user"),
              refs: [{ icon: "file", label: "tests/commands.test.ts" }],
            }}
          />
          <AssistantMessage block={assistantBlock()} streaming={false} />
          <ReasoningMessage block={reasoningBlock()} />
          <ToolCard block={tool} />
          <ApprovalCard block={approval} />
          <QuestionCard block={questionBlock()} />
          <StatsRow block={stats} />
        </div>
      </section>

      <section class="gallery__section">
        <h2>{t("gallery.prose")}</h2>
        <Prose
          segments={[
            {
              type: "p",
              text: t("gallery.sample.prose"),
            },
            { type: "code", lang: "ts", code: "const a = 1;" },
          ]}
        />
      </section>
    </div>
  );
}
