import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const QUEUE_ITEMS = [
  {
    id: 'q-1',
    title: 'youre all idiots if you believe this garbage',
    content:
      'This entire thread is a joke. Delete this trash mods. You people are worthless and I hope this sub gets banned.',
    author: 'trouble_maker_99',
    type: 'comment' as const,
    reportCount: 5,
    score: -12,
    flag: 'Harassment',
    flagSeverity: 'high' as const,
    recAction: 'Remove',
    recConfidence: 92,
  },
  {
    id: 'q-2',
    title: 'thoughts?',
    content: 'what do you guys think',
    author: 'low_effort_pepe',
    type: 'post' as const,
    reportCount: 1,
    score: 0,
    flag: 'Low Quality',
    flagSeverity: 'low' as const,
    recAction: 'Remove',
    recConfidence: 60,
  },
  {
    id: 'q-3',
    title: 'Unpopular opinion: the current moderation approach is failing',
    content:
      "Are you seriously defending this position? Its objectively wrong and anyone with half a brain can see that.",
    author: 'heated_debater',
    type: 'comment' as const,
    reportCount: 3,
    score: -5,
    flag: 'Incivility',
    flagSeverity: 'medium' as const,
    recAction: 'Lock',
    recConfidence: 70,
  },
  {
    id: 'q-4',
    title: 'BUY MY PRODUCT NOW CLICK HERE!!!!',
    content:
      'Best product ever! Visit my site at example.com! Limited time offer!!! Click here to earn $5000 per day!!!',
    author: 'spam_bot_2026',
    type: 'post' as const,
    reportCount: 4,
    score: -3,
    flag: 'Spam',
    flagSeverity: 'medium' as const,
    recAction: 'Remove',
    recConfidence: 85,
  },
  {
    id: 'q-5',
    title: 'Everyone should know about this person',
    content:
      'John Smith from 123 Main St Austin TX - his phone is (512) 555-0198. Everyone should know who this guy really is.',
    author: 'doxxer_account',
    type: 'comment' as const,
    reportCount: 8,
    score: -25,
    flag: 'Doxxing',
    flagSeverity: 'critical' as const,
    recAction: 'Remove',
    recConfidence: 98,
  },
];

const severityColors: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const actionColors: Record<string, string> = {
  Remove: 'bg-red-500/10 text-red-400',
  Lock: 'bg-amber-500/10 text-amber-400',
  Approve: 'bg-emerald-500/10 text-emerald-400',
};

export const Splash = () => {
  const handleSelect = (
    item: (typeof QUEUE_ITEMS)[number],
    e: React.MouseEvent
  ) => {
    sessionStorage.setItem(
      'modguard:analysisTarget',
      JSON.stringify({
        title: item.title,
        content: item.content,
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
              {QUEUE_ITEMS.length} items need review
            </p>
          </div>
        </div>
      </div>

      {/* Queue list */}
      <div className="flex-1 overflow-y-auto">
        {QUEUE_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={(e) => handleSelect(item, e)}
            className="w-full text-left p-3 border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors cursor-pointer"
          >
            <div className="flex items-start gap-3">
              {/* Left: content info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                      severityColors[item.flagSeverity]
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
                  {item.title}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  u/{item.author} · {item.score} pts
                </div>
              </div>

              {/* Right: recommendation */}
              <div className="text-right shrink-0">
                <span
                  className={`text-[10px] px-2 py-1 rounded font-medium ${
                    actionColors[item.recAction]
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
        ))}
      </div>

      {/* Footer */}
      <p className="text-[10px] text-gray-800 text-center py-2 shrink-0 border-t border-gray-800/50">
        Tap an item to see full context & take action
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
