
export type TaskStatus = "pending" | "running" | "needs_approval" | "completed" | "failed" | "cancelled";

export interface Task {
  id: string;
  sessionId: string;
  title: string;
  status: TaskStatus;
  type?: "file" | "command" | "generic";
  approval?: { command: string; args: string[]; binary: string; risk: string; reason: string };
  result?: any;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateTaskReq {
  sessionId: string;
  title: string;
  fileName?: string;
  content?: string;
  command?: string;
  args?: string[];
}

const BASE = "/api";

function getSessionId(): string {
  // Read from localStorage or cookie; fallback to prompt
  if (typeof window !== "undefined") {
    return localStorage.getItem("sara_session_id") || "";
  }
  return "";
}

async function request(path: string, opts: RequestInit = {}) {
  const sessionId = getSessionId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as any),
  };
  if (sessionId) headers["x-session-id"] = sessionId;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const tasksApi = {
  list: (sessionId: string) => request(`/tasks?sessionId=${encodeURIComponent(sessionId)}`),
  get: (id: string, sessionId: string) => request(`/tasks/${id}?sessionId=${encodeURIComponent(sessionId)}`),
  create: (data: CreateTaskReq) => request("/tasks", { method: "POST", body: JSON.stringify(data) }),
  approve: (id: string, sessionId: string, approved: boolean) =>
    request(`/tasks/${id}/approve`, { method: "POST", body: JSON.stringify({ sessionId, approved }) }),
  complete: (id: string, sessionId: string, result?: any) =>
    request(`/tasks/${id}/complete`, { method: "POST", body: JSON.stringify({ sessionId, result }) }),
  counts: (sessionId: string) => request(`/tasks/counts?sessionId=${encodeURIComponent(sessionId)}`),
};

export const sseApi = {
  connect: (sessionId: string, onEvent: (e: any) => void): (() => void) => {
    const url = `${BASE}/tasks/stream?sessionId=${encodeURIComponent(sessionId)}`;
    const es = new EventSource(url);
    const types = ["task_created","task_updated","needs_approval","task_completed","task_failed","heartbeat"];
    const handlers: Array<() => void> = [];
    for (const t of types) {
      const handler = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data);
          onEvent({ ...data, type: t });
        } catch {}
      };
      es.addEventListener(t, handler as any);
      handlers.push(() => es.removeEventListener(t, handler as any));
    }
    // fallback: generic message
    es.onmessage = (ev) => {
      try { onEvent(JSON.parse(ev.data)); } catch {}
    };
    return () => {
      handlers.forEach(fn => fn());
      es.close();
    };
  }
};
