export type InitResponse = {
  type: 'init';
  postId: string;
  count: number;
  username: string;
};

export type IncrementResponse = {
  type: 'increment';
  postId: string;
  count: number;
};

export type DecrementResponse = {
  type: 'decrement';
  postId: string;
  count: number;
};

export type {
  Severity,
  SubredditRule,
  RuleMatch,
  UserProfile,
  UserContentSummary,
  ContentSummary,
  SimilarCase,
  ModRecommendation,
  CollaborationStatus,
  ModContext,
  ContextResponse,
  DecisionRequest,
  DecisionResponse,
  ModStats,
  StatsResponse,
  ErrorResponse,
  QueueItem,
  QueueResponse,
} from './types';
