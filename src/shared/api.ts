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
  CustomRule,
  ModerationSignals,
  RiskScore,
  AIAnalysisOutput,
  AIAugmentation,
  LightAIOutput,
  RiskFactor,
  PossibleRuleMatch,
  ToneAnalysis,
  ModPrecedent,
  RiskBuckets,
  RiskSignal,
  CachedModContext,
} from './types';
