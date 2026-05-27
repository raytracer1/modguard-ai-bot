import type { ModContext, ModRecommendation, RuleMatch, RiskScore, AIAnalysisOutput, ModPrecedent, CachedModContext, ModerationSignals, RiskBuckets, RiskSignal } from '../../shared/types';
import { analyzeContent, generateContentSummary, loadCustomRules } from './rule-engine';
import { extractSignals, computeFullScore, generateRecommendation } from './scoring-engine';
import { shouldCallAI, callAIForDeepAnalysis } from './ai-enhance';
import { redis } from '@devvit/web/server';

export interface QueueItemInput {
  id: string;
  type: 'post' | 'comment';
  title: string;
  body: string;
  author: string;
  createdAt: string;
  score: number;
  reportCount: number;
  subreddit: string;
  upvoteRatio?: number;
}

// ═══════════════════════════════════════════════════════════════════════
// Precedent Management
// ═══════════════════════════════════════════════════════════════════════

const PRECEDENTS_KEY = 'mg:precedents';
const MAX_PRECEDENTS = 500;

async function loadPrecedents(): Promise<ModPrecedent[]> {
  try {
    const raw = await redis.get(PRECEDENTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ModPrecedent[];
  } catch {
    return [];
  }
}

export async function recordPrecedent(precedent: ModPrecedent): Promise<void> {
  try {
    const precedents = await loadPrecedents();
    precedents.unshift(precedent);
    if (precedents.length > MAX_PRECEDENTS) {
      precedents.length = MAX_PRECEDENTS;
    }
    await redis.set(PRECEDENTS_KEY, JSON.stringify(precedents));
  } catch {
    // non-critical — precedent recording failure shouldn't block moderation
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Main Context Generation (Three-Layer Orchestration)
// ═══════════════════════════════════════════════════════════════════════

export async function generateModContext(
  item: QueueItemInput,
): Promise<ModContext> {
  const startTime = Date.now();

  // ── Read cached context from trigger phase ──
  let cached: CachedModContext | null = null;
  try {
    const raw = await redis.get(`mg:context:${item.id}`);
    if (raw) cached = JSON.parse(raw);
  } catch { /* fall through */ }

  // ── Fallback: compute live if cache miss (legacy items, expired cache) ──
  let ruleMatches: RuleMatch[];
  let contentSummary: ReturnType<typeof generateContentSummary>;
  let signals: ModerationSignals;
  let riskScore: RiskScore;
  let buckets: RiskBuckets;
  let topSignals: RiskSignal[];
  let aiAnalysis: AIAnalysisOutput | null = null;
  let aiAssisted = false;

  if (cached) {
    ruleMatches = cached.ruleMatches;
    contentSummary = cached.contentSummary;
    signals = cached.signals;
    riskScore = cached.riskScore;
    buckets = cached.buckets;
    topSignals = cached.topSignals;
    // AI already computed at trigger time (stored in mg:context)
    aiAnalysis = cached.aiAnalysis;
    if (!aiAnalysis && cached.lightAI) {
      // Light AI summary as fallback display
      contentSummary.shortSummary = cached.lightAI.summary;
    }
    if (aiAnalysis) {
      aiAssisted = true;
      contentSummary.shortSummary = aiAnalysis.summary;
    }
  } else {
    const customRules = await loadCustomRules();
    ruleMatches = analyzeContent(item.title, item.body, item.author, customRules);
    contentSummary = generateContentSummary(item.title, item.body, ruleMatches);

    const fullScore = await computeFullScore({
      author: item.author, title: item.title, body: item.body,
      reportCount: item.reportCount, score: item.score,
      upvoteRatio: item.upvoteRatio, createdAt: item.createdAt,
      ruleMatches, subreddit: item.subreddit,
    });
    signals = await extractSignals({
      author: item.author, title: item.title, body: item.body,
      reportCount: item.reportCount, score: item.score,
      upvoteRatio: item.upvoteRatio, createdAt: item.createdAt,
      ruleMatches, subreddit: item.subreddit,
    });
    riskScore = fullScore.riskScore;
    buckets = fullScore.buckets;
    topSignals = fullScore.topSignals;
  }

  // ── Layer 2: AI (already in cache from trigger, or fallback for legacy items) ──
  let aiRoutingReason: string;

  if (aiAnalysis) {
    aiRoutingReason = `AI deep analysis complete (risk score: ${riskScore.total}/100)`;
  } else if (cached?.lightAI) {
    aiRoutingReason = `AI light scan complete (risk score: ${riskScore.total}/100)`;
  } else if (riskScore.routing === 'no_ai') {
    aiRoutingReason = `AI skipped — risk minimal (score: ${riskScore.total}/100, threshold: 5)`;
  } else {
    // Legacy fallback: cache miss, compute AI live
    const useAI = await shouldCallAI(riskScore.routing);
    if (useAI) {
      const precedents = await loadPrecedents();
      const aiInput = {
        title: item.title, body: item.body, author: item.author, type: item.type,
        signals, riskScore,
        matchedRules: ruleMatches.filter((m) => m.matched).map((m) => ({
          name: m.rule.title, severity: m.severity, reason: m.reason, confidence: m.confidence,
        })),
        recentUserContent: [],
        precedents: precedents.filter((p) => p.outcome === 'removed' || p.outcome === 'approved').slice(0, 5),
      };
      aiAnalysis = await callAIForDeepAnalysis(aiInput);
      if (aiAnalysis) {
        aiAssisted = true;
        contentSummary.shortSummary = aiAnalysis.summary;
        aiRoutingReason = `AI analysis (legacy fallback, risk score: ${riskScore.total}/100)`;
      } else {
        aiRoutingReason = `AI failed — rule-engine fallback (risk score: ${riskScore.total}/100)`;
      }
    } else {
      aiRoutingReason = `AI skipped — not configured or circuit breaker open (score: ${riskScore.total}/100)`;
    }
  }

  // ── Recommendation: cached (already includes AI if precomputed) or fallback ──
  const recommendation: ModRecommendation = cached
    ? cached.recommendation
    : generateRecommendation(ruleMatches, riskScore, buckets, aiAnalysis?.summary, aiAnalysis?.augmentation ?? null);

  // ── Try to load user profile from cache ──
  let userProfile = {
    username: item.author,
    accountCreated: '',
    accountAgeDays: signals.account_age_days,
    karma: signals.link_karma + signals.comment_karma,
    commentKarma: signals.comment_karma,
    isNewAccount: signals.account_age_lt_7d,
    previousViolations: signals.prior_removals_in_sub,
    recentPosts: [] as Array<{
      id: string;
      type: 'post' | 'comment';
      title: string;
      body: string;
      subreddit: string;
      createdAt: string;
      score: number;
      removed: boolean;
    }>,
  };

  try {
    const cachedRaw = await redis.get(`mg:user-profile:${item.author}`);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      userProfile = {
        ...userProfile,
        accountCreated: cached.accountCreated ?? '',
        accountAgeDays: cached.accountAgeDays ?? signals.account_age_days,
        karma: cached.karma ?? signals.link_karma + signals.comment_karma,
        commentKarma: cached.commentKarma ?? signals.comment_karma,
        isNewAccount: signals.account_age_lt_7d,
        recentPosts: cached.recentPosts ?? [],
      };
    }
  } catch {
    // use defaults
  }

  return {
    queueItem: item,
    userProfile,
    contentSummary,
    ruleMatches,
    similarCases: [],
    recommendation,
    collaboration: { isBeingReviewed: false },
    riskScore,
    signals,
    aiAnalysis,
    buckets,
    topSignals,
    meta: {
      generatedAt: new Date().toISOString(),
      analysisTimeMs: Date.now() - startTime,
      isMockData: false,
      aiAssisted,
      aiRoutingReason,
    },
  };
}

