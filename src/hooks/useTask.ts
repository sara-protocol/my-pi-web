
import { useState, useCallback } from "react";
import { tasksApi, Task } from "../api/sara-client";

export function useTask(sessionId: string) {
  const [current, setCurrent] = useState<Task | null>(null);
  const [approving, setApproving] = useState(false);

  const fetchTask = useCallback(async (id: string) => {
    const data = await tasksApi.get(id, sessionId);
    setCurrent(data.task || data);
    return data.task || data;
  }, [sessionId]);

  const approve = useCallback(async (id: string, approved: boolean) => {
    setApproving(true);
    try {
      const data = await tasksApi.approve(id, sessionId, approved);
      setCurrent(data.task || data);
      return data.task || data;
    } finally {
      setApproving(false);
    }
  }, [sessionId]);

  const complete = useCallback(async (id: string, result?: any) => {
    const data = await tasksApi.complete(id, sessionId, result);
    setCurrent(data.task || data);
    return data.task || data;
  }, [sessionId]);

  return { current, fetchTask, approve, complete, approving, setCurrent };
}
