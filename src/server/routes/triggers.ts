import { Hono } from 'hono';
import type { TriggerRequest, TriggerResponse } from '@devvit/web/shared';
import { context, redis } from '@devvit/web/server';
import type { CachedModContext } from '../../shared/types';
import { analyzeContent, generateContentSummary, loadCustomRules } from '../core/rule-engine';
import { computeFullScore, extractSignals, generateRecommendation } from '../core/scoring-engine';
import { shouldCallAI, callLightAI, callAIForDeepAnalysis } from '../core/ai-enhance';
import { createPost } from '../core/post';
import type { ModPrecedent } from '../../shared/types';

const QUEUE_KEY = 'mg:queue';

async function loadPrecedents(): Promise<ModPrecedent[]> {
  try {
    const raw = await redis.get('mg:precedents');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// Track user posting activity for scoring engine
async function trackUserActivity(author: string): Promise<void> {
  try {
    const now = Date.now();
    const lastPostKey = `mg:user:${author}:last_post_ts`;
    const countKey = `mg:user:${author}:post_count_1h`;

    const lastRaw = await redis.get(lastPostKey);
    if (lastRaw) {
      const lastTs = parseInt(lastRaw, 10);
      if (now - lastTs < 3_600_000) {
        await redis.incrBy(countKey, 1);
      } else {
        await redis.set(countKey, '1');
      }
    } else {
      await redis.set(countKey, '1');
    }
    await redis.set(lastPostKey, String(now));
    await redis.expire(countKey, 3600);
  } catch {
    // non-critical
  }
}

// Build and cache full context (including AI for grey zone) at trigger time
async function buildCachedContext(params: {
  itemId: string;
  title: string;
  body: string;
  author: string;
  type: 'post' | 'comment';
  reportCount: number;
  score: number;
  createdAt: string;
  subreddit: string;
  ruleMatches: ReturnType<typeof analyzeContent>;
}): Promise<CachedModContext> {
  const { itemId, title, body, author, type, reportCount, score, createdAt, subreddit, ruleMatches } = params;

  const fullScore = await computeFullScore({ author, title, body, reportCount, score, createdAt, ruleMatches, subreddit });
  const signals = await extractSignals({ author, title, body, reportCount, score, createdAt, ruleMatches, subreddit });
  const contentSummary = generateContentSummary(title, body, ruleMatches);

  const riskScore = fullScore.riskScore;

  // AI — async: start call but don't block queue insertion
  let aiAnalysis = null;
  let lightAI = null;
  const aiRouting = riskScore.routing;

  if (await shouldCallAI(aiRouting)) {
    const matchedRules = ruleMatches
      .filter((m) => m.matched)
      .map((m) => ({ name: m.rule.title, severity: m.severity, reason: m.reason, confidence: m.confidence }));

    if (aiRouting === 'light_ai') {
      // Light AI: fully async, never blocks trigger (patch #5)
      callLightAI({ title, body, author, matchedRules, riskScore: riskScore.total })
        .then((result) => {
          if (!result) return;
          // Update cache with light AI result
          redis.get(`mg:context:${itemId}`).then((raw) => {
            if (!raw) return;
            const ctx = JSON.parse(raw) as CachedModContext;
            ctx.lightAI = result;
            if (!ctx.aiAnalysis) {
              ctx.recommendation = generateRecommendation(ctx.ruleMatches, ctx.riskScore, ctx.buckets, result.summary, result.augmentation ?? null);
            }
            redis.set(`mg:context:${itemId}`, JSON.stringify(ctx)).catch(() => {});
          }).catch(() => {});
          // Escalate to deep if needed
          if (result.needs_deep_review) {
            loadPrecedents().then((precedents) => {
              const relevant = precedents.filter((p) => p.outcome === 'removed' || p.outcome === 'approved').slice(0, 5);
              callAIForDeepAnalysis({ title, body, author, type, signals, riskScore, matchedRules, recentUserContent: [], precedents: relevant })
                .then((deep) => { if (deep) updateCachedContext(itemId, deep); })
                .catch(() => {});
            }).catch(() => {});
          }
        }).catch(() => {});
    } else {
      // Deep AI: full analysis. Start in background, don't block queue.
      // Load precedents for context (patch #6)
      loadPrecedents().then((precedents) => {
        const relevant = precedents
          .filter((p) => p.outcome === 'removed' || p.outcome === 'approved')
          .slice(0, 5);
        const aiInput = { title, body, author, type, signals, riskScore, matchedRules, recentUserContent: [], precedents: relevant };
        callAIForDeepAnalysis(aiInput).then((result) => {
          if (result) updateCachedContext(itemId, result);
        }).catch(() => {});
      }).catch(() => {});
    }
  }

  const recommendation = generateRecommendation(ruleMatches, riskScore, fullScore.buckets, aiAnalysis?.summary ?? lightAI?.summary, aiAnalysis?.augmentation ?? null);

  // Helper to update cached context when background AI completes
  async function updateCachedContext(id: string, result: AIAnalysisOutput) {
    try {
      const raw = await redis.get(`mg:context:${id}`);
      if (raw) {
        const ctx = JSON.parse(raw) as CachedModContext;
        ctx.aiAnalysis = result;
        ctx.recommendation = generateRecommendation(ctx.ruleMatches, ctx.riskScore, ctx.buckets, result.summary, result.augmentation ?? null);
        await redis.set(`mg:context:${id}`, JSON.stringify(ctx));
      }
    } catch { /* non-critical */ }
  }

  const cached: CachedModContext = {
    ruleMatches,
    contentSummary,
    signals,
    riskScore,
    buckets: fullScore.buckets,
    topSignals: fullScore.topSignals,
    recommendation,
    aiAnalysis,
    lightAI,
    computedAt: Date.now(),
  };

  await redis.set(`mg:context:${itemId}`, JSON.stringify(cached));
  await redis.expire(`mg:context:${itemId}`, 600);

  return cached;
}

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await createPost();
    const input = await c.req.json<TriggerRequest>();

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Post created in subreddit ${context.subredditName} with id ${post.id} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to create post',
      },
      400
    );
  }
});

