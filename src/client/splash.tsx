import './index.css';

import { navigateTo } from '@devvit/web/client';
import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export const Splash = () => {
  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-6 bg-gray-950">
      {/* Logo area */}
      <div className="text-6xl mb-2">🛡</div>

      <div className="flex flex-col items-center gap-3 px-4">
        <h1 className="text-2xl font-bold text-center text-gray-100">
          ModGuard AI
        </h1>
        <p className="text-sm text-center text-gray-400 max-w-xs leading-relaxed">
          Context Copilot for Moderators — Make faster, more consistent
          moderation decisions without replacing human judgment.
        </p>
      </div>

      {/* Feature highlights */}
      <div className="grid grid-cols-2 gap-3 px-4 max-w-sm">
        {[
          { icon: '👤', label: 'User Context', desc: 'Account history & patterns' },
          { icon: '📋', label: 'Rule Matching', desc: 'Auto-detect violations' },
          { icon: '📊', label: 'Similar Cases', desc: 'Past decisions reference' },
          { icon: '💡', label: 'Smart Recs', desc: 'Suggested actions with reasoning' },
        ].map((f) => (
          <div
            key={f.label}
            className="p-3 rounded-xl bg-gray-800/40 border border-gray-700/50 text-center"
          >
            <div className="text-xl mb-1">{f.icon}</div>
            <div className="text-xs font-medium text-gray-300">{f.label}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">{f.desc}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="flex items-center justify-center mt-2">
        <button
          className="flex items-center justify-center gap-2 bg-[#d93900] text-white h-10 rounded-full cursor-pointer transition-colors px-6 hover:bg-[#c23300] text-sm font-medium"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
        >
          Open Context Panel
        </button>
      </div>

      {/* Tagline */}
      <p className="text-xs text-gray-700 max-w-xs text-center px-4">
        Context → Decision → Action. Not an auto-moderation bot — a decision
        accelerator for human moderators.
      </p>

      <footer className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 text-[0.8em] text-gray-600">
        <button
          className="cursor-pointer hover:text-gray-400 transition-colors"
          onClick={() => navigateTo('https://developers.reddit.com/docs')}
        >
          Devvit Docs
        </button>
        <span className="text-gray-700">|</span>
        <button
          className="cursor-pointer hover:text-gray-400 transition-colors"
          onClick={() => navigateTo('https://www.reddit.com/r/Devvit')}
        >
          r/Devvit
        </button>
        <span className="text-gray-700">|</span>
        <button
          className="cursor-pointer hover:text-gray-400 transition-colors"
          onClick={() => navigateTo('https://discord.com/invite/R7yu2wh9Qz')}
        >
          Discord
        </button>
      </footer>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
