import './index.css';

import { StrictMode, useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  QueueItem,
  QueueResponse,
  ContextResponse,
  ModContext,
} from '../shared/api';

const severityColors: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const actionStyles: Record<string, string> = {
  remove: 'bg-red-600 hover:bg-red-500 text-white',
  spam: 'bg-pink-600 hover:bg-pink-500 text-white',
  approve: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  ban: 'bg-red-800 hover:bg-red-700 text-white',
};

export const Splash = () => {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modContext, setModContext] = useState<ModContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [decisionMsg, setDecisionMsg] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [rulesJson, setRulesJson] = useState('');
  const [rulesMsg, setRulesMsg] = useState<string | null>(null);
  const [picker, setPicker] = useState<{
    itemId: string;
    options: string[];
    label: string;
    action: 'remove' | 'approve_with_flair';
    variant: 'danger' | 'info';
  } | null>(null);

  const FLAIR_OPTIONS = ['Rule Violation', 'Spam', 'Low Quality', 'Misinformation', 'Warning', 'Approved'];
  const REMOVAL_REASONS = ['Violates community rules', 'Spam', 'Harassment', 'Low quality / low effort', 'Personal information', 'Incitement / trolling'];

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/queue');
      const data: QueueResponse = await res.json();
      if (data.type === 'queue') setItems(data.items);
    } catch (err) {
      console.error('Queue fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleExpand = useCallback(
    async (item: QueueItem) => {
      if (expandedId === item.id) {
        // Collapsing — clear reviewing
        setExpandedId(null);
        setModContext(null);
        fetch('/api/reviewing/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: item.id }),
        }).catch(() => {});
        return;
      }
      // Expanding — mark as reviewing
      setExpandedId(item.id);
      setModContext(null);
      setDecisionMsg(null);
      setCtxLoading(true);

      fetch('/api/reviewing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      }).catch(() => {});

      try {
        const res = await fetch('/api/context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.id,
            title: item.title,
            content: item.body,
            author: item.author,
            type: item.type,
            reportCount: item.reportCount,
            score: item.score,
          }),
        });
        const data: ContextResponse = await res.json();
        if (data.type === 'context') setModContext(data.data);
      } catch (err) {
        console.error('Context fetch error:', err);
      } finally {
        setCtxLoading(false);
      }
    },
    [expandedId]
  );

  const handleDecision = useCallback(
    async (
      itemId: string,
      action: 'approve' | 'remove' | 'spam' | 'approve_with_flair' | 'ban',
      reason?: string
    ) => {
      try {
        const res = await fetch('/api/decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queueItemId: itemId, action, reason }),
        });
        if (res.ok) {
          setItems((prev) => prev.filter((i) => i.id !== itemId));
          setExpandedId(null);
          setModContext(null);
          setPicker(null);
          setDecisionMsg(reason ? `${action} — ${reason}` : `${action} — done`);
          // Clear reviewing
          fetch('/api/reviewing/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId }),
          }).catch(() => {});
          setTimeout(() => setDecisionMsg(null), 3000);
        }
      } catch (err) {
        console.error('Decision error:', err);
      }
    },
    []
  );

  const handleToggleRules = useCallback(async () => {
    if (!showRules) {
      try {
        const res = await fetch('/api/rules');
        const data = await res.json();
        setRulesJson(JSON.stringify(data.rules || [], null, 2));
        setRulesMsg(null);
      } catch {
        setRulesJson('[\n  \n]');
      }
    }
    setShowRules(!showRules);
  }, [showRules]);

  const handleResetRules = useCallback(async () => {
    try {
      await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: [] }),
      });
      // Reload to get defaults
      const res = await fetch('/api/rules');
      const data = await res.json();
      setRulesJson(JSON.stringify(data.rules, null, 2));
      setRulesMsg('Reset to defaults');
      setTimeout(() => setRulesMsg(null), 3000);
    } catch {
      setRulesMsg('Reset failed');
    }
  }, []);

  const handleSaveRules = useCallback(async () => {
    try {
      const rules = JSON.parse(rulesJson);
      if (!Array.isArray(rules)) throw new Error('Not an array');
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
      if (res.ok) {
        setRulesMsg(`Saved ${rules.length} rules`);
        setTimeout(() => setRulesMsg(null), 3000);
      }
    } catch {
      setRulesMsg('Invalid JSON');
    }
  }, [rulesJson]);

  const OptionPicker = () => {
    if (!picker) return null;
    const btnClass =
      picker.variant === 'danger'
        ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
        : 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20';
    return (
      <div className="space-y-1.5">
        <div className="text-[10px] text-gray-500 font-medium">{picker.label}</div>
        {picker.options.map((opt) => (
          <button
            key={opt}
            onClick={() => {
              handleDecision(picker.itemId, picker.action, opt);
              setPicker(null);
            }}
            className={`w-full text-left px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${btnClass}`}
          >
            {opt}
          </button>
        ))}
        <button
          onClick={() => setPicker(null)}
          className="w-full text-center py-1 text-[10px] text-gray-600 hover:text-gray-400 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-lg">🛡</span>
          <div>
            <h1 className="text-sm font-bold text-gray-100">ModGuard AI</h1>
            <p className="text-[10px] text-gray-600">
              {loading ? 'Loading...' : `${items.length} items need review`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {decisionMsg && (
            <span className="text-[10px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-400">
              {decisionMsg}
            </span>
          )}
          <button
            onClick={handleToggleRules}
            className={`text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
              showRules
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            Rules
          </button>
        </div>
      </div>

      {/* Rules config panel */}
      {showRules && (
        <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50 shrink-0">
          <div className="text-xs font-medium text-gray-300 mb-2">
            Custom Rules (JSON)
          </div>
          <textarea
            className="w-full h-32 p-2 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-200 font-mono resize-none focus:outline-none focus:border-blue-500/50"
            value={rulesJson}
            onChange={(e) => setRulesJson(e.target.value)}
            spellCheck={false}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-gray-600">
              name, patterns, severity, description, enabled
            </span>
            <div className="flex gap-2">
              {rulesMsg && (
                <span className="text-[10px] text-emerald-400 self-center">
                  {rulesMsg}
                </span>
              )}
              <button
                onClick={handleResetRules}
                className="text-[10px] px-2 py-1 rounded text-red-500 hover:text-red-400 cursor-pointer"
              >
                Reset
              </button>
              <button
                onClick={handleToggleRules}
                className="text-[10px] px-2 py-1 rounded text-gray-500 hover:text-gray-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRules}
                className="text-[10px] px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white cursor-pointer font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Queue list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-center px-4">
            <p className="text-sm text-gray-500">Queue is empty</p>
            <p className="text-xs text-gray-600">
              Flagged posts and comments will appear here automatically
            </p>
          </div>
        ) : (
          items.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className="border-b border-gray-800/50"
              >
                {/* Compact row — always visible */}
                <button
                  onClick={() => handleExpand(item)}
                  className="w-full text-left p-3 hover:bg-gray-900/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                            severityColors[item.flagSeverity] ??
                            'bg-gray-500/20 text-gray-400 border-gray-500/30'
                          }`}
                        >
                          {item.flag}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            item.type === 'post'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-purple-500/20 text-purple-400'
                          }`}
                        >
                          {item.type}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-gray-200 truncate">
                        {item.title || item.body.slice(0, 80)}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        u/{item.author} · {item.score} pts
                        {item.priority != null && (
                          <span
                            className={`ml-2 text-[10px] font-mono ${
                              item.priority >= 80
                                ? 'text-red-400'
                                : item.priority >= 50
                                  ? 'text-amber-400'
                                  : 'text-blue-400'
                            }`}
                          >
                            P{item.priority.toFixed(0)}
                          </span>
                        )}
                        {item.reviewing && expandedId !== item.id && (
                          <span className="text-amber-400 ml-2">
                            · reviewing: u/{item.reviewing.username}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`text-[10px] px-2 py-1 rounded font-medium capitalize ${
                          (item.recAction === 'remove' || item.recAction === 'spam' || item.recAction === 'ban')
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}
                      >
                        {item.recAction.replace('_', ' + ')}
                      </span>
                      <div className="text-[10px] font-mono text-gray-600 mt-0.5">
                        {item.recConfidence}%
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expanded context panel */}
                {isExpanded && (
                  <div className="px-3 pb-3">
                    {ctxLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                      </div>
                    ) : modContext ? (
                      <div className="space-y-2">
                        {/* Original content */}
                        <div className="p-3 rounded-lg bg-gray-900/60 border border-gray-700/50">
                          {item.title && (
                            <div className="text-sm font-semibold text-gray-100 mb-1">
                              {item.title}
                            </div>
                          )}
                          <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                            {item.body}
                          </div>
                        </div>

                        {/* AI summary */}
                        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                          <div className="text-[10px] text-blue-400 font-medium mb-1">
                            AI SUMMARY
                          </div>
                          <p className="text-xs text-gray-300 leading-relaxed">
                            {modContext.contentSummary.shortSummary}
                          </p>
                        </div>

                        {/* Matched rules */}
                        <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/30">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1.5">
                            Matched Rules
                          </div>
                          {modContext.ruleMatches
                            .filter((m) => m.matched)
                            .slice(0, 5)
                            .map((m) => (
                              <div
                                key={m.rule.id}
                                className="text-[10px] text-gray-400 mb-1"
                              >
                                <span
                                  className={`px-1 py-0.5 rounded ${
                                    severityColors[m.severity]
                                  }`}
                                >
                                  {m.severity}
                                </span>{' '}
                                {m.rule.title}
                              </div>
                            ))}
                          {modContext.ruleMatches.filter((m) => m.matched)
                            .length === 0 && (
                            <div className="text-[10px] text-gray-500">
                              No violations detected
                            </div>
                          )}
                        </div>

                        {/* Recommendation reasoning */}
                        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                          <p className="text-[11px] text-gray-300 leading-relaxed">
                            {modContext.recommendation.reasoning}
                          </p>
                        </div>

                        {/* Action buttons or removal reasons */}
                        {picker?.itemId === item.id ? (
                          <OptionPicker />
                        ) : (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleDecision(item.id, 'approve')}
                                className={`flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${actionStyles.approve}`}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() =>
                                  setPicker({
                                    itemId: item.id,
                                    options: FLAIR_OPTIONS,
                                    label: 'Select flair:',
                                    action: 'approve_with_flair',
                                    variant: 'info',
                                  })
                                }
                                className="flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors bg-blue-600 hover:bg-blue-500 text-white"
                              >
                                Approve + Flair
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  setPicker({
                                    itemId: item.id,
                                    options: REMOVAL_REASONS,
                                    label: 'Select removal reason:',
                                    action: 'remove',
                                    variant: 'danger',
                                  })
                                }
                                className={`flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${actionStyles.remove}`}
                              >
                                Remove
                              </button>
                              <button
                                onClick={() => handleDecision(item.id, 'spam')}
                                className={`flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${actionStyles.spam}`}
                              >
                                Spam
                              </button>
                              <button
                                onClick={() => handleDecision(item.id, 'ban')}
                                className={`flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${actionStyles.ban}`}
                              >
                                Ban u/{item.author}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-600 text-center py-4">
                        Failed to load context
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="text-[10px] text-gray-800 text-center py-2 shrink-0 border-t border-gray-800/50">
        Tap an item to expand · Context → Decision → Action
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