triggers.post('/on-content-create', async (c) => {
  try {
    const input = await c.req.json<TriggerRequest>();
    const customRules = await loadCustomRules();

    if (input.type === 'PostCreate') {
      const post = input.post;
      if (!post?.id) {
        return c.json<TriggerResponse>({ status: 'success' }, 200);
      }

      const title = post.title ?? '';
      const body = post.selftext ?? '';
      const author = input.author?.name ?? 'unknown';

      // Track user activity for scoring engine (fire-and-forget)
      trackUserActivity(author);

      const matches = analyzeContent(title, body, author, customRules);
      const primary = matches.find((m) => m.matched);

      const reportCount = post.numReports ?? 0;
      const score = post.score ?? 0;

      // ── Recall-first: ALL content scored, no silent drops ──
      const createdAt = new Date((post.createdAt ?? 0) * 1000).toISOString();
      const subreddit = context.subredditName ?? 'unknown';

      const cached = await buildCachedContext({
        itemId: post.id,
        title, body, author,
        type: 'post',
        reportCount,
        score,
        createdAt,
        subreddit,
        ruleMatches: matches,
      });

      const { riskScore } = cached;
      const total = riskScore.total;

      // ── Recall safety net — multiple triggers prevent silent drops ──
      let shouldQueue = true;

      if (total < 5) {
        // Base random sampling: 5% of minimal-risk content enters queue
        const sampled = Math.random() < 0.05;

        // New user boost: accounts < 7 days always enter queue
        const isNewUser = (cached.signals?.account_age_lt_7d) ?? false;

        // Uncertainty + adversarial boost: even if total is low, these signal risk
        const hasHiddenRisk = (cached.buckets?.uncertainty ?? 0) >= 5
          || (cached.buckets?.adversarial ?? 0) >= 3
          || (cached.buckets?.anomaly ?? 0) >= 3;

        shouldQueue = sampled || isNewUser || hasHiddenRisk;
      }

      if (shouldQueue) {
        const flag = primary
          ? primary.rule.title
          : (total >= 5 ? 'Uncertain content' : 'Low-risk sample');
        const flagSeverity = primary ? primary.severity : (total >= 10 ? 'medium' : 'low');

        const queueTier = total >= 15 ? 'high' : total >= 5 ? 'standard' : 'low';

        const severityWeight: Record<string, number> = { critical: 100, high: 75, medium: 50, low: 25 };
        const priority = total + (severityWeight[flagSeverity] ?? 25) * 0.3;

        const item = {
          id: post.id,
          title, body, author,
          type: 'post' as const,
          reportCount,
          score,
          createdAt,
          flag,
          flagSeverity,
          recAction: cached.recommendation.action,
          recConfidence: cached.recommendation.confidence,
          priority,
          riskScore: total,
          riskRouting: riskScore.routing,
          queueTier,
        };

        const raw = await redis.get(QUEUE_KEY);
        const queue = raw ? JSON.parse(raw) : [];
        const filtered = queue.filter((q: { id: string }) => q.id !== item.id);
        filtered.unshift(item);
        const trimmed = filtered.slice(0, 100);
        await redis.set(QUEUE_KEY, JSON.stringify(trimmed));
      }
    }

    if (input.type === 'CommentCreate') {
      const comment = input.comment;
      if (!comment?.id) {
        return c.json<TriggerResponse>({ status: 'success' }, 200);
      }

      const body = comment.body ?? '';
      const author = comment.author ?? 'unknown';

      // Track user activity for scoring engine (fire-and-forget)
      trackUserActivity(author);

      const matches = analyzeContent('', body, author, customRules);
      const primary = matches.find((m) => m.matched);

      const reportCount = comment.numReports ?? 0;
      const score = comment.score ?? 0;

      const createdAt = new Date((comment.createdAt ?? 0) * 1000).toISOString();
      const subreddit = context.subredditName ?? 'unknown';

      const cached = await buildCachedContext({
        itemId: comment.id,
        title: '', body, author,
        type: 'comment',
        reportCount,
        score,
        createdAt,
        subreddit,
        ruleMatches: matches,
      });

      const { riskScore } = cached;
      const total = riskScore.total;

      let shouldQueue = true;
      if (total < 5) {
        const sampled = Math.random() < 0.05;
        const isNewUser = (cached.signals?.account_age_lt_7d) ?? false;
        const u = cached.buckets?.uncertainty ?? 0;
        const a = cached.buckets?.adversarial ?? 0;
        const an = cached.buckets?.anomaly ?? 0;
        const recallWeighted = u * 0.40 + a * 0.35 + an * 0.25;
        const recallGate = recallWeighted >= 5.5 && u >= 3;
        shouldQueue = sampled || isNewUser || recallGate;
      }

      if (shouldQueue) {
        const flag = primary
          ? primary.rule.title
          : (total >= 5 ? 'Uncertain content' : 'Low-risk sample');
        const flagSeverity = primary ? primary.severity : (total >= 10 ? 'medium' : 'low');
        const queueTier = total >= 15 ? 'high' : total >= 5 ? 'standard' : 'low';

        const severityWeight: Record<string, number> = { critical: 100, high: 75, medium: 50, low: 25 };
        const priority = total + (severityWeight[flagSeverity] ?? 25) * 0.3;

        const item = {
          id: comment.id,
          title: '', body, author,
          type: 'comment' as const,
          reportCount,
          score,
          createdAt,
          flag,
          flagSeverity,
          recAction: cached.recommendation.action,
          recConfidence: cached.recommendation.confidence,
          priority,
          riskScore: total,
          riskRouting: riskScore.routing,
          queueTier,
        };

        const raw = await redis.get(QUEUE_KEY);
        const queue = raw ? JSON.parse(raw) : [];
        const filtered = queue.filter((q: { id: string }) => q.id !== item.id);
        filtered.unshift(item);
        const trimmed = filtered.slice(0, 100);
        await redis.set(QUEUE_KEY, JSON.stringify(trimmed));
      }
    }

    return c.json<TriggerResponse>({ status: 'success' }, 200);
  } catch (error) {
    console.error('Content trigger error:', error);
    return c.json<TriggerResponse>({ status: 'error' }, 500);
  }
});

