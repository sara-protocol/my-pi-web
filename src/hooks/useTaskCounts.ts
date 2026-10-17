
import { useEffect, useState, useCallback } from "react";
import { tasksApi } from "../api/sara-client";

export function useTaskCounts(sessionId: string) {
  const [counts, setCounts] = useState<{ pending: number; running: number; completed: number; failed: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const data = await tasksApi.counts(sessionId);
      setCounts(data.counts || data);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { counts, loading, refresh };
}
