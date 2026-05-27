import './index.css';

import { StrictMode, useState, useCallback, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useModContext } from './hooks/useModContext';
import { ContextPanel } from './components/ContextPanel';
import { StatsBar } from './components/StatsBar';

interface AnalysisTarget {
  title: string;
  content: string;
  author: string;
  type: 'post' | 'comment';
  reportCount: number;
  score: number;
}

function readAnalysisTarget(): AnalysisTarget | null {
  try {
    const raw = sessionStorage.getItem('modguard:analysisTarget');
    if (!raw) return null;
    sessionStorage.removeItem('modguard:analysisTarget');
    return JSON.parse(raw) as AnalysisTarget;
  } catch {
    return null;
  }
}

export const App = () => {
  const {
    context,
    loading,
    error,
    stats,
    fetchContext,
    recordDecision,
    fetchStats,
  } = useModContext();

  const [decisionState, setDecisionState] = useState<{
    action: string;
    recorded: boolean;
  } | null>(null);
  const [noTarget, setNoTarget] = useState(false);

  useEffect(() => {
    const target = readAnalysisTarget();
    if (target) {
      fetchContext({
        title: target.title,
        content: target.content,
        author: target.author,
        reportCount: target.reportCount,
        score: target.score,
        type: target.type,
      });
    } else {
      setNoTarget(true);
    }
  }, [fetchContext]);

  const handleDecision = useCallback(
    async (
      action: 'approve' | 'remove' | 'lock' | 'approve_with_flair',
      flair?: string
    ) => {
      if (!context) return;

      const decision: { queueItemId: string; action: typeof action; flair?: string } = {
        queueItemId: context.queueItem.id,
        action,
      };
      if (flair !== undefined) {
        decision.flair = flair;
      }
      const success = await recordDecision(decision);

      setDecisionState({ action, recorded: success });
      if (success) {
        fetchStats();
      }
    },
    [context, recordDecision, fetchStats]
  );

  if (noTarget) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-gray-500">No content to analyze.</p>
        <p className="text-xs text-gray-600">Close and select an item from the queue.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <header className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm font-bold text-gray-200">🛡 ModGuard AI</span>
          <span className="text-[10px] text-gray-600">Context Copilot</span>
        </div>
        {stats && (
          <StatsBar
            totalAnalyzed={stats.totalAnalyzed}
            averageTimeSavedSeconds={stats.averageTimeSavedSeconds}
            aiAssistedPercentage={stats.aiAssistedPercentage}
            contextSwitchesReduced={stats.contextSwitchesReduced}
          />
        )}
      </header>

      <main className="max-w-7xl mx-auto p-4 pb-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Analyzing content...</p>
          </div>
        ) : error ? (
          <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/30 text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : context ? (
          <div>
            {decisionState && (
              <div
                className={`mb-3 p-3 rounded-lg text-center ${
                  decisionState.recorded
                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                    : 'bg-red-500/10 border border-red-500/30'
                }`}
              >
                <p
                  className={`text-xs font-medium ${
                    decisionState.recorded ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {decisionState.recorded
                    ? `Decision recorded: ${decisionState.action}`
                    : 'Failed to record decision'}
                </p>
              </div>
            )}

            <ContextPanel
              context={context}
              onDecision={handleDecision}
              disabled={decisionState?.recorded ?? false}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
