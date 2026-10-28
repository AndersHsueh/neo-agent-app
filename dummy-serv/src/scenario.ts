/**
 * dummy-serv/scenario.ts — 脚本化轮次。
 *
 * 它只做三件事：按真实节奏发事件、在审批/提问处挂起等回答、按回答走不同分支。
 * 文本是中英双语的（按会话语言解析），意图是复刻原型里那条“commands 漂移守卫”的剧情。
 */

import type { FileDiff, SessionEvent } from "../../gui/src/protocol/index.ts";
import type { Hub } from "./hub.ts";
import type { Lang, Localized, World } from "./store.ts";
import { APPROVAL_DIFF, lx } from "./store.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 会话内合成时钟：与种子（14:00 起）保持一致，不跳回真实时钟 */
const CLOCK_BASE = Date.UTC(2026, 9, 28, 6, 4, 0);
let clockOffset = 0;
const resetClock = (turnNo: number) => {
  clockOffset = turnNo * 120_000;
};
const now = () => CLOCK_BASE + clockOffset + (clockOffset += 900);

const chunkDelay = (world: World) => (world.faults.has("slow-token") ? 55 : 14);

function chunks(text: string, size = 12): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

interface TurnCtx {
  hub: Hub;
  sessionId: string;
  turnId: string;
  turnNo: number;
  /** 真实时钟起点（统计用时用；对话时间戳用合成时钟） */
  realStart: number;
  text: string;
  lang: Lang;
  signal: AbortSignal;
}

const aborted = (ctx: TurnCtx) => ctx.signal.aborted;

async function streamReasoning(
  ctx: TurnCtx,
  blockId: string,
  text: Localized,
  tokens: number,
): Promise<void> {
  const started = now();
  ctx.hub.emit(ctx.sessionId, { type: "reasoning.start", blockId, at: started });
  for (const part of chunks(lx(text, ctx.lang))) {
    if (aborted(ctx)) break;
    ctx.hub.emit(ctx.sessionId, { type: "reasoning.delta", blockId, text: part });
    await sleep(chunkDelay(ctx.hub.world));
  }
  ctx.hub.emit(ctx.sessionId, {
    type: "reasoning.end",
    blockId,
    durationMs: Math.max(700, Math.min(6_000, Math.round((now() - started) * 3))),
    tokens,
  });
}

async function streamAssistant(
  ctx: TurnCtx,
  blockId: string,
  paragraphs: Localized[],
  tier: "balanced" | "deep_reasoning" | "fast" | "default",
): Promise<void> {
  ctx.hub.emit(ctx.sessionId, { type: "assistant.start", blockId, at: now(), tier });
  for (const [i, p] of paragraphs.entries()) {
    if (i > 0) {
      ctx.hub.emit(ctx.sessionId, { type: "assistant.delta", blockId, text: "\n\n" });
    }
    for (const part of chunks(lx(p, ctx.lang))) {
      if (aborted(ctx)) break;
      ctx.hub.emit(ctx.sessionId, { type: "assistant.delta", blockId, text: part });
      await sleep(chunkDelay(ctx.hub.world));
    }
  }
  ctx.hub.emit(ctx.sessionId, { type: "assistant.end", blockId });
}

function tool(
  ctx: TurnCtx,
  input: {
    id: string;
    name: string;
    icon: string;
    arg: string;
    ok: boolean;
    output: string;
    durationMs: number;
    foot?: string;
  },
): void {
  ctx.hub.emit(ctx.sessionId, {
    type: "tool.start",
    blockId: input.id,
    at: now(),
    name: input.name,
    icon: input.icon,
    arg: input.arg,
  });
  ctx.hub.emit(ctx.sessionId, {
    type: "tool.end",
    blockId: input.id,
    state: input.ok ? "ok" : "error",
    output: input.output,
    durationMs: input.durationMs,
    foot: input.foot,
  });
}

