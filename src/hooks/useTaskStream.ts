
import { useEffect, useRef, useCallback } from "react";
import { sseApi, Task } from "../api/sara-client";

export type TaskEvent = {
  type: "task_created" | "task_updated" | "needs_approval" | "task_completed" | "task_failed" | "heartbeat";
  sessionId: string;
  taskId?: string;
  data?: any;
};

export function useTaskStream(sessionId: string, onEvent: (e: TaskEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!sessionId) return;
    const disconnect = sseApi.connect(sessionId, (e) => {
      onEventRef.current(e);
    });
    return disconnect;
  }, [sessionId]);
}

export function useTasksRealtime(sessionId: string) {
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [connected, setConnected] = useState(false);

  const handleEvent = useCallback((e: TaskEvent) => {
    if (e.type === "heartbeat") {
      setConnected(true);
      return;
    }
    setEvents(prev => [e, ...prev].slice(0, 100));
  }, []);

  useTaskStream(sessionId, handleEvent);

  return { events, connected };
}

// Need useState import
import { useState } from "react";
