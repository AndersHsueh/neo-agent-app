import { describe, expect, test } from "vitest";
import {
  decodeClientMessage,
  decodeServerMessage,
  decodeServerText,
  ENVELOPE_FIXTURES,
  INVALID_FIXTURES,
  makeClientMessage,
  PROTOCOL_VERSION,
} from "@/protocol";

describe("server message guards", () => {
  test("每条信封样本都被接受", () => {
    for (const msg of ENVELOPE_FIXTURES) {
      const decoded = decodeServerMessage(msg);
      if (!decoded.ok)
        throw new Error(`rejected ${JSON.stringify(msg).slice(0, 80)}: ${decoded.error.message}`);
      expect(decoded.value.kind).toBe(msg.kind);
    }
  });

  test("坏样本全部被拒，且错误码是 protocol", () => {
    for (const bad of INVALID_FIXTURES) {
      const decoded = decodeServerMessage(bad);
      expect(decoded.ok).toBe(false);
      if (!decoded.ok) expect(decoded.error.code).toBe("protocol");
    }
  });

  test("文本帧解码：合法 JSON / 坏 JSON", () => {
    const ok = decodeServerText(JSON.stringify({ v: 1, kind: "pong" }));
    expect(ok.ok).toBe(true);
    const bad = decodeServerText("{oops");
    expect(bad.ok).toBe(false);
  });
});

describe("client command guards", () => {
  test("envelope 版本与 kind 必须正确", () => {
    const raw = JSON.parse(makeClientMessage("r1", { type: "session.list" }));
    const decoded = decodeClientMessage(raw);
    expect(decoded.ok).toBe(true);
  });

  test("turn.send 必须带 sessionId / text / clientId", () => {
    const base = {
      v: PROTOCOL_VERSION,
      kind: "command",
      id: "r1",
      command: { type: "turn.send", sessionId: "s" },
    };
    expect(decodeClientMessage(base).ok).toBe(false);
  });

  test("未知命令被拒", () => {
    const raw = { v: PROTOCOL_VERSION, kind: "command", id: "r1", command: { type: "rm -rf" } };
    expect(decodeClientMessage(raw).ok).toBe(false);
  });
});