async function emitStats(ctx: TurnCtx, startedAt: number, tier: "balanced" | "deep_reasoning" | "fast" | "default"): Promise<void> {
  const durationMs = Math.max(800, Date.now() - ctx.realStart);
  ctx.hub.emit(ctx.sessionId, {
    type: "stats",
    blockId: `${ctx.turnId}-stats`,
    at: now(),
    durationMs,
    usage: {
      promptTokens: 12_400,
      completionTokens: 1_800,
      reasoningTokens: 640,
      costMicros: tier === "deep_reasoning" ? 11_000 : 5_000,
    },
    toolCalls: 5,
    iterations: 4,
    tier,
  });
}

/* ------------------------------------------------------------------ */
/* 主剧情：commands 漂移守卫                                            */
/* ------------------------------------------------------------------ */

const DEMO = {
  reasoning1: {
    zh: "改动面只有 commands.ts：加一张别名表 + 在 dispatch 里折叠。switch 不动，行为等价；测试应当立刻转绿。先出 diff 等审批。",
    en: "The change surface is just commands.ts: add an alias table and fold names at dispatch. The switch is untouched, so behavior is equivalent; tests should go green immediately. Generate the diff and wait for approval.",
  } as Localized,
  reasoning2: {
    zh: "漂移的方向是单向的：命令表里有四个档位别名，switch 里只有 /tier。守卫只查「表→实现」，所以它抓得准。三条路都能绿，代价不同。",
    en: "The drift is one-way: the table declares four tier aliases while the switch only knows /tier. The guard checks table → implementation, so it is precise. Three paths all go green, at different costs.",
  } as Localized,
  diagnosis: [
    {
      zh: "漂移是单向的，方向很明确：命令表里有 `/deep` `/balanced` `/fast` `/default`，`handleCommand` 的 switch 里只有 `/tier`。守卫只检查「表里有 → 实现有」，所以它抓得准。",
      en: "The drift is one-way and unambiguous: the table declares `/deep` `/balanced` `/fast` `/default`, while the `handleCommand` switch only knows `/tier`. The guard checks table → implementation, so it caught exactly the right thing.",
    } as Localized,
    {
      zh: "三条修法都能让守卫变绿：入口归一化（推荐，别名与规范名只留一份映射）、在 switch 里补四个 case（最快但重复）、从命令表下掉别名（用删功能换测试通过）。选哪条？",
      en: "Three fixes all turn the guard green: normalize at dispatch (one mapping, recommended), add four switch cases (fastest but duplicated), or drop the aliases (passing tests by deleting features). Which one?",
    } as Localized,
  ],
  question: {
    zh: "用哪条路修？三条都能让守卫变绿，代价不同。",
    en: "Which path? All three turn the guard green — at different costs.",
  } as Localized,
  options: [
    {
      key: "1",
      label: { zh: "入口归一化（推荐）", en: "Normalize at dispatch (recommended)" },
      description: {
        zh: "别名与规范名只有一份映射；switch 不动，未来加别名只改一张表。",
        en: "One mapping for aliases and canonical names; the switch stays put, future aliases touch one table.",
      },
    },
    {
      key: "2",
      label: { zh: "在 switch 里补四个 case", en: "Add four cases to the switch" },
      description: {
        zh: "最快，但把同一件事写了四遍，下个别名还会再犯。",
        en: "Fastest, but writes the same rule four times — the next alias repeats the bug.",
      },
    },
    {
      key: "3",
      label: { zh: "从命令表下掉别名", en: "Drop the aliases from the table" },
      description: {
        zh: "守卫立刻绿，但 CLI 手感回退，属于用删功能换测试通过。",
        en: "Guard goes green instantly, but CLI ergonomics regress — passing tests by deleting features.",
      },
    },
  ],
  final: [
    {
      zh: "补丁落在分发入口，switch 一行没动 —— 漂移守卫两条全绿。改动 6 行，其中 3 行是表项；副作用面为零，因为别名与规范名从此只有一份映射。",
      en: "The patch lands at dispatch, the switch is untouched, and both guard tests are green. Six lines, three of them table entries; the blast radius is zero because aliases and canonical names now share a single mapping.",
    } as Localized,
    {
      zh: "还有一个收尾项：`/why` 现在会显示「别名归一化」，但 CLI 里没有对应的提示文案。要不要我顺手补一句，还是留到下个版本？",
      en: "One loose end: `/why` now reports “alias normalized,” but the CLI has no copy for it yet. Want me to add that one line now, or defer it to the next version?",
    } as Localized,
  ],
  denied: [
    {
      zh: "好，不写盘。改成只读路径：补丁我贴在正文里，你自己贴 —— 也顺手把「归一化的位置」这条写进 `AGENTS.md` 的约定，下次不用再想一遍。",
      en: "Fine — no writes. Read-only path instead: the patch is attached below for you to apply, and I'd suggest adding the “normalize at dispatch” rule to `AGENTS.md` so it doesn't have to be re-derived.",
    } as Localized,
    {
      zh: "改动建议：在 `commands.ts` 里加一张 `TIER_ALIAS` 表，在分发入口把别名折叠成 `tier`，switch 保持只认规范名。",
      en: "Suggested change: add a `TIER_ALIAS` table in `commands.ts`, fold aliases into `tier` at the dispatch entry, and keep the switch canonical-only.",
    } as Localized,
  ],
  generic: [
    {
      zh: "收到。这是 dummy-serv 的脚本化回复 —— 消息没有发给任何模型。真实后端接上以后，这里会换成同一套 AgentEvent 的流式正文。",
      en: "Received. This is dummy-serv's scripted reply — nothing was sent to a model. With a real backend attached, this becomes the same AgentEvent stream.",
    } as Localized,
    {
      zh: "你现在看到的结构（思维链、工具卡、审批、轮次统计）都是按真实字段占的位；dummy 只负责按时序把它们发出来。",
      en: "Every structure you see (reasoning, tool cards, approvals, turn stats) occupies its real field; dummy only emits them in order.",
    } as Localized,
  ],
};

