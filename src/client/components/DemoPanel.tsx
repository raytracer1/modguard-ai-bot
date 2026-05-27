import React from 'react';

interface DemoScenario {
  label: string;
  icon: string;
  title: string;
  content: string;
  author: string;
  type: 'post' | 'comment';
  reportCount: number;
  score: number;
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    label: 'Harassment',
    icon: '⚠',
    title: 'youre all idiots if you believe this garbage',
    content: 'This entire thread is a joke. Delete this trash mods. You people are worthless and I hope this sub gets banned.',
    author: 'trouble_maker_99',
    type: 'comment',
    reportCount: 5,
    score: -12,
  },
  {
    label: 'Low Quality',
    icon: '○',
    title: 'thoughts?',
    content: 'what do you guys think',
    author: 'low_effort_pepe',
    type: 'post',
    reportCount: 1,
    score: 0,
  },
  {
    label: 'Civility Issue',
    icon: '↑',
    title: 'Unpopular opinion: the current moderation approach is failing',
    content: 'Are you seriously defending this position? Its objectively wrong and anyone with half a brain can see that. I cant believe this sub upvotes this nonsense.',
    author: 'heated_debater',
    type: 'comment',
    reportCount: 3,
    score: -5,
  },
  {
    label: 'Spam',
    icon: '$',
    title: 'BUY MY PRODUCT NOW CLICK HERE!!!!',
    content: 'Best product ever! Visit my site at example.com! Limited time offer!!! Click here to earn $5000 per day!!!',
    author: 'spam_bot_2026',
    type: 'post',
    reportCount: 4,
    score: -3,
  },
  {
    label: 'Doxxing',
    icon: '!',
    title: 'Everyone should know about this person',
    content: 'John Smith from 123 Main St Austin TX - his phone is (512) 555-0198. Everyone should know who this guy really is.',
    author: 'doxxer_account',
    type: 'comment',
    reportCount: 8,
    score: -25,
  },
];

interface DemoPanelProps {
  onSelect: (scenario: DemoScenario) => void;
  loading: boolean;
}

export const DemoPanel: React.FC<DemoPanelProps> = ({ onSelect, loading }) => {
  return (
    <div className="p-4">
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">🛡</div>
        <h1 className="text-xl font-bold text-gray-100 mb-1">ModGuard AI</h1>
        <p className="text-xs text-gray-500 max-w-xs mx-auto">
          Context Copilot for Moderators — Make faster, more consistent decisions
          without replacing human judgment.
        </p>
      </div>

      <div className="mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          Demo Scenarios
        </h2>
        <p className="text-[10px] text-gray-600 mb-3">
          Select a scenario to see how ModGuard provides context for moderation decisions.
        </p>
        <div className="space-y-2">
          {DEMO_SCENARIOS.map((scenario) => (
            <button
              key={scenario.label}
              disabled={loading}
              onClick={() => onSelect(scenario)}
              className={`w-full text-left p-3 rounded-xl border border-gray-700/50 bg-gray-800/40 transition-all hover:border-gray-600 hover:bg-gray-800/80 ${
                loading ? 'opacity-50 cursor-wait' : 'cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700/50 shrink-0">
                  {scenario.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-gray-200">
                      {scenario.label}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        scenario.type === 'post'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-purple-500/20 text-purple-400'
                      }`}
                    >
                      {scenario.type}
                    </span>
                    {scenario.reportCount > 0 && (
                      <span className="text-[10px] text-red-400">
                        {scenario.reportCount} reports
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {scenario.title}
                  </div>
                  <div className="text-[10px] text-gray-600 mt-0.5">
                    u/{scenario.author} · {scenario.score} pts
                  </div>
                </div>
                <span className="text-gray-600 text-sm">→</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-gray-700 text-center">
        Not an auto-moderation tool. All decisions are suggestions.
      </p>
    </div>
  );
};

export type { DemoScenario };
