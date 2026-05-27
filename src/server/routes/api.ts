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
import { generateModContext } from '../core/context-engine';
import type { QueueItemInput } from '../core/context-engine';

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
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'postId is required' },
      400
    );
  }

  try {
    const body = await c.req.json<{
      title?: string;
      content?: string;
      author?: string;
      subreddit?: string;
      reportCount?: number;
      score?: number;
      type?: 'post' | 'comment';
    }>();

    const queueItem: QueueItemInput = {
      id: postId,
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
        flair: body.flair,
        moderatorNote: body.moderatorNote,
        moderator: username,
        timestamp: new Date().toISOString(),
      })
    );

    // Update decision counter
    await redis.incrBy(`modguard:decisions:${body.action}`, 1);

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
