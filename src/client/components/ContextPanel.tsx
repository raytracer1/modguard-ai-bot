import React from 'react';
import type { ModContext } from '../../shared/types';
import { UserInfoCard } from './UserInfoCard';
import { ContentSummaryCard } from './ContentSummaryCard';
import { RuleMatchCard } from './RuleMatchCard';
import { SimilarCasesPanel } from './SimilarCasesPanel';
import { RecommendationPanel } from './RecommendationPanel';
import { CollaborationBadge } from './CollaborationBadge';

interface ContextPanelProps {
  context: ModContext;
  onDecision: (
    action: 'approve' | 'remove' | 'lock' | 'approve_with_flair',
    flair?: string
  ) => void;
  disabled?: boolean;
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  context,
  onDecision,
  disabled = false,
}) => {
  const { queueItem, userProfile, contentSummary, ruleMatches, similarCases, recommendation, collaboration, meta } = context;

  return (
    <div className="space-y-3">
      {/* Collaboration status */}
      <CollaborationBadge status={collaboration} />

      {/* User info */}
      <UserInfoCard profile={userProfile} />

      {/* Content summary */}
      <ContentSummaryCard
        summary={contentSummary}
        title={queueItem.title}
        body={queueItem.body}
      />

      {/* Rule matches */}
      <RuleMatchCard matches={ruleMatches} />

      {/* Similar cases */}
      <SimilarCasesPanel cases={similarCases} />

      {/* Recommendation + actions */}
      <RecommendationPanel
        recommendation={recommendation}
        queueItemId={queueItem.id}
        onDecision={onDecision}
        disabled={disabled}
      />

      {/* Meta footer */}
      <div className="flex items-center justify-between text-[10px] text-gray-600 px-1">
        <span>
          Generated in {meta.analysisTimeMs}ms
          {meta.isMockData ? ' (mock data)' : ''}
          {meta.aiAssisted ? ' · AI assisted' : ''}
        </span>
        <span>{new Date(meta.generatedAt).toLocaleTimeString()}</span>
      </div>
    </div>
  );
};
