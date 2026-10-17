import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import fsp from "fs/promises";
import { TaskManager, POLICY_VERSION } from "../task-core.js";

describe("P0-4 Approval Binding - Must Pass", () => {
  let tm: TaskManager;
  let tmpRoot: string;
  const SESS = "sess_p04_" + Math.random().toString(36).slice(2,6);

  beforeEach(async () => {
    tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "p04-"));
    tm = new TaskManager(tmpRoot);
    await tm.init();
  });
  afterEach(async () => {
    await fsp.rm(tmpRoot, { recursive: true, force: true });
  });

  it("approval has actionHash + inputHash + policyVersion + expiresAt + used + id", async () => {
    let t = await tm.createTask({ sessionId: SESS, title: "approval binding" });
    t = await tm.start(t.id, SESS);
    t = await tm.requestApproval(t.id, SESS, { command: "git", args: ["status"], binary: "git", risk: "medium", reason: "check" });
    expect(t.approval).toBeDefined();
    expect(t.approval!.actionHash).toMatch(/^[a-f0-9]{16}$/);
    expect(t.approval!.inputHash).toMatch(/^[a-f0-9]{16}$/);
    expect(t.approval!.policyVersion).toBe(POLICY_VERSION);
    expect(t.approval!.expiresAt).toBeGreaterThan(Date.now());
    expect(t.approval!.used).toBe(false);
    expect(t.approval!.id).toBeDefined();
    expect(t.approval!.createdAt).toBeDefined();
  });

  it("DENY reuse approval twice (single-use)", async () => {
    let t = await tm.createTask({ sessionId: SESS, title: "reuse" });
    t = await tm.start(t.id, SESS);
    t = await tm.requestApproval(t.id, SESS, { command: "git", args: ["status"], binary: "git", risk: "medium", reason: "check" });
    t = await tm.approve(t.id, SESS, true, "alice");
    expect(t.approval!.used).toBe(true);
    await expect(tm.approve(t.id, SESS, true, "alice")).rejects.toThrow(/NOT_NEEDS_APPROVAL|ALREADY_USED/);
  });

  it("DENY when action changed after approval - ACTION_HASH_MISMATCH", async () => {
    let t = await tm.createTask({ sessionId: SESS, title: "changed" });
    t = await tm.start(t.id, SESS);
    t = await tm.requestApproval(t.id, SESS, { command: "git", args: ["status"], binary: "git", risk: "medium", reason: "check" });
    await expect(
      tm.approve(t.id, SESS, true, "alice", { command: "git", args: ["rm -rf /"], binary: "git" })
    ).rejects.toThrow(/ACTION_HASH_MISMATCH/);
  });

  it("DENY expired approval", async () => {
    let t = await tm.createTask({ sessionId: SESS, title: "expire" });
    t = await tm.start(t.id, SESS);
    t = await tm.requestApproval(t.id, SESS, { command: "git", args: ["status"], binary: "git", risk: "medium", reason: "check" });
    const raw = JSON.parse(await fsp.readFile(path.join(tmpRoot, t.id + ".json"), "utf-8"));
    raw.approval.expiresAt = Date.now() - 1000;
    await fsp.writeFile(path.join(tmpRoot, t.id + ".json"), JSON.stringify(raw));
    await expect(tm.approve(t.id, SESS, true)).rejects.toThrow(/EXPIRED/);
  });

  it("DENY when task input changed after approval - INPUT_HASH_MISMATCH", async () => {
    let t = await tm.createTask({ sessionId: SESS, title: "original title" });
    t = await tm.start(t.id, SESS);
    t = await tm.requestApproval(t.id, SESS, { command: "git", args: ["status"], binary: "git", risk: "medium", reason: "check" });
    const raw = JSON.parse(await fsp.readFile(path.join(tmpRoot, t.id + ".json"), "utf-8"));
    raw.title = "tampered title";
    await fsp.writeFile(path.join(tmpRoot, t.id + ".json"), JSON.stringify(raw));
    await expect(tm.approve(t.id, SESS, true)).rejects.toThrow(/INPUT_HASH_MISMATCH/);
  });

  it("DENY policy version mismatch", async () => {
    let t = await tm.createTask({ sessionId: SESS, title: "policy" });
    t = await tm.start(t.id, SESS);
    t = await tm.requestApproval(t.id, SESS, { command: "git", args: ["status"], binary: "git", risk: "medium", reason: "check" });
    const raw = JSON.parse(await fsp.readFile(path.join(tmpRoot, t.id + ".json"), "utf-8"));
    raw.approval.policyVersion = "0.0.0";
    await fsp.writeFile(path.join(tmpRoot, t.id + ".json"), JSON.stringify(raw));
    await expect(tm.approve(t.id, SESS, true)).rejects.toThrow(/POLICY_VERSION_MISMATCH/);
  });

  it("allow valid approval with approverId binding", async () => {
    let t = await tm.createTask({ sessionId: SESS, title: "valid" });
    t = await tm.start(t.id, SESS);
    t = await tm.requestApproval(t.id, SESS, { command: "git", args: ["status"], binary: "git", risk: "medium", reason: "check" });
    t = await tm.approve(t.id, SESS, true, "bob", { command: "git", args: ["status"], binary: "git" });
    expect(t.status).toBe("running");
    expect(t.approval!.approverId).toBe("bob");
    expect(t.approval!.used).toBe(true);
  });
});
