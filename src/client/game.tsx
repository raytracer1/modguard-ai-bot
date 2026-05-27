import './index.css';

import { StrictMode, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { useModContext } from './hooks/useModContext';
import { ContextPanel } from './components/ContextPanel';
import { DemoPanel } from './components/DemoPanel';
import { StatsBar } from './components/StatsBar';
import type { DemoScenario } from './components/DemoPanel';

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

  const [selectedScenario, setSelectedScenario] = useState<DemoScenario | null>(
    null
  );
  const [decisionState, setDecisionState] = useState<{
    action: string;
    recorded: boolean;
  } | null>(null);

  const handleSelectScenario = useCallback(
    async (scenario: DemoScenario) => {
      setSelectedScenario(scenario);
      setDecisionState(null);
      await fetchContext({
        title: scenario.title,
        content: scenario.content,
        author: scenario.author,
        reportCount: scenario.reportCount,
        score: scenario.score,
        type: scenario.type,
      });
    },
    [fetchContext]
  );

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

  const handleBack = useCallback(() => {
    setSelectedScenario(null);
    setDecisionState(null);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            {selectedScenario && (
              <button
                onClick={handleBack}
                className="text-sm text-gray-400 hover:text-gray-200 cursor-pointer transition-colors"
              >
                ← Back
              </button>
            )}
            <span className="text-sm font-bold text-gray-200">
              🛡 ModGuard AI
            </span>
          </div>
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

      {/* Main content */}
      <main className="max-w-lg mx-auto p-4 pb-8">
        {!selectedScenario ? (
          <DemoPanel onSelect={handleSelectScenario} loading={loading} />
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Analyzing content...</p>
          </div>
        ) : error ? (
          <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/30 text-center">
            <p className="text-red-400 text-sm mb-3">{error}</p>
            <button
              onClick={handleBack}
              className="text-xs text-gray-400 hover:text-gray-200 cursor-pointer"
            >
              Go back and try again
            </button>
          </div>
        ) : context ? (
          <div>
            {/* Decision confirmation */}
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
