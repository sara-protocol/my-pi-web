
import { describe, it, expect, beforeEach } from "vitest";
import { SSETransport } from "../transport/sse-transport.js";
import { SessionManager } from "../transport/session-manager.js";
import { handleSSEConnect, handleSSEBroadcast } from "./sse.js";

describe("PR-2.4 SSE Transport - SARA", () => {
  let sse: SSETransport;
  let sessions: SessionManager;
  let SESS_A: string;
  let SESS_B: string;

  beforeEach(() => {
    sse = new SSETransport();
    sessions = new SessionManager();
    SESS_A = `sess_A_${Math.random().toString(36).slice(2,6)}`;
    SESS_B = `sess_B_${Math.random().toString(36).slice(2,6)}`;
    sessions.create(SESS_A);
    sessions.create(SESS_B);
  });

  it("subscribe receives task_created", () => {
    const events: any[] = [];
    sse.subscribe(SESS_A, (e) => events.push(e));
    sse.taskCreated(SESS_A, { id: "t1", title: "hi" });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("task_created");
    expect(events[0].sessionId).toBe(SESS_A);
  });

  it("isolate sessions - B does not get A events", () => {
    const eventsA: any[] = [];
    const eventsB: any[] = [];
    sse.subscribe(SESS_A, (e) => eventsA.push(e));
    sse.subscribe(SESS_B, (e) => eventsB.push(e));
    sse.taskCreated(SESS_A, { id: "t1" });
    expect(eventsA.length).toBe(1);
    expect(eventsB.length).toBe(0);
  });

  it("unsubscribe stops receiving", () => {
    const events: any[] = [];
    const unsub = sse.subscribe(SESS_A, (e) => events.push(e));
    sse.taskCreated(SESS_A, { id: "t1" });
    unsub();
    sse.taskCreated(SESS_A, { id: "t2" });
    expect(events.length).toBe(1);
  });

  it("formatSSE produces valid SSE wire", () => {
    const ev = { type: "task_created" as const, sessionId: SESS_A, taskId: "t1", data: { id: "t1" }, timestamp: 123 };
    const wire = sse.formatSSE(ev);
    expect(wire.startsWith("event: task_created\n")).toBe(true);
    expect(wire.includes("data: ")).toBe(true);
    expect(wire.endsWith("\n\n")).toBe(true);
  });

  it("needs_approval event", () => {
    const events: any[] = [];
    sse.subscribe(SESS_A, (e) => events.push(e));
    sse.needsApproval(SESS_A, { id: "t1", status: "needs_approval" });
    expect(events[0].type).toBe("needs_approval");
  });

  it("listenerCount tracks", () => {
    expect(sse.listenerCount(SESS_A)).toBe(0);
    const u1 = sse.subscribe(SESS_A, () => {});
    const u2 = sse.subscribe(SESS_A, () => {});
    expect(sse.listenerCount(SESS_A)).toBe(2);
    expect(sse.listenerCount()).toBe(2);
    u1();
    expect(sse.listenerCount(SESS_A)).toBe(1);
    u2();
    expect(sse.listenerCount(SESS_A)).toBe(0);
  });

  it("handleSSEConnect 200 with subscribe", async () => {
    const res = await handleSSEConnect({ sessions, sse }, { sessionId: SESS_A });
    expect(res.status).toBe(200);
    expect(res.headers!["Content-Type"]).toBe("text/event-stream");
    expect(typeof res.subscribe).toBe("function");
  });

  it("handleSSEConnect 401 when invalid session", async () => {
    const res = await handleSSEConnect({ sessions, sse }, { sessionId: "invalid_xyz" });
    expect(res.status).toBe(401);
  });

  it("handleSSEConnect 400 when missing session", async () => {
    const res = await handleSSEConnect({ sessions, sse }, { sessionId: "" } as any);
    expect(res.status).toBe(400);
  });

  it("handleSSEConnect subscribe receives events + heartbeat", async () => {
    const res = await handleSSEConnect({ sessions, sse }, { sessionId: SESS_A });
    const chunks: string[] = [];
    const unsub = res.subscribe!((c) => chunks.push(c));
    // heartbeat sent immediately
    expect(chunks.length).toBe(1);
    expect(chunks[0].includes("heartbeat")).toBe(true);
    // emit task
    sse.taskCreated(SESS_A, { id: "t1" });
    expect(chunks.length).toBe(2);
    expect(chunks[1].includes("task_created")).toBe(true);
    unsub();
  });

  it("handleSSEBroadcast emits", () => {
    const events: any[] = [];
    sse.subscribe(SESS_A, (e) => events.push(e));
    const res = handleSSEBroadcast({ sessions, sse }, { sessionId: SESS_A, type: "task_created", task: { id: "t1" } });
    expect(res.status).toBe(200);
    expect(events.length).toBe(1);
  });

  it("handleSSEBroadcast 401 for invalid session", () => {
    const res = handleSSEBroadcast({ sessions, sse }, { sessionId: "invalid_sess_xyz", type: "task_created", task: { id: "t1" } });
    expect(res.status).toBe(401);
  });

  it("no leak - global listener separate from session", () => {
    const globalEvents: any[] = [];
    const sessEvents: any[] = [];
    sse.subscribeAll((e) => globalEvents.push(e));
    sse.subscribe(SESS_A, (e) => sessEvents.push(e));
    sse.taskCreated(SESS_A, { id: "t1" });
    expect(globalEvents.length).toBe(1);
    expect(sessEvents.length).toBe(1);
    sse.taskCreated(SESS_B, { id: "t2" });
    expect(globalEvents.length).toBe(2);
    expect(sessEvents.length).toBe(1); // A does not get B
  });
});
