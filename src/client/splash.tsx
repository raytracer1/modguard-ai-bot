import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { QueueItem, QueueResponse } from '../shared/api';

const severityColors: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const actionColors: Record<string, string> = {
  remove: 'bg-red-500/10 text-red-400',
  lock: 'bg-amber-500/10 text-amber-400',
  approve: 'bg-emerald-500/10 text-emerald-400',
  approve_with_flair: 'bg-blue-500/10 text-blue-400',
};

export const Splash = () => {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/queue')
      .then((res) => res.json())
      .then((data: QueueResponse) => {
        if (data.type === 'queue') {
          setItems(data.items);
        }
      })
      .catch((err) => console.error('Failed to fetch queue:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (item: QueueItem, e: React.MouseEvent) => {
    sessionStorage.setItem(
      'modguard:analysisTarget',
      JSON.stringify({
        id: item.id,
        title: item.title,
        content: item.body,
        author: item.author,
        type: item.type,
        reportCount: item.reportCount,
        score: item.score,
      })
    );
    requestExpandedMode(e.nativeEvent, 'game');
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      {/* Header */}
      <div className="px-4 py-4 flex items-center justify-between shrink-0 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛡</span>
          <div>
            <h1 className="text-sm font-bold text-gray-100">ModGuard AI</h1>
            <p className="text-[10px] text-gray-600">
              {loading
                ? 'Loading queue...'
                : `${items.length} items need review`}
            </p>
          </div>
        </div>
      </div>

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
              Reported posts and comments will appear here
            </p>
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              onClick={(e) => handleSelect(item, e)}
              className="w-full text-left p-3 border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-3">
                {/* Content info */}
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
                    {item.reportCount > 0 && (
                      <span className="text-[10px] text-gray-600">
                        {item.reportCount} reports
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-gray-200 truncate">
                    {item.title || item.body.slice(0, 80)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    u/{item.author} · {item.score} pts
                  </div>
                </div>

                {/* Recommendation */}
                <div className="text-right shrink-0">
                  <span
                    className={`text-[10px] px-2 py-1 rounded font-medium capitalize ${
                      actionColors[item.recAction] ??
                      'bg-gray-500/10 text-gray-400'
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
          ))
        )}
      </div>

      {/* Footer */}
      <p className="text-[10px] text-gray-800 text-center py-2 shrink-0 border-t border-gray-800/50">
        {items.length > 0
          ? 'Tap an item to see full context & take action'
          : 'Items from reported queue will appear here automatically'}
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
