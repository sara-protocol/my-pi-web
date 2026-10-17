
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import fsp from "fs/promises";
import { TaskManager, canTransition, isTerminal } from "../task-core.js";

describe("PR-2.1 Task Core - SARA Standard", () => {
  let tmpRoot: string;
  let tm: TaskManager;
  let SESS_A: string;
  let SESS_B: string;

  beforeEach(async () => {
    tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "task-core-"));
    const rand = Math.random().toString(36).slice(2,8) + "_" + Date.now().toString().slice(-4);
    SESS_A = `sess_A_${rand}`;
    SESS_B = `sess_B_${rand}`;
    tm = new TaskManager(tmpRoot);
    await tm.init();
  });

  afterEach(async () => {
    await fsp.rm(tmpRoot, { recursive: true, force: true });
  });

  describe("State Machine - Must Pass", () => {
    it("ALLOW pending->running->completed", () => {
      expect(canTransition('pending','running')).toBe(true);
      expect(canTransition('running','completed')).toBe(true);
    });
    it("ALLOW running->needs_approval->running", () => {
      expect(canTransition('running','needs_approval')).toBe(true);
      expect(canTransition('needs_approval','running')).toBe(true);
    });
    it("DENY completed->running (terminal)", () => {
      expect(canTransition('completed','running')).toBe(false);
      expect(isTerminal('completed')).toBe(true);
    });
    it("DENY pending->completed (must go via running)", () => {
      expect(canTransition('pending','completed')).toBe(false);
    });
    it("ALLOW failed->pending (retry)", () => {
      expect(canTransition('failed','pending')).toBe(true);
    });
    it("ALLOW cancelled->pending (retry)", () => {
      expect(canTransition('cancelled','pending')).toBe(true);
    });
  });

  describe("Session Isolation - Must Pass", () => {
    it("isolate tasks by sessionId", async () => {
      const t1 = await tm.createTask({ sessionId: SESS_A, title: "A task" });
      const t2 = await tm.createTask({ sessionId: SESS_B, title: "B task" });
      const listA = await tm.listBySession(SESS_A);
      const listB = await tm.listBySession(SESS_B);
      expect(listA.length).toBe(1);
      expect(listB.length).toBe(1);
      expect(listA[0].id).toBe(t1.id);
      expect(listB[0].id).toBe(t2.id);
    });
    it("REJECT get task with wrong session", async () => {
      const t = await tm.createTask({ sessionId: SESS_A, title: "secret" });
      await expect(tm.getTask(t.id, SESS_B)).rejects.toThrow(/SESSION_MISMATCH/);
    });
    it("REJECT update status with wrong session", async () => {
      const t = await tm.createTask({ sessionId: SESS_A, title: "secret" });
      await expect(tm.updateStatus(t.id, SESS_B, 'running')).rejects.toThrow(/SESSION_MISMATCH/);
    });
  });

  describe("Persistence & Path Guard", () => {
    it("persist task to file and reload", async () => {
      const t = await tm.createTask({ sessionId: SESS_A, title: "persist" });
      const loaded = await tm.getTask(t.id, SESS_A);
      expect(loaded.title).toBe("persist");
      expect(loaded.status).toBe("pending");
    });
    it("REJECT path traversal in task id", async () => {
      // @ts-ignore
      await expect(tm.getTask("../../etc/passwd", SESS_A)).rejects.toThrow();
      await expect(tm.getTask("a/b", SESS_A)).rejects.toThrow();
    });
  });

  describe("Lifecycle", () => {
    it("full lifecycle pending->running->completed", async () => {
      let t = await tm.createTask({ sessionId: SESS_A, title: "lifecycle" });
      expect(t.status).toBe("pending");
      t = await tm.start(t.id, SESS_A);
      expect(t.status).toBe("running");
      t = await tm.complete(t.id, SESS_A, { ok: true });
      expect(t.status).toBe("completed");
      expect(t.result).toEqual({ ok: true });
    });
    it("needs_approval flow", async () => {
      let t = await tm.createTask({ sessionId: SESS_A, title: "approval", type: "command", risk: "high" });
      t = await tm.start(t.id, SESS_A);
      t = await tm.requestApproval(t.id, SESS_A, { command: "git", args: ["status"], binary: "git", risk: "medium", reason: "check status" });
      expect(t.status).toBe("needs_approval");
      expect(t.approval).toBeDefined();
      expect(t.approval?.command).toBe("git");
      expect(t.approval?.args).toEqual(["status"]);
      const reloaded = await tm.getTask(t.id, SESS_A);
      expect(reloaded.approval?.command).toBe("git");
      t = await tm.approve(t.id, SESS_A, true);
      expect(t.status).toBe("running");
      t = await tm.complete(t.id, SESS_A);
      expect(t.status).toBe("completed");
    });
    it("deny approval -> failed", async () => {
      let t = await tm.createTask({ sessionId: SESS_A, title: "deny" });
      t = await tm.start(t.id, SESS_A);
      t = await tm.requestApproval(t.id, SESS_A, { command: "rm", args: ["-rf","/"], binary: "rm", risk: "high", reason: "dangerous" });
      t = await tm.approve(t.id, SESS_A, false);
      expect(t.status).toBe("failed");
      expect(t.error).toBe("Denied by user");
    });
    it("cancel running task", async () => {
      let t = await tm.createTask({ sessionId: SESS_A, title: "cancel" });
      t = await tm.start(t.id, SESS_A);
      t = await tm.cancel(t.id, SESS_A);
      expect(t.status).toBe("cancelled");
    });
    it("retry failed -> pending", async () => {
      let t = await tm.createTask({ sessionId: SESS_A, title: "retry" });
      t = await tm.start(t.id, SESS_A);
      t = await tm.fail(t.id, SESS_A, "error");
      expect(t.status).toBe("failed");
      t = await tm.retry(t.id, SESS_A);
      expect(t.status).toBe("pending");
    });
  });

  describe("Counts", () => {
    it("count by status", async () => {
      const before = await tm.listBySession(SESS_A);
      expect(before.length).toBe(0);
      await tm.createTask({ sessionId: SESS_A, title: "1" });
      let t2 = await tm.createTask({ sessionId: SESS_A, title: "2" });
      t2 = await tm.start(t2.id, SESS_A);
      let t3 = await tm.createTask({ sessionId: SESS_A, title: "3" });
      t3 = await tm.start(t3.id, SESS_A);
      t3 = await tm.complete(t3.id, SESS_A);
      const counts = await tm.countBySession(SESS_A);
      expect(counts.pending).toBe(1);
      expect(counts.running).toBe(1);
      expect(counts.completed).toBe(1);
      expect(counts.failed).toBe(0);
    });
  });
});
