
// MY-PI-WEB P0-4 Approval Binding - Task Core
// SARA Standard + P0-4: approval bound to actionHash + inputHash + policyVersion + expiry + single-use
import os from "os";
import path from "path";
import fsp from "fs/promises";
import crypto from "crypto";
import { PathGuard } from "./security/path-guard.js";

export const POLICY_VERSION = "1.0.0";
export const APPROVAL_TTL_MS = 15 * 60 * 1000; // 15 min

export type TaskStatus = "pending" | "running" | "needs_approval" | "completed" | "failed" | "cancelled";

export type Approval = {
  id: string; // single-use approval ID
  command: string;
  args: string[];
  binary: string;
  risk: string;
  reason: string;
  // P0-4 binding
  actionHash: string; // sha256(normalized command+args+binary+targetPath)
  inputHash: string; // sha256(task title+type+session)
  targetPath?: string;
  targetVersion?: string;
  policyVersion: string;
  approverId?: string;
  expiresAt: number;
  used: boolean;
  createdAt: string;
};

export type Attempt = {
  id: string;
  taskId: string;
  startedAt: string;
  env?: string;
  pid?: number;
  exitCode?: number;
  outputHash?: string;
  error?: string;
};

export type Task = {
  id: string;
  sessionId: string;
  principalId?: string;
  title: string;
  description?: string;
  type?: string;
  risk?: string;
  status: TaskStatus;
  result?: any;
  error?: string;
  approval?: Approval;
  revision: number;
  createdAt: string;
  updatedAt: string;
  attempts: Attempt[];
};

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["running", "failed", "cancelled"],
  running: ["needs_approval", "completed", "failed", "cancelled"],
  needs_approval: ["running", "failed", "cancelled"],
  completed: [],
  failed: ["pending"],
  cancelled: ["pending"],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
export function isTerminal(s: TaskStatus): boolean {
  return s === "completed" || s === "failed" || s === "cancelled";
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}
function normalizeAction(a: { command: string; args: string[]; binary: string; targetPath?: string }): string {
  return JSON.stringify({
    command: a.command.trim(),
    args: a.args.map((x) => x.trim()),
    binary: a.binary.trim(),
    target: (a.targetPath || "").trim(),
  });
}
function computeInputHash(t: { title: string; type?: string; sessionId: string }): string {
  return sha256(JSON.stringify({ title: t.title, type: t.type || "", sessionId: t.sessionId }));
}

export class TaskManager {
  private pg: PathGuard;
  private root: string;
  constructor(root: string) {
    this.pg = new PathGuard(root);
    this.root = root;
  }
  async init() {
    await fsp.mkdir(this.root, { recursive: true });
  }

  private taskPath(id: string): string {
    if (id.includes("/") || id.includes("\\") || id.includes("..")) throw new Error("INVALID_TASK_ID");
    const p = path.join(this.root, id + ".json");
    return this.pg.resolveAndValidate(p);
  }
  private async readTask(id: string): Promise<Task> {
    const p = this.taskPath(id);
    const raw = await fsp.readFile(p, "utf-8");
    return JSON.parse(raw) as Task;
  }
  private async writeTask(t: Task): Promise<void> {
    const p = this.taskPath(t.id);
    const tmp = p + ".tmp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    await fsp.writeFile(tmp, JSON.stringify(t, null, 2));
    await fsp.rename(tmp, p);
  }

