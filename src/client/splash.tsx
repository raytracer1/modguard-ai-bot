import './index.css';

import { StrictMode, useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  QueueItem,
  QueueResponse,
  ContextResponse,
  ModContext,
  RiskFactor,
  PossibleRuleMatch,
  ToneAnalysis,
} from '../shared/api';

const severityColors: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const actionStyles: Record<string, string> = {
  approve: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  approve_with_flair: 'bg-blue-600 hover:bg-blue-500 text-white',
  remove: 'bg-red-600 hover:bg-red-500 text-white',
  spam: 'bg-pink-600 hover:bg-pink-500 text-white',
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
  const [showFrequency, setShowFrequency] = useState(false);
  const [editableRules, setEditableRules] = useState<Array<{
    name: string; patterns: string; severity: string; description: string; enabled: boolean;
  }>>([]);
  const [rulesMsg, setRulesMsg] = useState<string | null>(null);
  const [windowMinutes, setWindowMinutes] = useState(5);
  const [floodThreshold, setFloodThreshold] = useState(6);
  const [highRateThreshold, setHighRateThreshold] = useState(3);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
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
    (
      itemId: string,
      action: 'approve' | 'approve_with_flair' | 'remove' | 'spam' | 'ban',
      reason?: string
    ) => {
      // Optimistic: remove from UI immediately, fire API fire-and-forget
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      setExpandedId(null);
      setModContext(null);
      setPicker(null);
      setDecisionMsg(reason ? `${action} — ${reason}` : `${action} — done`);
      fetch('/api/reviewing/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      }).catch(() => {});
      setTimeout(() => setDecisionMsg(null), 3000);

      fetch('/api/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueItemId: itemId, action, reason }),
      }).catch((err) => console.error('Decision error:', err));
    },
    []
  );

  const handleToggleRules = useCallback(async () => {
    if (!showRules) {
      try {
        const res = await fetch('/api/rules');
        const data = await res.json();
        setEditableRules(
          (data.rules || []).map((r: Record<string, unknown>) => ({
            name: String(r.name ?? ''),
            patterns: Array.isArray(r.patterns) ? r.patterns.join('\n') : '',
            severity: String(r.severity ?? 'medium'),
            description: String(r.description ?? ''),
            enabled: r.enabled !== false,
          }))
        );
        setRulesMsg(null);
      } catch { /* ignore */ }
      setShowFrequency(false);
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
      const res = await fetch('/api/rules');
      const data = await res.json();
      setEditableRules(
        (data.rules || []).map((r: Record<string, unknown>) => ({
          name: String(r.name ?? ''),
          patterns: Array.isArray(r.patterns) ? r.patterns.join('\n') : '',
          severity: String(r.severity ?? 'medium'),
          description: String(r.description ?? ''),
          enabled: r.enabled !== false,
        }))
      );
      setRulesMsg('Reset to defaults');
      setTimeout(() => setRulesMsg(null), 3000);
    } catch {
      setRulesMsg('Reset failed');
    }
  }, []);

  const handleSaveRules = useCallback(async () => {
    const rules = editableRules.map((r) => ({
      name: r.name,
      patterns: r.patterns.split('\n').map((s) => s.trim()).filter(Boolean),
      severity: r.severity,
      description: r.description,
      enabled: r.enabled,
    }));
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules }),
    });
    if (res.ok) {
      setRulesMsg(`Saved ${rules.length} rules`);
      setTimeout(() => setRulesMsg(null), 3000);
    }
  }, [editableRules]);

  const handleToggleFrequency = useCallback(async () => {
    if (!showFrequency) {
      try {
        const res = await fetch('/api/settings');
        const settings = await res.json();
        if (settings.frequency) {
          setWindowMinutes(settings.frequency.windowMinutes ?? 5);
          setFloodThreshold(settings.frequency.floodingThreshold ?? 6);
          setHighRateThreshold(settings.frequency.highRateThreshold ?? 3);
        }
        setSettingsMsg(null);
      } catch { /* ignore */ }
      setShowRules(false);
    }
    setShowFrequency(!showFrequency);
  }, [showFrequency]);

  const handleSaveSettings = useCallback(async () => {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        frequency: {
          windowMinutes: windowMinutes,
          floodingThreshold: floodThreshold,
          highRateThreshold: highRateThreshold,
        },
      }),
    });
    if (res.ok) {
      setSettingsMsg('Frequency settings saved');
      setTimeout(() => setSettingsMsg(null), 3000);
    }
  }, [windowMinutes, floodThreshold, highRateThreshold]);

  const addRule = () => {
    setEditableRules((prev) => [
      ...prev,
      { name: '', patterns: '', severity: 'medium', description: '', enabled: true },
    ]);
  };

  const updateRule = (i: number, field: string, value: string | boolean) => {
    setEditableRules((prev) =>
      prev.map((r, j) => (j === i ? { ...r, [field]: value } : r))
    );
  };

  const deleteRule = (i: number) => {
    setEditableRules((prev) => prev.filter((_, j) => j !== i));
  };

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
            onClick={handleToggleFrequency}
            className={`text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
              showFrequency
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            Frequency
          </button>
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
        <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50 shrink-0 max-h-96 overflow-y-auto">
          <div className="text-xs font-medium text-gray-300 mb-2">
            Custom Rules
          </div>
          {editableRules.map((rule, i) => (
            <div
              key={i}
              className="mb-2 p-2 rounded-lg bg-gray-800/50 border border-gray-700/30"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <input
                  className="flex-1 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                  placeholder="Rule name"
                  value={rule.name}
                  onChange={(e) => updateRule(i, 'name', e.target.value)}
                />
                <select
                  className="px-1.5 py-1 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-300 cursor-pointer"
                  value={rule.severity}
                  onChange={(e) => updateRule(i, 'severity', e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => updateRule(i, 'enabled', e.target.checked)}
                    className="w-3 h-3"
                  />
                  On
                </label>
                <button
                  onClick={() => deleteRule(i)}
                  className="text-[10px] px-1 py-0.5 rounded text-red-500 hover:text-red-400 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <textarea
                className="w-full p-1.5 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-300 font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500/50 resize-none"
                placeholder="Patterns (one per line, supports regex)"
                rows={2}
                value={rule.patterns}
                onChange={(e) => updateRule(i, 'patterns', e.target.value)}
                spellCheck={false}
              />
              <input
                className="w-full mt-1 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                placeholder="Description"
                value={rule.description}
                onChange={(e) => updateRule(i, 'description', e.target.value)}
              />
            </div>
          ))}
          <button
            onClick={addRule}
            className="w-full mt-3 py-1.5 rounded-lg border border-dashed border-gray-600 text-[10px] text-gray-500 hover:text-gray-300 hover:border-gray-500 cursor-pointer transition-colors"
          >
            + Add Rule
          </button>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-gray-600">
              {editableRules.length} rule(s)
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

      {/* Frequency Limits panel */}
      {showFrequency && (
        <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50 shrink-0">
          <div className="text-xs font-medium text-gray-300 mb-2">
            Frequency Limits
          </div>
          <div className="flex gap-2 mb-2">
            <div className="flex-1">
              <label className="text-[10px] text-gray-500 block mb-0.5">
                Window (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={windowMinutes}
                onChange={(e) => setWindowMinutes(parseInt(e.target.value) || 1)}
                className="w-full px-2 py-1 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-200 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-gray-500 block mb-0.5">
                Flooding ≥ N
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={floodThreshold}
                onChange={(e) => setFloodThreshold(parseInt(e.target.value) || 1)}
                className="w-full px-2 py-1 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-200 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-gray-500 block mb-0.5">
                High rate ≥ N
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={highRateThreshold}
                onChange={(e) => setHighRateThreshold(parseInt(e.target.value) || 1)}
                className="w-full px-2 py-1 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-200 focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
          <div className="text-[9px] text-gray-600 mb-2">
            ≥ N posts within the window triggers the signal
          </div>
          <div className="flex items-center justify-between">
            {settingsMsg && (
              <span className="text-[10px] text-emerald-400">{settingsMsg}</span>
            )}
            <button
              onClick={handleSaveSettings}
              className="ml-auto text-[10px] px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white cursor-pointer font-medium"
            >
              Save
            </button>
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
                        {item.riskScore != null && (
                          <span
                            className={`ml-2 text-[10px] font-mono ${
                              item.riskScore >= 15
                                ? 'text-red-400'
                                : item.riskScore >= 5
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                            }`}
                          >
                            R{item.riskScore}
                          </span>
                        )}
                        {item.priority != null && (
                          <span
                            className={`ml-1 text-[10px] font-mono ${
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
                        {item.riskRouting && (
                          <span className={`ml-2 text-[9px] px-1 py-0.5 rounded ${
                            item.riskRouting === 'deep_ai'
                              ? 'bg-purple-500/15 text-purple-400'
                              : item.riskRouting === 'light_ai'
                                ? 'bg-blue-500/15 text-blue-400'
                                : 'bg-emerald-500/15 text-emerald-400'
                          }`}>
                            {item.riskRouting === 'deep_ai' ? 'high' :
                             item.riskRouting === 'light_ai' ? 'std' : 'low'}
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
                        {item.recAction}
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

                        {/* Risk Score Bar */}
                        <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/30">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                              Risk Assessment
                            </div>
                            <div className={`text-[11px] font-mono font-bold ${
                              modContext.riskScore.total >= 15 ? 'text-red-400' :
                              modContext.riskScore.total >= 5 ? 'text-amber-400' :
                              'text-emerald-400'
                            }`}>
                              {modContext.riskScore.total}/100
                              <span className="text-[9px] ml-1 font-normal text-gray-500">
                                {modContext.riskScore.routing === 'deep_ai' ? 'HIGH PRIORITY' :
                                 modContext.riskScore.routing === 'light_ai' ? 'STANDARD' : 'LOW'}
                              </span>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-2">
                            <div
                              className={`h-full rounded-full transition-all ${
                                modContext.riskScore.total >= 15 ? 'bg-red-500' :
                                modContext.riskScore.total >= 5 ? 'bg-amber-500' :
                                'bg-emerald-500'
                              }`}
                              style={{ width: `${modContext.riskScore.total}%` }}
                            />
                          </div>
                          {/* Breakdown */}
                          <div className="grid grid-cols-5 gap-1 text-center">
                            {([
                              ['User', modContext.riskScore.breakdown.user, 25],
                              ['Content', modContext.riskScore.breakdown.content, 30],
                              ['Rules', modContext.riskScore.breakdown.rule, 25],
                              ['Behavior', modContext.riskScore.breakdown.behavior, 15],
                              ['Queue', modContext.riskScore.breakdown.queue, 5],
                            ] as [string, number, number][]).map(([label, score, max]) => (
                              <div key={label} className="space-y-0.5">
                                <div className="text-[9px] text-gray-500">{label}</div>
                                <div className={`text-[10px] font-mono ${
                                  score / max > 0.6 ? 'text-red-400' :
                                  score / max > 0.3 ? 'text-amber-400' :
                                  'text-emerald-400'
                                }`}>
                                  {score}/{max}
                                </div>
                              </div>
                            ))}
                          </div>
                          {/* Routing reason */}
                          <div className="mt-2 text-[9px] text-gray-600 italic">
                            {modContext.meta.aiRoutingReason}
                          </div>
                        </div>

                        {/* AI Analysis Panel */}
                        {modContext.aiAnalysis && (
                          <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">
                                🤖 AI Context Analysis
                              </div>
                              <div className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                modContext.aiAnalysis.confidence >= 0.7
                                  ? 'bg-purple-500/20 text-purple-300'
                                  : 'bg-amber-500/15 text-amber-400'
                              }`}>
                                confidence: {Math.round(modContext.aiAnalysis.confidence * 100)}%
                              </div>
                            </div>

                            {/* Risk factors */}
                            {modContext.aiAnalysis.risk_factors.length > 0 && (
                              <div className="mb-2">
                                <div className="text-[10px] font-medium text-purple-300 mb-1">
                                  Risk Factors
                                </div>
                                {modContext.aiAnalysis.risk_factors.map((rf: RiskFactor, i: number) => (
                                  <div key={i} className="flex items-start gap-1.5 mb-1 text-[10px]">
                                    <span className={`shrink-0 mt-0.5 ${
                                      rf.strength === 'high' ? 'text-red-400' :
                                      rf.strength === 'moderate' ? 'text-amber-400' : 'text-blue-400'
                                    }`}>
                                      {rf.strength === 'high' ? '⬤' : rf.strength === 'moderate' ? '◐' : '◌'}
                                    </span>
                                    <div>
                                      <span className="text-gray-300">{rf.signal}</span>
                                      <span className="text-gray-500"> — {rf.explanation}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Rule assessment by AI */}
                            {modContext.aiAnalysis.possible_rule_matches.length > 0 && (
                              <div className="mb-2">
                                <div className="text-[10px] font-medium text-purple-300 mb-1">
                                  Rule Assessment
                                </div>
                                {modContext.aiAnalysis.possible_rule_matches.map((prm: PossibleRuleMatch, i: number) => (
                                  <div key={i} className="flex items-start gap-1.5 mb-1 text-[10px]">
                                    <span className={`shrink-0 px-1 py-0.5 rounded text-[9px] ${
                                      prm.relevance === 'definite' || prm.relevance === 'likely'
                                        ? 'bg-red-500/15 text-red-400'
                                        : prm.relevance === 'partial'
                                          ? 'bg-amber-500/15 text-amber-400'
                                          : 'bg-gray-500/15 text-gray-400'
                                    }`}>
                                      {prm.relevance}
                                    </span>
                                    <div>
                                      <span className="text-gray-300">{prm.rule}</span>
                                      <span className="text-gray-500"> — {prm.explanation}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Tone */}
                            <div className="mb-2">
                              <div className="text-[10px] font-medium text-purple-300 mb-1">
                                Tone: <span className="text-gray-300">{modContext.aiAnalysis.tone_analysis.primary_tone}</span>
                                {modContext.aiAnalysis.tone_analysis.secondary_tones.length > 0 && (
                                  <span className="text-gray-500">
                                    {' '}+ {modContext.aiAnalysis.tone_analysis.secondary_tones.join(', ')}
                                  </span>
                                )}
                                <span className="text-gray-600 ml-1">
                                  ({modContext.aiAnalysis.tone_analysis.certainty} certainty)
                                </span>
                              </div>
                              <div className="text-[10px] text-gray-500">
                                {modContext.aiAnalysis.tone_analysis.notes}
                              </div>
                            </div>

                            {/* Precedent */}
                            {modContext.aiAnalysis.precedent_summary && (
                              <div className="mb-2">
                                <div className="text-[10px] font-medium text-purple-300 mb-0.5">
                                  Similar Precedents
                                </div>
                                <div className="text-[10px] text-gray-500">
                                  {modContext.aiAnalysis.precedent_summary}
                                </div>
                              </div>
                            )}

                            {/* Review action hint */}
                            <div className={`text-[10px] px-2 py-1 rounded ${
                              modContext.aiAnalysis.recommended_review_action === 'approve_likely_safe'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : modContext.aiAnalysis.recommended_review_action === 'escalate_for_review'
                                  ? 'bg-red-500/10 text-red-400'
                                  : 'bg-amber-500/10 text-amber-400'
                            }`}>
                              AI suggests: {modContext.aiAnalysis.recommended_review_action.replace(/_/g, ' ')}
                              {' — '}advisory only, you decide
                            </div>
                          </div>
                        )}

                        {/* Summary */}
                        <div className={`p-3 rounded-lg border ${modContext.meta.aiAssisted ? 'bg-purple-500/5 border-purple-500/20' : 'bg-blue-500/5 border-blue-500/20'}`}>
                          <div className={`text-[10px] font-medium mb-1 ${modContext.meta.aiAssisted ? 'text-purple-400' : 'text-blue-400'}`}>
                            {modContext.meta.aiAssisted ? 'AI ANALYSIS' : 'ANALYSIS'}
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
                                className={`flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${actionStyles.approve_with_flair}`}
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
