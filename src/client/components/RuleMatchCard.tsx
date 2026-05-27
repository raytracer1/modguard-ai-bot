import React from 'react';
import type { RuleMatch } from '../../shared/types';

interface RuleMatchCardProps {
  matches: RuleMatch[];
}

export const RuleMatchCard: React.FC<RuleMatchCardProps> = ({ matches }) => {
  const matchedRules = matches.filter((m) => m.matched);
  const hasViolations = matchedRules.length > 0;

  return (
    <div className="p-4 rounded-xl bg-gray-800/60 border border-gray-700/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Rule Analysis
        </h3>
        {hasViolations ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
            {matchedRules.length} FLAGGED
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
            CLEAR
          </span>
        )}
      </div>

      {hasViolations ? (
        <div className="space-y-2">
          {matchedRules.map((match) => (
            <RuleMatchRow key={match.rule.id} match={match} />
          ))}
        </div>
      ) : (
        <div className="text-xs text-gray-500 text-center py-3">
          No rule violations detected
        </div>
      )}

      {/* Also show non-matched rules in collapsed view */}
      {hasViolations && matchedRules.length < matches.length && (
        <details className="mt-2">
          <summary className="text-[10px] text-gray-600 cursor-pointer hover:text-gray-400">
            +{matches.length - matchedRules.length} rules checked (no match)
          </summary>
          <div className="mt-1 space-y-1">
            {matches
              .filter((m) => !m.matched)
              .map((m) => (
                <div
                  key={m.rule.id}
                  className="text-[10px] text-gray-600 px-2 py-1"
                >
                  {m.rule.title} — No match
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  );
};

const RuleMatchRow: React.FC<{ match: RuleMatch }> = ({ match }) => {
  const severityStyles = {
    critical: {
      border: 'border-red-500/40',
      bg: 'bg-red-500/5',
      badge: 'bg-red-500/20 text-red-400',
      bar: 'bg-red-500',
    },
    high: {
      border: 'border-orange-500/40',
      bg: 'bg-orange-500/5',
      badge: 'bg-orange-500/20 text-orange-400',
      bar: 'bg-orange-500',
    },
    medium: {
      border: 'border-amber-500/40',
      bg: 'bg-amber-500/5',
      badge: 'bg-amber-500/20 text-amber-400',
      bar: 'bg-amber-500',
    },
    low: {
      border: 'border-blue-500/30',
      bg: 'bg-blue-500/5',
      badge: 'bg-blue-500/20 text-blue-400',
      bar: 'bg-blue-500',
    },
  };

  const style = severityStyles[match.severity];

  return (
    <div
      className={`p-3 rounded-lg border ${style.border} ${style.bg}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${style.badge}`}>
            {match.severity.toUpperCase()}
          </span>
          <span className="text-xs font-medium text-gray-300">
            Rule {match.rule.index}: {match.rule.title}
          </span>
        </div>
        <span className="text-[10px] font-mono text-gray-500">
          {match.confidence}%
        </span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{match.reason}</p>
      <div className="mt-1.5 h-1 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${style.bar} transition-all`}
          style={{ width: `${match.confidence}%` }}
        />
      </div>
    </div>
  );
};
