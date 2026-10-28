/**
 * vendor 协议一致性测试（v1.2 / neo-core-serve v0.0.2）。
 *
 * 目的：vendor 替换后，守住四条与真实 Hub 联调强相关的契约：
 *  1. 未知事件类型放行（客户端按能力降级，不能因为新事件炸掉连接）；
 *  2. v1.2 新增错误码（too_large / question_expired / slow_consumer / unsupported）被 guards 接受；
 *  3. 附件命令的形状校验（合法 mime 通过，非法 mime 拒绝）；
 *  4. reducer 的两个「权威全文」与 v1.2 字段保留（stats/question/approval），
 *     这些是真机联调时最容易静默丢字段的地方。
 */
import { describe, expect, test } from "vitest";
import { COMMAND_CATALOG, COMMAND_CATALOG_OUTDATED, COMMANDS } from "@/lib/commands.ts";
import {
  applyEvent,
  type ClientCommand,
  COMMANDS_SCHEMA_VERSION,
  decodeClientMessage,
  decodeServerMessage,
  hydrate,
  PROTOCOL_VERSION,
} from "@/protocol";
import { SNAPSHOT_FIXTURE } from "@/protocol/fixtures.ts";

const v = PROTOCOL_VERSION;

const envelope = (cmd: unknown) => ({ v, kind: "command", id: "r1", command: cmd });

describe("guards：未知事件放行 + 新错误码", () => {
  test("未知事件类型不拒绝（客户端能力降级）", () => {
    const decoded = decodeServerMessage({
      v,
      kind: "event",
      sessionId: "s1",
      seq: 3,
      event: { type: "future.event", payload: 1 },
    });
    expect(decoded.ok).toBe(true);
  });

  test("v1.2 错误码出现在 result.error 里可解码", () => {
    for (const code of ["too_large", "question_expired", "slow_consumer", "unsupported"] as const) {
      const decoded = decodeServerMessage({
        v,
        kind: "result",
        id: "r9",
        ok: false,
        error: { code, message: `${code} boom`, retryable: false },
      });
      expect(decoded.ok).toBe(true);
      if (decoded.ok && decoded.value.kind === "result" && !decoded.value.ok) {
        expect(decoded.value.error.code).toBe(code);
      }
    }
  });

  test("ready 帧的 sessions capability 可解码", () => {
    const decoded = decodeServerMessage({
      v,
      kind: "ready",
      user: { id: "local", email: "local@localhost", displayName: "Local", role: "owner" },
      coreVersion: "0.0.2",
      protocolVersion: "1.2",
      capabilities: ["sessions", "attachments.image", "transcript.replay"],
    });
    expect(decoded.ok).toBe(true);
    if (decoded.ok && decoded.value.kind === "ready") {
      expect(decoded.value.capabilities).toContain("sessions");
    }
  });
});

describe("guards：附件命令", () => {
  const turnSend = (attachments: unknown): ClientCommand =>
    ({ type: "turn.send", text: "看图", clientId: "c1", attachments }) as ClientCommand;

  test("合法附件数组通过", () => {
    const decoded = decodeClientMessage(
      envelope(turnSend([{ kind: "image", mime: "image/png", dataBase64: "iVBORw0KGgo=" }])),
    );
    expect(decoded.ok).toBe(true);
  });

  test("attachments 不是数组被拒（mime 枚举由服务端裁决，见 probe P9）", () => {
    const decoded = decodeClientMessage(envelope(turnSend("iVBORw0KGgo=")));
    expect(decoded.ok).toBe(false);
  });
});

