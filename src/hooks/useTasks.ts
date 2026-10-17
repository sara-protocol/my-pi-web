
import { useEffect, useState, useCallback } from "react";
import { tasksApi, Task } from "../api/sara-client";

export function useTasks(sessionId: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const data = await tasksApi.list(sessionId);
      setTasks(data.tasks || data || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createTask = useCallback(async (title: string, opts?: { fileName?: string; content?: string; command?: string; args?: string[] }) => {
    const task = await tasksApi.create({ sessionId, title, ...opts });
    setTasks(prev => [task.task || task, ...prev]);
    return task.task || task;
  }, [sessionId]);

  return { tasks, loading, error, refresh, createTask, setTasks };
}
