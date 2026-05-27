/** Severity level for rule violations */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

/** A subreddit rule definition */
export interface SubredditRule {
  id: string;
  index: number;
  title: string;
  description: string;
  category: 'content' | 'behavior' | 'security' | 'format';
}

/** A single rule match result */
export interface RuleMatch {
  rule: SubredditRule;
  matched: boolean;
  confidence: number;
  reason: string;
  severity: Severity;
}

/** User profile information for context */
export interface UserProfile {
  username: string;
  accountCreated: string;
  accountAgeDays: number;
  karma: number;
  commentKarma: number;
  isNewAccount: boolean;
  previousViolations: number;
  recentPosts: UserContentSummary[];
}

/** Summary of a user's recent content */
export interface UserContentSummary {
  id: string;
  type: 'post' | 'comment';
  title: string;
  body: string;
  subreddit: string;
  createdAt: string;
  score: number;
  removed: boolean;
}

/** AI-generated or rule-based content summary */
export interface ContentSummary {
  shortSummary: string;
  isControversial: boolean;
  hasEscalation: boolean;
  isLowQuality: boolean;
  sentiment: 'positive' | 'neutral' | 'negative' | 'hostile';
  keyTopics: string[];
}

/** A historical similar case */
export interface SimilarCase {
  id: string;
  title: string;
  summary: string;
  outcome: 'removed' | 'approved' | 'locked' | 'warned';
  outcomeReason: string;
  similarityScore: number;
  resolvedAt: string;
}

/** Recommended moderation action */
export interface ModRecommendation {
  action: 'approve' | 'remove' | 'lock' | 'approve_with_flair';
  flair?: string;
  confidence: number;
  reasoning: string;
}

/** Collaboration status for an item */
export interface CollaborationStatus {
  isBeingReviewed: boolean;
  reviewerUsername?: string;
  startedAt?: string;
}

/** Complete mod context for a single queue item */
export interface ModContext {
  queueItem: {
    id: string;
    type: 'post' | 'comment';
    title: string;
    body: string;
    author: string;
    createdAt: string;
    score: number;
    reportCount: number;
    subreddit: string;
  };
  userProfile: UserProfile;
  contentSummary: ContentSummary;
  ruleMatches: RuleMatch[];
  similarCases: SimilarCase[];
  recommendation: ModRecommendation;
  collaboration: CollaborationStatus;
  meta: {
    generatedAt: string;
    analysisTimeMs: number;
    isMockData: boolean;
    aiAssisted: boolean;
  };
}

/** API response for context request */
export interface ContextResponse {
  type: 'context';
  data: ModContext;
}

/** API response for decision recording */
export interface DecisionRequest {
  queueItemId: string;
  action: 'approve' | 'remove' | 'lock' | 'approve_with_flair';
  flair?: string;
  moderatorNote?: string;
}

export interface DecisionResponse {
  type: 'decision';
  status: 'recorded' | 'error';
  message: string;
}

/** Stats for the success metrics dashboard */
export interface ModStats {
  totalAnalyzed: number;
  averageTimeSavedSeconds: number;
  aiAssistedPercentage: number;
  contextSwitchesReduced: number;
}

export interface StatsResponse {
  type: 'stats';
  data: ModStats;
}

/** Error response */
export interface ErrorResponse {
  status: 'error';
  message: string;
}

/** A custom rule configured by moderators */
export interface CustomRule {
  name: string;
  patterns: string[];
  severity: Severity;
  description: string;
  enabled: boolean;
}

/** Queue item for the list view */
export interface QueueItem {
  id: string;
  title: string;
  body: string;
  author: string;
  type: 'post' | 'comment';
  reportCount: number;
  score: number;
  createdAt: string;
  flag: string;
  flagSeverity: Severity;
  recAction: 'approve' | 'remove' | 'lock' | 'approve_with_flair';
  recConfidence: number;
  reviewing?: {
    username: string;
    since: number;
  };
}

/** API response for queue list */
export interface QueueResponse {
  type: 'queue';
  items: QueueItem[];
}
