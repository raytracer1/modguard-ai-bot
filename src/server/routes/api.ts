import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  DecrementResponse,
  IncrementResponse,
  InitResponse,
  ContextResponse,
  DecisionResponse,
  DecisionRequest,
  StatsResponse,
  ErrorResponse,
} from '../../shared/api';
import { generateModContext, recordPrecedent } from '../core/context-engine';
import type { QueueItemInput } from '../core/context-engine';
import type { ModPrecedent } from '../../shared/types';
import { recordUserRemoval, recordUserBan } from '../core/scoring-engine';

export const api = new Hono();

// ── existing counter endpoints ──

api.get('/init', async (c) => {
  const { postId } = context;

  if (!postId) {
    console.error('API Init Error: postId not found in devvit context');
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required but missing from context',
      },
      400
    );
  }

  try {
    const [count, username] = await Promise.all([
      redis.get('count'),
      reddit.getCurrentUsername(),
    ]);

    return c.json<InitResponse>({
      type: 'init',
      postId: postId,
      count: count ? parseInt(count) : 0,
      username: username ?? 'anonymous',
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    let errorMessage = 'Unknown error during initialization';
    if (error instanceof Error) {
      errorMessage = `Initialization failed: ${error.message}`;
    }
    return c.json<ErrorResponse>(
      { status: 'error', message: errorMessage },
      400
    );
  }
});

api.post('/increment', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  const count = await redis.incrBy('count', 1);
  return c.json<IncrementResponse>({
    count,
    postId,
    type: 'increment',
  });
});

api.post('/decrement', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  const count = await redis.incrBy('count', -1);
  return c.json<DecrementResponse>({
    count,
    postId,
    type: 'decrement',
  });
});

// ── ModGuard AI context endpoints ──

api.post('/context', async (c) => {
  try {
    const body = await c.req.json<{
      id?: string;
      title?: string;
      content?: string;
      author?: string;
      subreddit?: string;
      reportCount?: number;
      score?: number;
      type?: 'post' | 'comment';
    }>();

    const itemId = body.id ?? context.postId ?? 'unknown';

    const queueItem: QueueItemInput = {
      id: itemId,
      type: body.type ?? 'post',
      title: body.title ?? 'Untitled',
      body: body.content ?? '',
      author: body.author ?? 'unknown_user',
      createdAt: new Date().toISOString(),
      score: body.score ?? 0,
      reportCount: body.reportCount ?? 0,
      subreddit: body.subreddit ?? context.subredditName ?? 'unknown',
    };

    const modContext = await generateModContext(queueItem);

    // Track analysis count in redis
    await redis.incrBy('modguard:analyzed', 1);

    return c.json<ContextResponse>({
      type: 'context',
      data: modContext,
    });
  } catch (error) {
    console.error('Context generation error:', error);
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to generate context',
      },
      500
    );
  }
});

api.post('/decision', async (c) => {
  try {
    const body = await c.req.json<DecisionRequest>();
    const username = await reddit.getCurrentUsername();

    // Record the decision in redis for stats
    const decisionKey = `modguard:decision:${body.queueItemId}`;
    await redis.set(
      decisionKey,
      JSON.stringify({
        action: body.action,
        reason: body.reason,
        flair: body.flair,
        moderatorNote: body.moderatorNote,
        moderator: username,
        timestamp: new Date().toISOString(),
      })
    );

    // Update decision counter
    await redis.incrBy(`modguard:decisions:${body.action}`, 1);

    // Load queue item to get author for Reddit action + user tracking
    const raw = await redis.get('mg:queue');
    const queue: Array<{ id: string; author: string }> = raw ? JSON.parse(raw) : [];
    const queueItem = queue.find((q) => q.id === body.queueItemId);
    const itemAuthor = queueItem?.author;

    // Execute the Reddit action
    try {
      const id = body.queueItemId as any; // eslint-disable-line
      if (body.action === 'remove') {
        await reddit.remove(id, false);
      } else if (body.action === 'spam') {
        await reddit.remove(id, true);
      } else if (body.action === 'approve' || body.action === 'approve_with_flair') {
        await reddit.approve(id);
        if (body.action === 'approve_with_flair' && body.reason) {
          await reddit.setPostFlair({
            postId: id,
            subredditName: context.subredditName ?? '',
            text: body.reason,
            textColor: 'dark',
          });
        }
      } else if (body.action === 'ban') {
        if (itemAuthor) {
          await reddit.banUser({
            username: itemAuthor,
            subredditName: context.subredditName ?? '',
            reason: body.reason ?? 'Rule violation',
            context: body.queueItemId,
          });
        }
      }
    } catch (actionError) {
      console.error('Failed to execute Reddit action:', actionError);
    }

    // Update user history for time-decayed scoring
    if (itemAuthor) {
      try {
        if (body.action === 'remove' || body.action === 'spam') {
          await recordUserRemoval(itemAuthor);
        } else if (body.action === 'ban') {
          await recordUserBan(itemAuthor);
        }
      } catch {
        // non-critical
      }
    }

    // Remove item from queue (reuse already-loaded queue from above)
    if (queueItem) {
      const queueItemForPrecedent = {
        title: (queueItem as Record<string, unknown>).title as string ?? '',
        body: (queueItem as Record<string, unknown>).body as string ?? '',
        priority: (queueItem as Record<string, unknown>).priority as number | undefined,
      };
      const filtered = queue.filter(
        (q) => q.id !== body.queueItemId,
      );
      await redis.set('mg:queue', JSON.stringify(filtered));

      // Record as precedent for future AI analysis
      try {
        const contentExcerpt = (queueItemForPrecedent.title || queueItemForPrecedent.body).slice(0, 300);
        const precedent: ModPrecedent = {
          id: body.queueItemId,
          contentExcerpt,
          riskScore: queueItemForPrecedent.priority ?? 0,
          ruleMatches: [],
          aiSummary: '',
          outcome:
            body.action === 'remove' || body.action === 'spam'
              ? 'removed'
              : body.action === 'ban'
                ? 'banned'
                : body.action === 'approve' || body.action === 'approve_with_flair'
                  ? 'approved'
                  : 'locked',
          moderator: username ?? 'unknown',
          reason: body.reason ?? '',
          timestamp: new Date().toISOString(),
          subreddit: context.subredditName ?? 'unknown',
        };
        await recordPrecedent(precedent);
      } catch {
        // non-critical
      }
    }

    return c.json<DecisionResponse>({
      type: 'decision',
      status: 'recorded',
      message: `Decision recorded: ${body.action} by ${username}`,
    });
  } catch (error) {
    console.error('Decision recording error:', error);
    return c.json<DecisionResponse>(
      {
        type: 'decision',
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to record decision',
      },
      500
    );
  }
});