// ── Cleanup: remove deleted content from queue ──

triggers.post('/on-content-delete', async (c) => {
  try {
    const input = await c.req.json<TriggerRequest>();
    let deletedId: string | undefined;

    if (input.type === 'PostDelete') {
      deletedId = input.postId;
    } else if (input.type === 'CommentDelete') {
      deletedId = input.commentId;
    }

    if (deletedId) {
      const raw = await redis.get('mg:queue');
      if (raw) {
        const queue = JSON.parse(raw);
        const filtered = queue.filter(
          (q: { id: string }) => q.id !== deletedId
        );
        if (filtered.length !== queue.length) {
          await redis.set('mg:queue', JSON.stringify(filtered));
        }
      }
    }

    return c.json<TriggerResponse>({ status: 'success' }, 200);
  } catch (error) {
    console.error('Delete trigger error:', error);
    return c.json<TriggerResponse>({ status: 'error' }, 500);
  }
});

// ── Mod action: sync approve/remove/spam/lock to queue ──

triggers.post('/on-mod-action', async (c) => {
  try {
    const input = await c.req.json<TriggerRequest>();
    if (input.type !== 'ModAction') {
      return c.json<TriggerResponse>({ status: 'success' }, 200);
    }

    const targetId =
      input.targetPost?.id ?? input.targetComment?.id;

    if (targetId) {
      const raw = await redis.get('mg:queue');
      if (raw) {
        const queue = JSON.parse(raw);
        const before = queue.length;
        const filtered = queue.filter(
          (q: { id: string }) => q.id !== targetId
        );
        if (filtered.length !== before) {
          await redis.set('mg:queue', JSON.stringify(filtered));
        }
      }
    }

    return c.json<TriggerResponse>({ status: 'success' }, 200);
  } catch (error) {
    console.error('Mod action trigger error:', error);
    return c.json<TriggerResponse>({ status: 'error' }, 500);
  }
});
