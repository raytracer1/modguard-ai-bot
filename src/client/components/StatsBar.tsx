import React from 'react';

interface StatsBarProps {
  totalAnalyzed: number;
  averageTimeSavedSeconds: number;
  aiAssistedPercentage: number;
  contextSwitchesReduced: number;
}

export const StatsBar: React.FC<StatsBarProps> = ({
  totalAnalyzed,
  averageTimeSavedSeconds,
  aiAssistedPercentage,
  contextSwitchesReduced,
}) => {
  return (
    <div className="px-4 py-2 bg-gray-800/40 border-b border-gray-700/50">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">ANALYZED</span>
          <span className="text-xs font-bold text-gray-200">{totalAnalyzed}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">AVG SAVED</span>
          <span className="text-xs font-bold text-emerald-400">
            {averageTimeSavedSeconds}s
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">AI BOOST</span>
          <span className="text-xs font-bold text-blue-400">
            {aiAssistedPercentage}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">SWITCHES CUT</span>
          <span className="text-xs font-bold text-purple-400">
            {contextSwitchesReduced}
          </span>
        </div>
      </div>
    </div>
  );
};
