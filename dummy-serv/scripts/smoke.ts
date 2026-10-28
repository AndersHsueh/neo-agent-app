export {};
/** dummy-serv 冒烟：登录 → attach → 跑一轮（答题 + 审批）→ 收到 stats。 */
const BASE = process.env["NEO_DUMMY_URL"] ?? "http://127.0.0.1:5292";
const WS = BASE.replace("http:", "ws:");

const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
console.log("health", health);

const grant = (await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "neo@local", password: "neo" }),
}).then((r) => r.json())) as { token: string; user: { id: string } };
console.log("login", grant.user.id, grant.token.slice(0, 6));

const ws = new WebSocket(`${WS}/ws?lang=zh`, ["neo.v1", `bearer.${grant.token}`]);
const events: { type: string; seq?: number }[] = [];
let sessionId = "";
let done = false;

const send = (id: string, command: unknown) =>
  ws.send(JSON.stringify({ v: 1, kind: "command", id, command }));

const timeout = setTimeout(() => {
  console.error("TIMEOUT", events.slice(-8));
  process.exit(1);
}, 30_000);

ws.addEventListener("open", () => console.log("ws open"));
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.kind === "ready") {
    send("1", { type: "session.list" });
  } else if (msg.kind === "sessions") {
    sessionId = msg.sessions[0].id;
    console.log("sessions", msg.sessions.map((s: { id: string }) => s.id));
    send("2", { type: "session.attach", sessionId });
  } else if (msg.kind === "snapshot") {
    console.log("snapshot blocks", msg.snapshot.blocks.length, "seq", msg.snapshot.seq);
    send("3", { type: "turn.send", sessionId, clientId: "smoke-1", text: "先定位，别急着改。" });
  } else if (msg.kind === "event") {
    events.push({ type: msg.event.type, seq: msg.seq });
    if (msg.event.type === "question.request") {
      send("4", { type: "question.answer", sessionId, blockId: msg.event.blockId, key: "1" });
    }
    if (msg.event.type === "approval.request") {
      send("5", { type: "approval.resolve", sessionId, blockId: msg.event.blockId, decision: "allow" });
    }
    if (msg.event.type === "stats" && !done) {
      done = true;
      setTimeout(() => {
        const counts = events.reduce<Record<string, number>>((acc, e) => {
          acc[e.type] = (acc[e.type] ?? 0) + 1;
          return acc;
        }, {});
        console.log("event counts", counts);
        console.log("seq monotonic", events.every((e, i) => i === 0 || (e.seq ?? 0) > (events[i - 1]?.seq ?? 0)));
        clearTimeout(timeout);
        ws.close();
        process.exit(0);
      }, 500);
    }
  }
});
ws.addEventListener("error", (e) => {
  console.error("ws error", e);
  process.exit(1);
});