  async createTask(input: { sessionId: string; title: string; description?: string; type?: string; risk?: string; principalId?: string }): Promise<Task> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const task: Task = {
      id,
      sessionId: input.sessionId,
      principalId: input.principalId,
      title: input.title,
      description: input.description,
      type: input.type,
      risk: input.risk,
      status: "pending",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      attempts: [],
    };
    await this.writeTask(task);
    return task;
  }
  async getTask(id: string, sessionId: string): Promise<Task> {
    const t = await this.readTask(id);
    if (t.sessionId !== sessionId) throw new Error("SESSION_MISMATCH");
    return t;
  }
  async listBySession(sessionId: string): Promise<Task[]> {
    const files = await fsp.readdir(this.root);
    const tasks: Task[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await fsp.readFile(path.join(this.root, f), "utf-8");
        const t = JSON.parse(raw) as Task;
        if (t.sessionId === sessionId) tasks.push(t);
      } catch {}
    }
    return tasks;
  }
  async countBySession(sessionId: string): Promise<Record<TaskStatus, number>> {
    const list = await this.listBySession(sessionId);
    const c: any = { pending: 0, running: 0, needs_approval: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const t of list) c[t.status] = (c[t.status] || 0) + 1;
    return c;
  }
  async updateStatus(id: string, sessionId: string, status: TaskStatus): Promise<Task> {
    const t = await this.getTask(id, sessionId);
    if (!canTransition(t.status, status)) throw new Error(`INVALID_TRANSITION ${t.status}->${status}`);
    t.status = status;
    t.updatedAt = new Date().toISOString();
    t.revision++;
    await this.writeTask(t);
    return t;
  }
  async start(id: string, sessionId: string): Promise<Task> {
    const t = await this.getTask(id, sessionId);
    if (!canTransition(t.status, "running")) throw new Error(`INVALID_TRANSITION ${t.status}->running`);
    const attempt: Attempt = { id: crypto.randomUUID(), taskId: id, startedAt: new Date().toISOString() };
    t.attempts.push(attempt);
    t.status = "running";
    t.updatedAt = new Date().toISOString();
    t.revision++;
    await this.writeTask(t);
    return t;
  }
  async complete(id: string, sessionId: string, result?: any): Promise<Task> {
    const t = await this.getTask(id, sessionId);
    if (!canTransition(t.status, "completed")) throw new Error(`INVALID_TRANSITION ${t.status}->completed`);
    t.status = "completed";
    t.result = result;
    t.updatedAt = new Date().toISOString();
    t.revision++;
    await this.writeTask(t);
    return t;
  }
  async fail(id: string, sessionId: string, err: string): Promise<Task> {
    const t = await this.getTask(id, sessionId);
    t.status = "failed";
    t.error = err;
    t.updatedAt = new Date().toISOString();
    t.revision++;
    await this.writeTask(t);
    return t;
  }
  async cancel(id: string, sessionId: string): Promise<Task> {
    const t = await this.getTask(id, sessionId);
    // allow cancel from running or needs_approval
    if (t.status !== "running" && t.status !== "needs_approval" && !canTransition(t.status, "cancelled")) {
      throw new Error(`INVALID_TRANSITION ${t.status}->cancelled`);
    }
    t.status = "cancelled";
    t.updatedAt = new Date().toISOString();
    t.revision++;
    await this.writeTask(t);
    return t;
  }
  async retry(id: string, sessionId: string): Promise<Task> {
    const t = await this.getTask(id, sessionId);
    if (!canTransition(t.status, "pending")) throw new Error(`INVALID_TRANSITION ${t.status}->pending`);
    t.status = "pending";
    t.error = undefined;
    t.updatedAt = new Date().toISOString();
    t.revision++;
    await this.writeTask(t);
    return t;
  }

  // P0-4: requestApproval with binding
  async requestApproval(
    id: string,
    sessionId: string,
    req: { command: string; args: string[]; binary: string; risk: string; reason: string; targetPath?: string }
  ): Promise<Task> {
    const t = await this.getTask(id, sessionId);
    if (!canTransition(t.status, "needs_approval")) throw new Error(`INVALID_TRANSITION ${t.status}->needs_approval`);
    const actionHash = sha256(normalizeAction({ command: req.command, args: req.args, binary: req.binary, targetPath: req.targetPath }));
    const inputHash = computeInputHash(t);
    const now = Date.now();
    const approval: Approval = {
      id: crypto.randomUUID(),
      command: req.command,
      args: req.args,
      binary: req.binary,
      risk: req.risk,
      reason: req.reason,
      targetPath: req.targetPath,
      actionHash,
      inputHash,
      policyVersion: POLICY_VERSION,
      expiresAt: now + APPROVAL_TTL_MS,
      used: false,
      createdAt: new Date().toISOString(),
    };
    t.approval = approval;
    t.status = "needs_approval";
    t.updatedAt = new Date().toISOString();
    t.revision++;
    await this.writeTask(t);
    return t;
  }

  // P0-4: approve with full binding checks
  async approve(
    id: string,
    sessionId: string,
    approved: boolean,
    approverId?: string,
    currentAction?: { command: string; args: string[]; binary: string; targetPath?: string }
  ): Promise<Task> {
    const t = await this.getTask(id, sessionId);
    if (t.status !== "needs_approval") throw new Error("NOT_NEEDS_APPROVAL");
    const a = t.approval;
    if (!a) throw new Error("NO_APPROVAL");

    // 1. single-use
    if (a.used) throw new Error("APPROVAL_ALREADY_USED");
    // 2. expiry
    if (Date.now() > a.expiresAt) throw new Error("APPROVAL_EXPIRED");
    // 3. policy version
    if (a.policyVersion !== POLICY_VERSION) throw new Error("POLICY_VERSION_MISMATCH");
    // 4. input hash (task changed after approval?)
    const curInputHash = computeInputHash(t);
    if (curInputHash !== a.inputHash) throw new Error("INPUT_HASH_MISMATCH - task input changed after approval");
    // 5. action hash (args tampered?)
    if (currentAction) {
      const curHash = sha256(normalizeAction(currentAction));
      if (curHash !== a.actionHash) throw new Error("ACTION_HASH_MISMATCH - approval bound to original action");
    }

    if (!approved) {
      t.status = "failed";
      t.error = "Denied by user";
      a.used = true;
      a.approverId = approverId;
      t.updatedAt = new Date().toISOString();
      t.revision++;
      await this.writeTask(t);
      return t;
    }

    a.used = true;
    a.approverId = approverId;
    t.status = "running";
    t.updatedAt = new Date().toISOString();
    t.revision++;
    await this.writeTask(t);
    return t;
  }
}
