import React from 'react';
import type { ContentSummary } from '../../shared/types';

interface ContentSummaryCardProps {
  summary: ContentSummary;
  title: string;
  body: string;
}

export const ContentSummaryCard: React.FC<ContentSummaryCardProps> = ({
  summary,
  title,
  body,
}) => {
  const sentimentBadge = {
    hostile: 'bg-red-500/20 text-red-400 border-red-500/30',
    negative: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    neutral: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    positive: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  }[summary.sentiment];

  const flagIcons: { condition: boolean; label: string; icon: string }[] = [
    {
      condition: summary.isControversial,
      label: 'Controversial',
      icon: '⚠',
    },
    { condition: summary.hasEscalation, label: 'Escalating', icon: '↑' },
    { condition: summary.isLowQuality, label: 'Low Quality', icon: '○' },
  ];

  const activeFlags = flagIcons.filter((f) => f.condition);

  return (
    <div className="p-4 rounded-xl bg-gray-800/60 border border-gray-700/50">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
        Content Summary
      </h3>

      {/* Content preview */}
      <div className="mb-3 p-3 rounded-lg bg-gray-900/50 border border-gray-700/30">
        {title && (
          <div className="text-sm font-semibold text-gray-200 mb-1">
            {title}
          </div>
        )}
        <div className="text-xs text-gray-400 line-clamp-3">{body}</div>
      </div>

      {/* AI summary */}
      <div className="mb-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] text-blue-400 font-medium">AI SUMMARY</span>
        </div>
        <p className="text-xs text-gray-300 leading-relaxed">
          {summary.shortSummary}
        </p>
      </div>

      {/* Sentiment + flags */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${sentimentBadge}`}
        >
          {summary.sentiment.toUpperCase()}
        </span>
        {activeFlags.map((flag) => (
          <span
            key={flag.label}
            className="text-[10px] px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-400 border border-gray-600/30"
          >
            {flag.icon} {flag.label}
          </span>
        ))}
        {summary.keyTopics.map((topic) => (
          <span
            key={topic}
            className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20"
          >
            {topic}
          </span>
        ))}
      </div>
    </div>
  );
};
