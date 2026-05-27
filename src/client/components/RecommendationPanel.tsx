import React from 'react';
import type { ModRecommendation } from '../../shared/types';
import { ConfidenceBadge } from './ConfidenceBadge';

interface RecommendationPanelProps {
  recommendation: ModRecommendation;
  queueItemId: string;
  onDecision: (
    action: 'approve' | 'remove' | 'lock' | 'approve_with_flair',
    flair?: string
  ) => void;
  disabled?: boolean;
}

export const RecommendationPanel: React.FC<RecommendationPanelProps> = ({
  recommendation,
  onDecision,
  disabled = false,
}) => {
  const actionConfig = {
    approve: {
      label: 'Approve',
      icon: '✔',
      color: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      ring: 'ring-emerald-500/50',
    },
    remove: {
      label: 'Remove',
      icon: '✖',
      color: 'bg-red-600 hover:bg-red-500 text-white',
      ring: 'ring-red-500/50',
    },
    lock: {
      label: 'Lock',
      icon: '🔒',
      color: 'bg-amber-600 hover:bg-amber-500 text-white',
      ring: 'ring-amber-500/50',
    },
    approve_with_flair: {
      label: 'Approve + Flair',
      icon: '🏷',
      color: 'bg-blue-600 hover:bg-blue-500 text-white',
      ring: 'ring-blue-500/50',
    },
  };

  const recommended = actionConfig[recommendation.action];
  const isRecommended = (action: string) => action === recommendation.action;

  return (
    <div className="p-4 rounded-xl bg-gray-800/60 border border-gray-700/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Recommended Action
        </h3>
        <ConfidenceBadge score={recommendation.confidence} />
      </div>

      {/* Recommendation reasoning */}
      <div className="mb-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <p className="text-xs text-gray-300 leading-relaxed">
          {recommendation.reasoning}
        </p>
      </div>

      {/* Primary recommended action */}
      <div className="mb-3">
        <button
          disabled={disabled}
          onClick={() => onDecision(recommendation.action)}
          className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${recommended.color} ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          } ring-1 ${recommended.ring}`}
        >
          <span className="flex items-center justify-center gap-2">
            <span>{recommended.icon}</span>
            <span>{recommended.label}</span>
            <span className="text-[10px] opacity-70">(Recommended)</span>
          </span>
        </button>
      </div>

      {/* Other actions */}
      <div className="grid grid-cols-3 gap-2">
        {(
          Object.entries(actionConfig) as [
            string,
            (typeof actionConfig)[keyof typeof actionConfig],
          ][]
        )
          .filter(([key]) => key !== recommendation.action)
          .map(([key, config]) => (
            <button
              key={key}
              disabled={disabled}
              onClick={() =>
                onDecision(
                  key as 'approve' | 'remove' | 'lock' | 'approve_with_flair'
                )
              }
              className={`py-2 px-2 rounded-lg text-xs font-medium transition-all border border-gray-600 hover:border-gray-500 text-gray-400 hover:text-gray-200 ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              } ${isRecommended(key) ? 'ring-1 ' + config.ring : ''}`}
            >
              <span className="flex items-center justify-center gap-1">
                <span>{config.icon}</span>
                <span>{config.label}</span>
              </span>
            </button>
          ))}
      </div>

      <p className="text-[10px] text-gray-600 text-center mt-3">
        All actions are suggestions. Final decision is yours.
      </p>
    </div>
  );
};
