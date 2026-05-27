import React from 'react';

interface ConfidenceBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({
  score,
  size = 'md',
}) => {
  const color =
    score >= 80
      ? 'bg-emerald-500'
      : score >= 60
        ? 'bg-yellow-500'
        : score >= 40
          ? 'bg-amber-500'
          : 'bg-red-500';

  const textColor =
    score >= 80
      ? 'text-emerald-400'
      : score >= 60
        ? 'text-yellow-400'
        : score >= 40
          ? 'text-amber-400'
          : 'text-red-400';

  const sizeClasses =
    size === 'lg'
      ? 'text-lg px-3 py-1'
      : size === 'sm'
        ? 'text-xs px-1.5 py-0.5'
        : 'text-sm px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-semibold rounded-full ${sizeClasses} bg-opacity-15 ${color} ${textColor}`}
      style={{ backgroundColor: `${getColorHex(score)}20` }}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${color}`}
      />
      {score}%
    </span>
  );
};

function getColorHex(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#eab308';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}