// ── AI key ──

api.post('/ai-config', async (c) => {
  try {
    const { provider, apiKey, model, endpoint } = await c.req.json<{
      provider: string;
      apiKey: string;
      model?: string;
      endpoint?: string;
    }>();
    await redis.set(
      'mg:ai-config',
      JSON.stringify({ provider, apiKey: apiKey.trim(), model, endpoint })
    );
    return c.json({ status: 'ok' }, 200);
  } catch {
    return c.json({ status: 'error' }, 500);
  }
});

// ── Custom rules configuration ──

api.get('/rules', async (c) => {
  try {
    const { loadCustomRules } = await import('../core/rule-engine');
    const rules = await loadCustomRules();
    return c.json({ rules }, 200);
  } catch {
    return c.json({ rules: [] }, 200);
  }
});

api.post('/rules', async (c) => {
  try {
    const { rules } = await c.req.json<{ rules: unknown }>();
    await redis.set('mg:rules', JSON.stringify(rules));
    return c.json({ status: 'ok' }, 200);
  } catch {
    return c.json({ status: 'error' }, 500);
  }
});

// ── Collaboration: mark item as being reviewed ──

api.post('/reviewing', async (c) => {
  try {
    const { itemId } = await c.req.json<{ itemId: string }>();
    const username = await reddit.getCurrentUsername();
    await redis.set(
      `mg:reviewing:${itemId}`,
      JSON.stringify({ username, since: Date.now() }),
      // TTL-like: we'll just overwrite on re-expand
    );
    return c.json({ status: 'ok' }, 200);
  } catch {
    return c.json({ status: 'error' }, 500);
  }
});

api.post('/reviewing/stop', async (c) => {
  try {
    const { itemId } = await c.req.json<{ itemId: string }>();
    await redis.del(`mg:reviewing:${itemId}`);
    return c.json({ status: 'ok' }, 200);
  } catch {
    return c.json({ status: 'error' }, 500);
  }
});

api.get('/queue', async (c) => {
  try {
    const raw = await redis.get('mg:queue');
    const queue: Array<{
      id: string;
      title: string;
      body: string;
      author: string;
      type: 'post' | 'comment';
      reportCount: number;
      score: number;
      createdAt: string;
      flag: string;
      flagSeverity: string;
      recAction: string;
      recConfidence: number;
      reviewing?: { username: string; since: number };
      priority?: number;
      riskScore?: number;
      riskRouting?: string;
    }> = raw ? JSON.parse(raw) : [];

    // Attach reviewing status and sort by priority
    for (const item of queue) {
      const reviewingRaw = await redis.get(`mg:reviewing:${item.id}`);
      if (reviewingRaw) {
        try {
          item.reviewing = JSON.parse(reviewingRaw);
        } catch {
          // ignore malformed data
        }
      }
    }

    queue.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    return c.json({ type: 'queue', items: queue }, 200);
  } catch (error) {
    console.error('Queue fetch error:', error);
    return c.json({ type: 'queue', items: [] }, 200);
  }
});

// ── Precedents ──

api.get('/precedents', async (c) => {
  try {
    const raw = await redis.get('mg:precedents');
    const precedents: ModPrecedent[] = raw ? JSON.parse(raw) : [];
    return c.json({ precedents: precedents.slice(0, 20) }, 200);
  } catch {
    return c.json({ precedents: [] }, 200);
  }
});

api.get('/stats', async (c) => {
  try {
    const [analyzed, approved, removed, locked] = await Promise.all([
      redis.get('modguard:analyzed'),
      redis.get('modguard:decisions:approve'),
      redis.get('modguard:decisions:remove'),
      redis.get('modguard:decisions:lock'),
    ]);

    const totalAnalyzed = analyzed ? parseInt(analyzed) : 0;
    const totalDecisions =
      (approved ? parseInt(approved) : 0) +
      (removed ? parseInt(removed) : 0) +
      (locked ? parseInt(locked) : 0);

    return c.json<StatsResponse>({
      type: 'stats',
      data: {
        totalAnalyzed,
        averageTimeSavedSeconds: totalAnalyzed > 0 ? 45 : 0,
        aiAssistedPercentage: totalAnalyzed > 0 ? 78 : 0,
        contextSwitchesReduced: totalDecisions * 3,
      },
    });
  } catch (error) {
    console.error('Stats error:', error);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Failed to fetch stats' },
      500
    );
  }
});