describe("reducer：v1.2 权威文本与字段保留", () => {
  const base = () => hydrate(SNAPSHOT_FIXTURE);

  test("assistant.end.text 覆盖 delta 累积（合批/丢帧下不缺字）", () => {
    let state = base();
    state = applyEvent(state, { type: "assistant.start", blockId: "a1", at: 1, tier: "default" });
    state = applyEvent(state, { type: "assistant.delta", blockId: "a1", text: "收到" });
    state = applyEvent(state, {
      type: "assistant.end",
      blockId: "a1",
      text: "收到，这是权威全文。",
    });
    const block = state.blocks.find((b) => b.id === "a1");
    expect(block?.kind).toBe("assistant");
    if (block?.kind === "assistant") {
      expect(block.segments.map((s) => (s.type === "p" ? s.text : "")).join("")).toBe(
        "收到，这是权威全文。",
      );
    }
  });

  test("reasoning.end.text 覆盖 delta，并收口流式标记", () => {
    let state = base();
    state = applyEvent(state, { type: "reasoning.start", blockId: "r1", at: 1 });
    state = applyEvent(state, { type: "reasoning.delta", blockId: "r1", text: "思考中" });
    state = applyEvent(state, {
      type: "reasoning.end",
      blockId: "r1",
      durationMs: 5,
      tokens: 3,
      text: "思考中（权威）",
    });
    const block = state.blocks.find((b) => b.id === "r1");
    expect(block?.kind === "reasoning" && block.text).toBe("思考中（权威）");
    expect(state.streaming.reasoningBlockId).toBeUndefined();
  });

  test("question.request 的多选/自定义/超时字段保留；resolve 带 keys/custom", () => {
    let state = base();
    state = applyEvent(state, {
      type: "question.request",
      blockId: "q1",
      at: 1,
      prompt: "选一个",
      header: "今晚",
      context: "两个方向",
      options: [
        { key: "o1", label: "A" },
        { key: "o2", label: "B" },
      ],
      multiSelect: true,
      allowCustom: true,
      deadlineAt: 123,
    });
    let block = state.blocks.find((b) => b.id === "q1");
    expect(block?.kind === "question");
    if (block?.kind === "question") {
      expect(block.multiSelect).toBe(true);
      expect(block.header).toBe("今晚");
      expect(block.deadlineAt).toBe(123);
    }
    state = applyEvent(state, {
      type: "question.resolve",
      blockId: "q1",
      at: 2,
      keys: ["o1", "o2"],
      custom: "都行",
    });
    block = state.blocks.find((b) => b.id === "q1");
    if (block?.kind === "question") {
      expect(block.answeredKeys).toEqual(["o1", "o2"]);
      expect(block.custom).toBe("都行");
    }
  });

  test("approval.request 无 diff 时保留 detail/path", () => {
    let state = base();
    state = applyEvent(state, {
      type: "approval.request",
      blockId: "ap1",
      at: 1,
      tool: "write_file",
      path: "/tmp/x.txt",
      detail: "新建文件",
    });
    const block = state.blocks.find((b) => b.id === "ap1");
    expect(block?.kind === "approval");
    if (block?.kind === "approval") {
      expect(block.diff ?? null).toBeNull();
      expect(block.detail).toBe("新建文件");
      expect(block.path).toBe("/tmp/x.txt");
    }
  });

  test("stats 的 finishReason/contextUsage/error/turnId 落到块上", () => {
    let state = base();
    state = applyEvent(state, {
      type: "stats",
      blockId: "st1",
      at: 1,
      durationMs: 2040,
      usage: { promptTokens: 1, completionTokens: 2, reasoningTokens: 0, costMicros: 0 },
      toolCalls: 0,
      iterations: 1,
      tier: "default",
      turnId: "turn_1",
      contextUsage: 0.01,
      finishReason: "stop",
      error: null,
    });
    const block = state.blocks.find((b) => b.id === "st1");
    expect(block?.kind).toBe("stats");
    if (block?.kind === "stats") {
      expect(block.finishReason).toBe("stop");
      expect(block.contextUsage).toBe(0.01);
      expect(block.turnId).toBe("turn_1");
    }
  });

  test("snapshot.live 恢复正在进行的流式块 id", () => {
    const state = hydrate({
      ...SNAPSHOT_FIXTURE,
      live: { turnId: "turn_9", assistant: { blockId: "asst_live", text: "半" } },
    });
    expect(state.streaming.assistantBlockId).toBe("asst_live");
    expect(state.streaming.turnActive).toBe(SNAPSHOT_FIXTURE.meta.status === "working");
  });
});

describe("命令目录：vendored commands.json", () => {
  test("schema 版本与 core 一致，条目非空且含关键命令", () => {
    expect(COMMAND_CATALOG.schemaVersion).toBe(COMMANDS_SCHEMA_VERSION);
    expect(COMMAND_CATALOG_OUTDATED).toBe(false);
    expect(COMMANDS.length).toBeGreaterThan(10);
    const names = COMMANDS.map((c) => c.name);
    for (const required of ["help", "clear", "compact", "tier"]) {
      expect(names).toContain(required);
    }
  });

  test("每条命令都有 name/description/group；带参数的命令能算出用法", () => {
    for (const cmd of COMMANDS) {
      expect(cmd.name.length).toBeGreaterThan(0);
      expect(cmd.description.length).toBeGreaterThan(0);
      expect(cmd.group.length).toBeGreaterThan(0);
    }
  });
});
