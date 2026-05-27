import { useState, useEffect, useCallback } from 'react';
import type { ContextResponse, StatsResponse, DecisionRequest, ModContext } from '../../shared/api';

interface UseModContextState {
  context: ModContext | null;
  loading: boolean;
  error: string | null;
  stats: {
    totalAnalyzed: number;
    averageTimeSavedSeconds: number;
    aiAssistedPercentage: number;
    contextSwitchesReduced: number;
  } | null;
}

export function useModContext() {
  const [state, setState] = useState<UseModContextState>({
    context: null,
    loading: false,
    error: null,
    stats: null,
  });

  const fetchContext = useCallback(
    async (item: {
      title?: string;
      content?: string;
      author?: string;
      subreddit?: string;
      reportCount?: number;
      score?: number;
      type?: 'post' | 'comment';
    }) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetch('/api/context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ContextResponse = await res.json();
        if (data.type !== 'context') throw new Error('Unexpected response type');
        setState((prev) => ({
          ...prev,
          context: data.data,
          loading: false,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load context',
        }));
      }
    },
    []
  );

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) return;
      const data: StatsResponse = await res.json();
      if (data.type === 'stats') {
        setState((prev) => ({ ...prev, stats: data.data }));
      }
    } catch {
      // Stats are non-critical; silently fail
    }
  }, []);

  const recordDecision = useCallback(
    async (decision: DecisionRequest): Promise<boolean> => {
      try {
        const res = await fetch('/api/decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(decision),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    []
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    ...state,
    fetchContext,
    fetchStats,
    recordDecision,
  };
}
