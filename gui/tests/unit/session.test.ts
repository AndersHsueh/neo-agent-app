import { describe, expect, test } from "vitest";
import type { SessionEvent, SessionState } from "@/protocol";
import { EVENT_FIXTURES, SNAPSHOT_FIXTURE } from "@/protocol";
import { appendOptimisticUser, applyEvent, applyEvents, hydrate } from "@/state/session";

const base = (): SessionState => hydrate(SNAPSHOT_FIXTURE);

describe("hydrate", () => {
  test("快照变成状态，status 与 seq 对齐", () => {
    const state = base();
    expect(state.seq).toBe(7);
    expect(state.blocks).toHaveLength(3);
    expect(state.meta.status).toBe("working");
  });

  test("重连快照保留未落盘的本地乐观消息", () => {
    const optimistic = appendOptimisticUser(base(), {
      id: "local-1",
      clientId: "client-1",
      text: "这条还没被 hub 落盘",
      at: 1,
    });
    const revived = hydrate(SNAPSHOT_FIXTURE, optimistic);
    expect(revived.blocks.some((b) => b.kind === "user" && b.clientId === "client-1")).toBe(true);
  });

  test("快照已经包含同一 clientId 时不重复保留", () => {
    const snapshot = {
      ...SNAPSHOT_FIXTURE,
      blocks: [
        ...SNAPSHOT_FIXTURE.blocks,
        { kind: "user" as const, id: "b-u-2", at: 2, text: "已落盘", clientId: "client-2" },
      ],
    };
    const optimistic = appendOptimisticUser(base(), {
      id: "local-2",
      clientId: "client-2",
      text: "已落盘",
      at: 2,
    });
    const revived = hydrate(snapshot, optimistic);
    expect(
      revived.blocks.filter((b) => b.kind === "user" && b.clientId === "client-2"),
    ).toHaveLength(1);
  });
});

describe("applyEvent", () => {
  test("assistant.delta 合并到同一个 p 段", () => {
    let state = base();
    state = applyEvents(state, [
      { type: "assistant.start", blockId: "a1", at: 1, tier: "balanced" },
      { type: "assistant.delta", blockId: "a1", text: "第一段" },
      { type: "assistant.delta", blockId: "a1", text: "继续" },
    ]);
    const block = state.blocks.find((b) => b.id === "a1");
    expect(block?.kind).toBe("assistant");
    if (block?.kind === "assistant") {
      expect(block.segments[0]).toEqual({ type: "p", text: "第一段继续" });
    }
  });

  test("assistant.end 清掉空段", () => {
    let state = base();
    state = applyEvents(state, [
      { type: "assistant.start", blockId: "a2", at: 1, tier: "balanced" },
      { type: "assistant.end", blockId: "a2" },
    ]);
    const block = state.blocks.find((b) => b.id === "a2");
    if (block?.kind === "assistant") expect(block.segments).toHaveLength(0);
  });

  test("审批请求把会话挂到 waiting，resolve 后回 working", () => {
    let state = base();
    const req = EVENT_FIXTURES.find((e) => e.type === "approval.request") as SessionEvent;
    state = applyEvent(state, req);
    expect(state.pendingApprovalId).toBeDefined();
    expect(state.meta.status).toBe("waiting");
    state = applyEvent(state, {
      type: "approval.resolve",
      blockId: state.pendingApprovalId ?? "",
      state: "allowed",
    });
    expect(state.pendingApprovalId).toBeUndefined();
    expect(state.meta.status).toBe("working");
  });

  test("stats 收口 turn，并记为 lastTurn", () => {
    let state = base();
    state = applyEvents(state, [
      { type: "turn.start", turnId: "t", blockId: "turn-1", n: 3, at: 1 },
      {
        type: "stats",
        blockId: "s1",
        at: 2,
        durationMs: 8400,
        usage: { promptTokens: 1, completionTokens: 2, reasoningTokens: 0, costMicros: 3 },
        toolCalls: 5,
        iterations: 4,
        tier: "deep_reasoning",
      },
    ]);
    expect(state.lastTurn?.durationMs).toBe(8400);
    expect(state.streaming.turnActive).toBe(false);
  });

  test("完整 fixture 事件序列可无异常重放，未知块的事件不炸", () => {
    let state = base();
    for (const event of EVENT_FIXTURES) state = applyEvent(state, event);
    expect(state.blocks.length).toBeGreaterThan(SNAPSHOT_FIXTURE.blocks.length);
  });

  test("事件引用不存在的块时保持原状态", () => {
    const state = base();
    const next = applyEvent(state, { type: "assistant.delta", blockId: "missing", text: "x" });
    expect(next).toBe(state);
  });
});
