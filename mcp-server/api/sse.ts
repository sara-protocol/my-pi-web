
import { SessionManager } from "../transport/session-manager.js";
import { SSETransport, SSEEvent } from "../transport/sse-transport.js";

export interface SSEContext {
  sessions: SessionManager;
  sse: SSETransport;
}

export type SSEResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: any;
  // for streaming, caller will use subscribe
  subscribe?: (onEvent: (chunk: string) => void) => () => void;
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

export async function handleSSEConnect(ctx: SSEContext, req: { sessionId?: string }): Promise<SSEResponse> {
  let sessionId: string;
  try {
    sessionId = requireSession(req.sessionId);
  } catch (e: any) {
    return { status: 400, body: { error: e.message } };
  }

  if (!ctx.sessions.get(sessionId)) {
    return { status: 401, body: { error: "Invalid session" } };
  }

  // Return a handle that lets HTTP layer subscribe
  return {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
    subscribe: (onEvent: (chunk: string) => void) => {
      const unsub = ctx.sse.subscribe(sessionId, (ev: SSEEvent) => {
        // Double-check session still valid at emit time (defense in depth)
        if (ev.sessionId !== sessionId) return;
        const chunk = ctx.sse.formatSSE(ev);
        onEvent(chunk);
      });
      // Send initial heartbeat
      onEvent(`event: heartbeat\ndata: {"sessionId":"${sessionId}","ts":${Date.now()}}\n\n`);
      return unsub;
    }
  };
}

export function handleSSEBroadcast(ctx: SSEContext, req: { sessionId?: string; type?: any; task?: any }): SSEResponse {
  let sessionId: string;
  try {
    sessionId = requireSession(req.sessionId!);
  } catch (e: any) {
    return { status: e.status || 400, body: { error: e.message } };
  }
  if (!ctx.sessions.get(sessionId)) {
    return { status: 401, body: { error: "Invalid session" } };
  }
  const { type, task } = req;
  switch (type) {
    case "task_created": ctx.sse.taskCreated(sessionId, task); break;
    case "task_updated": ctx.sse.taskUpdated(sessionId, task); break;
    case "needs_approval": ctx.sse.needsApproval(sessionId, task); break;
    case "task_completed": ctx.sse.taskCompleted(sessionId, task); break;
    case "task_failed": ctx.sse.taskFailed(sessionId, task); break;
    default: ctx.sse.emit(sessionId, type, task?.id, task);
  }
  return { status: 200, body: { ok: true } };
}
