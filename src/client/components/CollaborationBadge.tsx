import React from 'react';
import type { CollaborationStatus } from '../../shared/types';

interface CollaborationBadgeProps {
  status: CollaborationStatus;
}

export const CollaborationBadge: React.FC<CollaborationBadgeProps> = ({
  status,
}) => {
  if (!status.isBeingReviewed) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-xs text-gray-400">Available for review</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
      <span className="text-xs text-amber-400">
        Being reviewed by{' '}
        <span className="font-semibold text-amber-300">
          u/{status.reviewerUsername}
        </span>
        {status.startedAt && (
          <span className="text-amber-500/70">
            {' '}
            · {formatTimeAgo(status.startedAt)}
          </span>
        )}
      </span>
    </div>
  );
};

function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
