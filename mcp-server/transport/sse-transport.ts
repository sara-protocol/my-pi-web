
export type SSEEventType = "task_created" | "task_updated" | "task_completed" | "task_failed" | "needs_approval" | "heartbeat";

export interface SSEEvent {
  type: SSEEventType;
  sessionId: string;
  taskId?: string;
  data?: any;
  timestamp: number;
}

type Listener = (event: SSEEvent) => void;

export class SSETransport {
  private listeners: Map<string, Set<Listener>> = new Map();
  private globalListeners: Set<Listener> = new Set();

  subscribe(sessionId: string, listener: Listener): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }
    this.listeners.get(sessionId)!.add(listener);
    return () => {
      this.listeners.get(sessionId)?.delete(listener);
      if (this.listeners.get(sessionId)?.size === 0) {
        this.listeners.delete(sessionId);
      }
    };
  }

  subscribeAll(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  emit(sessionId: string, type: SSEEventType, taskId?: string, data?: any) {
    const event: SSEEvent = {
      type,
      sessionId,
      taskId,
      data,
      timestamp: Date.now(),
    };
    // session-specific
    const set = this.listeners.get(sessionId);
    if (set) {
      for (const l of set) {
        try { l(event); } catch {}
      }
    }
    // global (for monitoring, not for client leak)
    for (const l of this.globalListeners) {
      try { l(event); } catch {}
    }
  }

  // helpers for SARA integration
  taskCreated(sessionId: string, task: any) {
    this.emit(sessionId, "task_created", task.id, task);
  }
  taskUpdated(sessionId: string, task: any) {
    this.emit(sessionId, "task_updated", task.id, task);
  }
  needsApproval(sessionId: string, task: any) {
    this.emit(sessionId, "needs_approval", task.id, task);
  }
  taskCompleted(sessionId: string, task: any) {
    this.emit(sessionId, "task_completed", task.id, task);
  }
  taskFailed(sessionId: string, task: any) {
    this.emit(sessionId, "task_failed", task.id, task);
  }

  // for SSE wire format
  formatSSE(event: SSEEvent): string {
    const payload = JSON.stringify(event);
    // SSE spec: event: + data: + double newline
    return `event: ${event.type}\ndata: ${payload}\n\n`;
  }

  // session isolation check for HTTP handler
  hasSessionListeners(sessionId: string): boolean {
    return this.listeners.has(sessionId) && this.listeners.get(sessionId)!.size > 0;
  }

  listenerCount(sessionId?: string): number {
    if (sessionId) {
      return this.listeners.get(sessionId)?.size || 0;
    }
    let total = 0;
    for (const s of this.listeners.values()) total += s.size;
    return total;
  }
}

// singleton for easy import
export const sseTransport = new SSETransport();
