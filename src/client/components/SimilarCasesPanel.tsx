import React from 'react';
import type { SimilarCase } from '../../shared/types';

interface SimilarCasesPanelProps {
  cases: SimilarCase[];
}

export const SimilarCasesPanel: React.FC<SimilarCasesPanelProps> = ({
  cases,
}) => {
  if (cases.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-gray-800/60 border border-gray-700/50">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Similar Cases
        </h3>
        <p className="text-xs text-gray-600 text-center py-3">
          No similar cases found
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-gray-800/60 border border-gray-700/50">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
        Similar Cases ({cases.length})
      </h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {cases.map((c) => (
          <CaseRow key={c.id} caseItem={c} />
        ))}
      </div>
    </div>
  );
};

const CaseRow: React.FC<{ caseItem: SimilarCase }> = ({ caseItem }) => {
  const outcomeStyles = {
    removed: {
      badge: 'bg-red-500/20 text-red-400',
      icon: '✖',
    },
    approved: {
      badge: 'bg-emerald-500/20 text-emerald-400',
      icon: '✔',
    },
    locked: {
      badge: 'bg-amber-500/20 text-amber-400',
      icon: '🔒',
    },
    warned: {
      badge: 'bg-blue-500/20 text-blue-400',
      icon: '⚠',
    },
  };

  const style = outcomeStyles[caseItem.outcome];

  return (
    <div className="p-3 rounded-lg bg-gray-900/40 border border-gray-700/30">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-gray-300 truncate">
            {caseItem.title}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
            {caseItem.summary}
          </div>
        </div>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${style.badge}`}
        >
          {style.icon} {caseItem.outcome}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <span className="text-[10px] text-gray-600">
          Match: {Math.round(caseItem.similarityScore * 100)}%
        </span>
        <span className="text-[10px] text-gray-600">
          {formatDate(caseItem.resolvedAt)}
        </span>
      </div>
      <div className="text-[10px] text-gray-500 mt-1 italic">
        {caseItem.outcomeReason}
      </div>
    </div>
  );
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
