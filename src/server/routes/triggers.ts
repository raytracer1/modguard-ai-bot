import { Hono } from 'hono';
import type { TriggerRequest, TriggerResponse } from '@devvit/web/shared';
import { context, redis } from '@devvit/web/server';
import { analyzeContent, loadCustomRules } from '../core/rule-engine';
import { createPost } from '../core/post';

const QUEUE_KEY = 'mg:queue';

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

      const matches = analyzeContent(title, body, author, customRules);
      const primary = matches.find((m) => m.matched);

      if (primary) {
        const item = {
          id: post.id,
          title,
          body,
          author,
          type: 'post' as const,
          reportCount: post.numReports ?? 0,
          score: post.score ?? 0,
          createdAt: new Date((post.createdAt ?? 0) * 1000).toISOString(),
          flag: primary.rule.title,
          flagSeverity: primary.severity,
          recAction:
            primary.severity === 'critical' || primary.severity === 'high'
              ? ('remove' as const)
              : primary.severity === 'medium'
                ? ('lock' as const)
                : ('remove' as const),
          recConfidence: primary.confidence,
        };

        const raw = await redis.get(QUEUE_KEY);
        const queue = raw ? JSON.parse(raw) : [];
        // Don't duplicate
        const filtered = queue.filter((q: { id: string }) => q.id !== item.id);
        filtered.unshift(item);
        // Keep max 100 items
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

      const matches = analyzeContent('', body, author, customRules);
      const primary = matches.find((m) => m.matched);

      if (primary) {
        const item = {
          id: comment.id,
          title: '',
          body,
          author,
          type: 'comment' as const,
          reportCount: comment.numReports ?? 0,
          score: comment.score ?? 0,
          createdAt: new Date((comment.createdAt ?? 0) * 1000).toISOString(),
          flag: primary.rule.title,
          flagSeverity: primary.severity,
          recAction:
            primary.severity === 'critical' || primary.severity === 'high'
              ? ('remove' as const)
              : primary.severity === 'medium'
                ? ('lock' as const)
                : ('remove' as const),
          recConfidence: primary.confidence,
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
