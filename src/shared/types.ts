/** Severity level for rule violations */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

// ═══════════════════════════════════════════════════════════════════════
// Layer 1: Fast Scoring Engine Types
// ═══════════════════════════════════════════════════════════════════════

/** All signals extracted for risk scoring (5 categories: user, content, rule, behavior, queue) */
export interface ModerationSignals {
  // ── User signals ──
  account_age_days: number;
  account_age_lt_7d: boolean;
  link_karma: number;
  comment_karma: number;
  karma_lt_10: boolean;
  prior_removals_in_sub: number;
  prior_bans_in_sub: number;

  // ── Content signals ──
  word_count: number;
  link_count: number;
  all_caps_ratio: number;
  profanity_score: number;
  spam_word_score: number;
  sentiment_score: number;
  emoji_count: number;

  // ── Rule signals ──
  rule_match_count: number;
  critical_rule_match: boolean;
  high_severity_match: boolean;
  medium_severity_matches: number;
  low_severity_matches: number;

  // ── Behavioral signals ──
  report_count: number;
  downvote_ratio: number;
  posts_in_last_hour: number;

  // ── Queue signals ──
  time_in_queue_ms: number;
  related_item_in_queue: boolean;
}

/** Composite risk score with per-category breakdown for explainability */
export interface RiskScore {
  /** 0-100 composite risk score */
  total: number;
  /** Sub-scores for explainability */
  breakdown: {
    user: number;
    content: number;
    rule: number;
    behavior: number;
    queue: number;
  };
  /** Routing decision based on score thresholds */
  routing: 'no_ai' | 'light_ai' | 'deep_ai';
}

/** Risk buckets — independent categories that prevent double-counting */
export interface RiskBuckets {
  spam: number;
  harassment: number;
  lowQuality: number;
  accountRisk: number;
  uncertainty: number;
  adversarial: number;
  anomaly: number;
  communityConcern: number;
}

/** A single contributing signal with explainability detail */
export interface RiskSignal {
  signal: string;
  contribution: number;
  detail: string;
}

// ═══════════════════════════════════════════════════════════════════════
// Layer 2: AI Context Reasoning Types
// ═══════════════════════════════════════════════════════════════════════

/** A single risk factor identified by AI analysis */
export interface RiskFactor {
  signal: string;
  strength: 'low' | 'moderate' | 'high';
  explanation: string;
}

/** AI's assessment of a specific rule's relevance to the content */
export interface PossibleRuleMatch {
  rule: string;
  relevance: 'unlikely' | 'partial' | 'likely' | 'definite';
  explanation: string;
}

/** AI tone and intent interpretation */
export interface ToneAnalysis {
  primary_tone: string;
  secondary_tones: string[];
  certainty: 'low' | 'moderate' | 'high';
  notes: string;
}

/** Structured AI analysis output — advisory only, never action-determining */
export interface AIAnalysisOutput {
  /** 2-4 sentence neutral summary */
  summary: string;
  /** Risk factors ordered by signal strength */
  risk_factors: RiskFactor[];
  /** How each matched rule relates to this specific content */
  possible_rule_matches: PossibleRuleMatch[];
  /** Tone and intent interpretation */
  tone_analysis: ToneAnalysis;
  /** Summary of similar historical cases */
  precedent_summary: string;
  /** Suggested review approach (advisory only) */
  recommended_review_action: 'approve_likely_safe' | 'moderator_discretion' | 'escalate_for_review';
  /** AI confidence in its analysis (0-1) */
  confidence: number;
  /** Signal augmentation deltas — AI adjusts bucket scores, never overrides decisions */
  augmentation: AIAugmentation;
}

/** AI signal deltas — bounded, confidence-weighted, capped impact */
export interface AIAugmentation {
  harassment_delta: number;    // [-3, +3]
  uncertainty_delta: number;   // [-2, +2]
  adversarial_confirmation: boolean;
  confidence: number;          // [0, 1]
}

// ═══════════════════════════════════════════════════════════════════════
// Precedent Storage Types
// ═══════════════════════════════════════════════════════════════════════

/** Light AI output — fast, cheap, minimal. Used for low-mid ambiguity content. */
export interface LightAIOutput {
  /** 1-2 sentence neutral summary */
  summary: string;
  /** Quick assessment: is this clearly ambiguous and needs deeper review? */
  needs_deep_review: boolean;
  /** Single primary concern, if any */
  primary_concern: string | null;
  /** AI confidence in this quick assessment (0-1) */
  confidence: number;
}

/** A recorded moderation decision used as precedent for future AI analysis */
export interface ModPrecedent {
  id: string;
  contentExcerpt: string;
  riskScore: number;
  ruleMatches: string[];
  aiSummary: string;
  outcome: 'removed' | 'approved' | 'locked' | 'warned' | 'banned';
  moderator: string;
  reason: string;
  timestamp: string;
  subreddit: string;
}

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
  action: 'approve' | 'remove' | 'spam' | 'ban';
  flair?: string;
  confidence: number;
  reasoning: string;
}

/** Pre-computed context cached at trigger time — expand reads this directly */
export interface CachedModContext {
  ruleMatches: RuleMatch[];
  contentSummary: ContentSummary;
  signals: ModerationSignals;
  riskScore: RiskScore;
  buckets: RiskBuckets;
  topSignals: RiskSignal[];
  recommendation: ModRecommendation;
  aiAnalysis: AIAnalysisOutput | null;
  lightAI: LightAIOutput | null;
  computedAt: number;
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
  /** Risk score and routing (Layer 1) */
  riskScore: RiskScore;
  /** Signals extracted for scoring (Layer 1) */
  signals: ModerationSignals;
  /** AI deep analysis — null when AI was not called (Layer 2) */
  aiAnalysis: AIAnalysisOutput | null;
  /** Bucket-level risk scores for explainability (Layer 1) */
  buckets: RiskBuckets;
  /** Top contributing signals, sorted by contribution (Layer 1) */
  topSignals: RiskSignal[];
  meta: {
    generatedAt: string;
    analysisTimeMs: number;
    isMockData: boolean;
    aiAssisted: boolean;
    /** Why AI was or wasn't called */
    aiRoutingReason: string;
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
  action: 'approve' | 'approve_with_flair' | 'remove' | 'spam' | 'ban';
  reason?: string;
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
  recAction: 'approve' | 'approve_with_flair' | 'remove' | 'spam' | 'ban';
  recConfidence: number;
  priority: number;
  riskScore?: number;
  riskRouting?: 'no_ai' | 'light_ai' | 'deep_ai';
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
