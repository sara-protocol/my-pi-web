
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import fsp from "fs/promises";
import { SARAServer } from "./server.js";

describe("PR-2.2 SARA Server", () => {
  let tmpRoot: string;
  let sara: SARAServer;
  let SESS: string;

  beforeEach(async () => {
    tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "sara-server-"));
    SESS = `sess_${Math.random().toString(36).slice(2,8)}_${Date.now().toString().slice(-4)}`;
    sara = new SARAServer(tmpRoot);
    await sara.init();
  });

  afterEach(async () => {
    await fsp.rm(tmpRoot, { recursive: true, force: true });
  });

  it("createAndStart -> running", async () => {
    const task = await sara.createAndStart({ sessionId: SESS, title: "test task" });
    expect(task.status).toBe("running");
    expect(task.sessionId).toBe(SESS);
  });

  it("handleFileTask creates file task", async () => {
    const task = await sara.handleFileTask(SESS, "test.txt", "hello");
    expect(task.type).toBe("file");
    expect(task.title).toContain("test.txt");
  });

  it("handleCommandTask low-risk -> running", async () => {
    const task = await sara.handleCommandTask(SESS, "git", ["status"]);
    expect(task.status).toBe("running");
  });

  it("handleCommandTask high-risk -> needs_approval", async () => {
    const task = await sara.handleCommandTask(SESS, "rm", ["-rf", "/tmp"]);
    expect(task.status).toBe("needs_approval");
    expect(task.approval?.command).toBe("rm");
  });

  it("approve flow", async () => {
    let task = await sara.handleCommandTask(SESS, "rm", ["-rf", "/tmp/x"]);
    expect(task.status).toBe("needs_approval");
    task = await sara.approve(task.id, SESS, true);
    expect(task.status).toBe("running");
    task = await sara.complete(task.id, SESS, { ok: true });
    expect(task.status).toBe("completed");
  });

  it("counts", async () => {
    await sara.createAndStart({ sessionId: SESS, title: "1" });
    await sara.createAndStart({ sessionId: SESS, title: "2" });
    const counts = await sara.counts(SESS);
    expect(counts.running).toBe(2);
  });

  it("list and get", async () => {
    const created = await sara.createAndStart({ sessionId: SESS, title: "list test" });
    const list = await sara.list(SESS);
    expect(list.length).toBe(1);
    const got = await sara.get(created.id, SESS);
    expect(got.id).toBe(created.id);
  });
});