/* ------------------------------------------------------------------ */
/* 入口                                                                */
/* ------------------------------------------------------------------ */

export async function runTurn(ctx: TurnCtx): Promise<void> {
  resetClock(ctx.turnNo);
  const startedAt = now();
  const world = ctx.hub.world;
  const isDemo = ctx.turnNo === 3;

  if (!isDemo) {
    await streamReasoning(ctx, `${ctx.turnId}-r`, {
      zh: "先判断这一轮要不要动代码。dummy 没有真模型，只按脚本发一段思维链，让前端把“思考”这条渲染路径跑通。",
      en: "Decide whether this turn needs code changes. Dummy has no model; it emits a scripted reasoning block so the frontend exercises that render path.",
    }, 240);
    tool(ctx, {
      id: `${ctx.turnId}-t1`,
      name: "shell",
      icon: "terminal",
      arg: "bun test",
      ok: true,
      output: "2 pass, 0 fail",
      durationMs: 1200,
      foot: lx({ zh: "退出码 0 · 2 passed", en: "exit 0 · 2 passed" }, ctx.lang),
    });
    await streamAssistant(ctx, `${ctx.turnId}-a`, DEMO.generic, ctx.hub.world.states.get(ctx.sessionId)?.meta.tier ?? "balanced");
    await emitStats(ctx, startedAt, ctx.hub.world.states.get(ctx.sessionId)?.meta.tier ?? "balanced");
    return;
  }

  /* 第 1 段：定位 */
  await streamReasoning(ctx, `${ctx.turnId}-r1`, DEMO.reasoning2, 196);

  tool(ctx, {
    id: `${ctx.turnId}-read`,
    name: "read_file",
    icon: "file",
    arg: "tests/commands.test.ts",
    ok: true,
    output: "15 lines",
    durationMs: 48,
    foot: lx({ zh: "15 行 · 只读取了守卫本体", en: "15 lines · read the guard itself" }, ctx.lang),
  });

  tool(ctx, {
    id: `${ctx.turnId}-test`,
    name: "shell",
    icon: "terminal",
    arg: "bun test tests/commands.test.ts",
    ok: false,
    output: "1 pass, 1 fail · missing branches: /deep /balanced /fast /default",
    durationMs: 1900,
    foot: lx({ zh: "退出码 1 · 4 条命令缺分支", en: "exit 1 · 4 commands missing branches" }, ctx.lang),
  });

  await streamAssistant(ctx, `${ctx.turnId}-a1`, DEMO.diagnosis, "balanced");
  maybeDropConnection(ctx.hub, ctx.sessionId);

  /* 第 2 段：提问（AskUser） */
  const questionId = `${ctx.turnId}-q`;
  ctx.hub.emit(ctx.sessionId, {
    type: "question.request",
    blockId: questionId,
    at: now(),
    prompt: lx(DEMO.question, ctx.lang),
    options: DEMO.options.map((o) => ({
      key: o.key,
      label: lx(o.label, ctx.lang),
      description: lx(o.description, ctx.lang),
    })),
  });
  const answer = await ctx.hub.waitQuestion(questionId);
  const picked = DEMO.options.find((o) => o.key === answer) ?? DEMO.options[0];
  if (!picked) return;
  ctx.hub.emit(ctx.sessionId, {
    type: "question.resolve",
    blockId: questionId,
    key: picked.key,
    answerLabel: lx(picked.label, ctx.lang),
  });

  /* 第 3 段：审批 */
  await streamReasoning(ctx, `${ctx.turnId}-r2`, DEMO.reasoning1, 288);

  const approvalId = `${ctx.turnId}-ap`;
  const realNow = Date.now();
  const deadlineAt = world.faults.has("approval-timeout") ? realNow + 4_000 : realNow + 120_000;
  ctx.hub.emit(ctx.sessionId, {
    type: "approval.request",
    blockId: approvalId,
    at: now(),
    tool: "edit_file",
    path: "src/input/commands.ts",
    diff: APPROVAL_DIFF as FileDiff,
    deadlineAt,
  });
  const decision = await ctx.hub.waitApproval(approvalId, Math.max(1_000, deadlineAt - realNow));
  const allowed = decision === "allow" || decision === "allow-session";
  ctx.hub.emit(ctx.sessionId, {
    type: "approval.resolve",
    blockId: approvalId,
    state: allowed ? "allowed" : "denied",
  });

  if (!allowed) {
    await streamAssistant(ctx, `${ctx.turnId}-a2`, DEMO.denied, "balanced");
    await emitStats(ctx, startedAt, "balanced");
    return;
  }

  /* 第 4 段：落盘、复跑、升档 */
  tool(ctx, {
    id: `${ctx.turnId}-edit`,
    name: "edit_file",
    icon: "edit",
    arg: "src/input/commands.ts",
    ok: true,
    output: "+6 / -0",
    durationMs: 11,
    foot: lx({ zh: "+6 / −0 · 已落盘", en: "+6 / −0 · written" }, ctx.lang),
  });

  tool(ctx, {
    id: `${ctx.turnId}-test2`,
    name: "shell",
    icon: "terminal",
    arg: "bun test tests/commands.test.ts",
    ok: true,
    output: "2 pass, 0 fail",
    durationMs: 1200,
    foot: lx({ zh: "退出码 0 · 漂移守卫全绿", en: "exit 0 · drift guard green" }, ctx.lang),
  });

  const state = world.states.get(ctx.sessionId);
  if (state) {
    ctx.hub.emit(ctx.sessionId, {
      type: "tier.switch",
      from: state.meta.tier,
      to: "deep_reasoning",
      reason: lx(
        { zh: "分类器判定：跨文件语义修改 + 需要解释取舍 → 升档（minimax / MiniMax-M3）", en: "Classifier: cross-file semantic edit + trade-off explanation → escalate (minimax / MiniMax-M3)" },
        ctx.lang,
      ),
      at: now(),
    });
  }

  await streamAssistant(ctx, `${ctx.turnId}-a3`, DEMO.final, "deep_reasoning");
  await emitStats(ctx, startedAt, "deep_reasoning");
}

/** drop-ws 故障：在助手开始输出后断开所有连接，验证前端重连与快照恢复 */
export function maybeDropConnection(hub: Hub, sessionId: string): void {
  const world = hub.world;
  if (!world.faults.has("drop-ws") || world.firedFaults.has("drop-ws")) return;
  world.firedFaults.add("drop-ws");
  setTimeout(() => {
    hub.emit(sessionId, {
      type: "banner",
      blockId: `drop-${now()}`,
      at: now(),
      level: "warn",
      text: "dummy：正在模拟连接中断（3 秒后自动重连）",
    });
    hub.closeAll("fault:drop-ws");
  }, 1_200);
}

export type { SessionEvent };
