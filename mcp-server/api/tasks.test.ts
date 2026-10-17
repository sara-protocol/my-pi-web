
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import fsp from "fs/promises";
import { SARAServer } from "../sara/server.js";
import { SessionManager } from "../transport/session-manager.js";
import { handleCreateTask, handleGetTask, handleListTasks, handleApproveTask, handleCompleteTask, handleCounts } from "./tasks.js";

describe("PR-2.3 API Layer - Tasks", () => {
  let tmpRoot: string;
  let sara: SARAServer;
  let sessions: SessionManager;
  let SESS: string;
  let ctx: any;

  beforeEach(async () => {
    tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "api-layer-"));
    SESS = `sess_${Math.random().toString(36).slice(2,8)}`;
    sara = new SARAServer(tmpRoot);
    await sara.init();
    sessions = new SessionManager();
    sessions.create(SESS);
    ctx = { sara, sessions };
  });

  afterEach(async () => {
    await fsp.rm(tmpRoot, { recursive: true, force: true });
  });

  it("POST /api/tasks -> 201 running", async () => {
    const res = await handleCreateTask(ctx, { sessionId: SESS, title: "api test" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("running");
    expect(res.body.sessionId).toBe(SESS);
  });

  it("POST file task -> 201", async () => {
    const res = await handleCreateTask(ctx, { sessionId: SESS, fileName: "a.txt", content: "hi" });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("file");
  });

  it("POST command low-risk -> 201", async () => {
    const res = await handleCreateTask(ctx, { sessionId: SESS, command: "git", args: ["status"] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("running");
  });

  it("POST command high-risk -> needs_approval", async () => {
    const res = await handleCreateTask(ctx, { sessionId: SESS, command: "rm", args: ["-rf", "/tmp"] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("needs_approval");
  });

  it("GET /api/tasks/:id -> 200", async () => {
    const created = await handleCreateTask(ctx, { sessionId: SESS, title: "get test" });
    const id = created.body.id;
    const got = await handleGetTask(ctx, { sessionId: SESS, id });
    expect(got.status).toBe(200);
    expect(got.body.id).toBe(id);
  });

  it("GET with wrong session -> 403", async () => {
    const created = await handleCreateTask(ctx, { sessionId: SESS, title: "secret" });
    const other = `other_${Math.random().toString(36).slice(2,4)}`;
    sessions.create(other);
    const got = await handleGetTask(ctx, { sessionId: other, id: created.body.id });
    expect(got.status).toBe(403);
    expect(got.body.error).toBe("SESSION_MISMATCH");
  });

  it("GET list -> isolates by session", async () => {
    await handleCreateTask(ctx, { sessionId: SESS, title: "1" });
    await handleCreateTask(ctx, { sessionId: SESS, title: "2" });
    const list = await handleListTasks(ctx, { sessionId: SESS });
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(2);
  });

  it("POST /approve -> running", async () => {
    const created = await handleCreateTask(ctx, { sessionId: SESS, command: "rm", args: ["-rf", "/tmp/x"] });
    expect(created.body.status).toBe("needs_approval");
    const approved = await handleApproveTask(ctx, { sessionId: SESS, id: created.body.id, approved: true });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("running");
  });

  it("POST /complete -> completed", async () => {
    const created = await handleCreateTask(ctx, { sessionId: SESS, title: "complete me" });
    const done = await handleCompleteTask(ctx, { sessionId: SESS, id: created.body.id, result: { ok: true } });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("completed");
  });

  it("GET /counts -> running 1", async () => {
    await handleCreateTask(ctx, { sessionId: SESS, title: "count" });
    const counts = await handleCounts(ctx, { sessionId: SESS });
    expect(counts.status).toBe(200);
    expect(counts.body.running).toBe(1);
  });

  it("401 when session invalid", async () => {
    const res = await handleCreateTask(ctx, { sessionId: "invalid_sess_xyz", title: "fail" });
    expect(res.status).toBe(401);
  });

  it("400 when session missing", async () => {
    try {
      await handleCreateTask(ctx, { title: "no sess" } as any);
      expect.fail("should throw");
    } catch (e: any) {
      expect(e.message).toBe("SESSION_REQUIRED");
    }
  });
});
