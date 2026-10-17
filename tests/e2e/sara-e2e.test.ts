import { describe, it, expect, beforeEach } from "vitest";
import os from "os";
import path from "path";
import fsp from "fs/promises";
import { TaskManager } from "../../mcp-server/task-core.js";
import { SSETransport } from "../../mcp-server/transport/sse-transport.js";

describe("PR-2.6 E2E - Full SARA Chain", () => {
  let tmpRoot: string;
  let SESS_A: string;
  let SESS_B: string;

  beforeEach(async () => {
    tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "e2e-"));
    const rand = Math.random().toString(36).slice(2,8);
    SESS_A = `sess_A_${rand}`;
    SESS_B = `sess_B_${rand}`;
  });

  it("E2E: create file task -> running -> complete", async () => {
    const tm = new TaskManager(tmpRoot);
    await tm.init();
    let t = await tm.createTask({ sessionId: SESS_A, title: "write README", type: "file", fileName: "README.md", content: "# hi" } as any);
    expect(t.status).toBe("pending");
    t = await tm.start(t.id, SESS_A);
    expect(t.status).toBe("running");
    t = await tm.complete(t.id, SESS_A, { ok: true });
    expect(t.status).toBe("completed");
  });

  it("E2E: high-risk -> needs_approval -> approve -> completed", async () => {
    const tm = new TaskManager(tmpRoot);
    await tm.init();
    let t = await tm.createTask({ sessionId: SESS_A, title: "git push", type: "command", command: "git", args: ["push"], risk: "high" } as any);
    t = await tm.start(t.id, SESS_A);
    t = await tm.requestApproval(t.id, SESS_A, { command: "git", args: ["push"], binary: "git", risk: "high", reason: "push" });
    expect(t.status).toBe("needs_approval");
    t = await tm.approve(t.id, SESS_A, true);
    expect(t.status).toBe("running");
    t = await tm.complete(t.id, SESS_A, { pushed: true });
    expect(t.status).toBe("completed");
  });

  it("E2E: high-risk -> deny -> failed", async () => {
    const tm = new TaskManager(tmpRoot);
    await tm.init();
    let t = await tm.createTask({ sessionId: SESS_A, title: "rm -rf", type: "command", command: "rm", args: ["-rf","/"], risk: "high" } as any);
    t = await tm.start(t.id, SESS_A);
    t = await tm.requestApproval(t.id, SESS_A, { command: "rm", args: ["-rf","/"], binary: "rm", risk: "high", reason: "dangerous" });
    t = await tm.approve(t.id, SESS_A, false);
    expect(t.status).toBe("failed");
  });

  it("E2E: session isolation", async () => {
    const tm = new TaskManager(tmpRoot);
    await tm.init();
    const t = await tm.createTask({ sessionId: SESS_A, title: "secret" });
    await expect(tm.getTask(t.id, SESS_B)).rejects.toThrow(/SESSION_MISMATCH/);
  });

  it("E2E: counts", async () => {
    const tm = new TaskManager(tmpRoot);
    await tm.init();
    await tm.createTask({ sessionId: SESS_A, title: "pending" });
    let t2 = await tm.createTask({ sessionId: SESS_A, title: "running" });
    t2 = await tm.start(t2.id, SESS_A);
    let t3 = await tm.createTask({ sessionId: SESS_A, title: "done" });
    t3 = await tm.start(t3.id, SESS_A);
    t3 = await tm.complete(t3.id, SESS_A);
    const counts = await tm.countBySession(SESS_A);
    expect(counts.pending).toBe(1);
    expect(counts.running).toBe(1);
    expect(counts.completed).toBe(1);
  });

  it("E2E: SSE transport isolates", async () => {
    const transport = new SSETransport();
    const eventsA: any[] = [];
    const eventsB: any[] = [];
    const unsubA = transport.subscribe(SESS_A, (event) => eventsA.push(event));
    const unsubB = transport.subscribe(SESS_B, (event) => eventsB.push(event));
    transport.taskCreated(SESS_A, { id: "t1" });
    transport.taskCreated(SESS_B, { id: "t2" });
    expect(eventsA.map((event) => event.taskId)).toEqual(["t1"]);
    expect(eventsB.map((event) => event.taskId)).toEqual(["t2"]);
    unsubA();
    unsubB();
  });
});
