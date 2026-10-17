
import { SARAServer } from "../sara/server.js";
import { SessionManager } from "../transport/session-manager.js";

export interface ApiContext {
  sara: SARAServer;
  sessions: SessionManager;
}

export type ApiResponse = {
  status: number;
  body: any;
};

function requireSession(sessionId: any): string {
  if (!sessionId || typeof sessionId !== "string" || sessionId.trim() === "") {
    throw Object.assign(new Error("SESSION_REQUIRED"), { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(sessionId)) {
    throw Object.assign(new Error("INVALID_SESSION"), { status: 400 });
  }
  return sessionId;
}

export async function handleCreateTask(ctx: ApiContext, req: { sessionId?: string; title?: string; type?: string; fileName?: string; content?: string; command?: string; args?: string[] }): Promise<ApiResponse> {
  const sessionId = requireSession(req.sessionId);
  // validate session exists
  if (!ctx.sessions.get(sessionId)) {
    return { status: 401, body: { error: "Invalid session" } };
  }
  if (!req.title && !req.fileName && !req.command) {
    return { status: 400, body: { error: "TITLE_REQUIRED" } };
  }

  try {
    let task;
    if (req.fileName) {
      task = await ctx.sara.handleFileTask(sessionId, req.fileName, req.content || "");
    } else if (req.command) {
      task = await ctx.sara.handleCommandTask(sessionId, req.command, req.args || []);
    } else {
      task = await ctx.sara.createAndStart({ sessionId, title: req.title!, type: (req.type as any) || "general" });
    }
    return { status: 201, body: task };
  } catch (e: any) {
    if (e.message?.includes("SESSION_MISMATCH")) {
      return { status: 403, body: { error: "SESSION_MISMATCH" } };
    }
    return { status: 500, body: { error: e.message } };
  }
}

export async function handleGetTask(ctx: ApiContext, req: { sessionId?: string; id?: string }): Promise<ApiResponse> {
  const sessionId = requireSession(req.sessionId);
  if (!req.id) return { status: 400, body: { error: "ID_REQUIRED" } };
  if (!ctx.sessions.get(sessionId)) {
    return { status: 401, body: { error: "Invalid session" } };
  }
  try {
    const task = await ctx.sara.get(req.id, sessionId);
    return { status: 200, body: task };
  } catch (e: any) {
    if (e.message?.includes("not found") || e.message?.includes("TASK_NOT_FOUND")) {
      return { status: 404, body: { error: "Task not found" } };
    }
    if (e.message?.includes("SESSION_MISMATCH")) {
      return { status: 403, body: { error: "SESSION_MISMATCH" } };
    }
    return { status: 500, body: { error: e.message } };
  }
}

export async function handleListTasks(ctx: ApiContext, req: { sessionId?: string }): Promise<ApiResponse> {
  const sessionId = requireSession(req.sessionId);
  if (!ctx.sessions.get(sessionId)) {
    return { status: 401, body: { error: "Invalid session" } };
  }
  const list = await ctx.sara.list(sessionId);
  return { status: 200, body: list };
}

export async function handleApproveTask(ctx: ApiContext, req: { sessionId?: string; id?: string; approved?: boolean }): Promise<ApiResponse> {
  const sessionId = requireSession(req.sessionId);
  if (!req.id) return { status: 400, body: { error: "ID_REQUIRED" } };
  if (typeof req.approved !== "boolean") return { status: 400, body: { error: "APPROVED_REQUIRED" } };
  if (!ctx.sessions.get(sessionId)) {
    return { status: 401, body: { error: "Invalid session" } };
  }
  try {
    const task = await ctx.sara.approve(req.id, sessionId, req.approved);
    return { status: 200, body: task };
  } catch (e: any) {
    if (e.message?.includes("SESSION_MISMATCH")) return { status: 403, body: { error: "SESSION_MISMATCH" } };
    if (e.message?.includes("not found")) return { status: 404, body: { error: "Task not found" } };
    return { status: 500, body: { error: e.message } };
  }
}

export async function handleCompleteTask(ctx: ApiContext, req: { sessionId?: string; id?: string; result?: any }): Promise<ApiResponse> {
  const sessionId = requireSession(req.sessionId);
  if (!req.id) return { status: 400, body: { error: "ID_REQUIRED" } };
  if (!ctx.sessions.get(sessionId)) {
    return { status: 401, body: { error: "Invalid session" } };
  }
  try {
    const task = await ctx.sara.complete(req.id, sessionId, req.result);
    return { status: 200, body: task };
  } catch (e: any) {
    return { status: 500, body: { error: e.message } };
  }
}

export async function handleCounts(ctx: ApiContext, req: { sessionId?: string }): Promise<ApiResponse> {
  const sessionId = requireSession(req.sessionId);
  if (!ctx.sessions.get(sessionId)) {
    return { status: 401, body: { error: "Invalid session" } };
  }
  const counts = await ctx.sara.counts(sessionId);
  return { status: 200, body: counts };
}
