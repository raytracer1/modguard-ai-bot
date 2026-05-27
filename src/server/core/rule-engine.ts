import type { CustomRule, RuleMatch, Severity } from '../../shared/types';
import { redis } from '@devvit/web/server';

// ── Default rules (shown in Rules panel when no custom rules exist) ──

function getDefaultCustomRules(): CustomRule[] {
  return [
    {
      name: 'No harassment or hate speech',
      patterns: [
        'idiot', 'idiots', 'stupid', 'dumb', 'moron', 'morons',
        'brainless', 'imbecile', 'imbeciles', 'kill yourself', 'kys',
        'die in a fire', 'i hate you', 'you people are',
        'garbage human', 'worthless', 'pathetic',
      ],
      severity: 'high',
      description: 'Content contains harassing or hateful language.',
      enabled: true,
    },
    {
      name: 'No low-quality or low-effort content',
      patterns: [
        '^(lol|lmao|ok|this|nice|yes|no|agreed|same|what|\\?|\\.)$',
        '^.{0,5}$',
        '^(upvote|downvote|bump|following)$',
      ],
      severity: 'low',
      description: 'Content is too short or lacks meaningful contribution.',
      enabled: true,
    },
    {
      name: 'No personal information / doxxing',
      patterns: [
        '\\d{3}[-.]?\\d{3}[-.]?\\d{4}',
        '[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}',
        '\\d{1,5}\\s+\\w+\\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln)',
        '\\d{5}(-\\d{4})?',
        '(ssn|social security).*?\\d{3}[-.]?\\d{2}[-.]?\\d{4}',
      ],
      severity: 'critical',
      description: 'Content appears to contain personal information (phone, email, address, or SSN).',
      enabled: true,
    },
    {
      name: 'No spam or self-promotion',
      patterns: [
        'buy now', 'click here', 'limited time offer', 'act now',
        'free money', 'earn \\$\\d+', 'make \\$\\d+',
        'discount code', 'use my code',
        'check out my', 'visit my', 'subscribe to my', 'follow me on',
      ],
      severity: 'medium',
      description: 'Content matches spam or self-promotion patterns.',
      enabled: true,
    },
    {
      name: 'Use clear, descriptive titles',
      patterns: [
        '^(thoughts\\??|opinion\\??|title|help|question|idea)$',
      ],
      severity: 'low',
      description: 'Post title is vague or clickbait. Does not clearly describe content.',
      enabled: true,
    },
    {
      name: 'Be civil in discussions',
      patterns: [
        'shut up', 'shut the', 'get lost', 'go away',
        'nobody asked', 'who asked', 'nobody cares',
        'you always', 'you never', 'youre always', 'youre never',
        'calm down', 'triggered', 'snowflake', 'cry about it', 'cope', 'seethe',
      ],
      severity: 'medium',
      description: 'Content shows uncivil or dismissive language targeting others.',
      enabled: true,
    },
  ];
}

// ── Load rules (custom from Redis, fall back to defaults) ──

export async function loadCustomRules(): Promise<CustomRule[]> {
  try {
    const raw = await redis.get('mg:rules');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fall through to defaults
  }
  return getDefaultCustomRules();
}

// ── Rule analysis ──

function buildPatterns(rules: CustomRule[]) {
  return rules
    .filter((r) => r.enabled)
    .map((r) => {
      const regexes = r.patterns.map((p) => {
        try {
          return new RegExp(p, 'gi');
        } catch {
          return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        }
      });
      return { name: r.name, patterns: regexes, severity: r.severity, description: r.description };
    });
}

function calculateConfidence(matchCount: number, severity: Severity): number {
  const baseConfidence = Math.min(matchCount * 25, 85);
  const severityBonus =
    severity === 'critical' ? 15 : severity === 'high' ? 10 : severity === 'medium' ? 5 : 0;
  return Math.min(baseConfidence + severityBonus, 98);
}

export function analyzeContent(
  title: string,
  body: string,
  _author?: string,
  customRules?: CustomRule[]
): RuleMatch[] {
  const combinedText = `${title}\n${body}`;
  const results: RuleMatch[] = [];
  const patternRules = buildPatterns(customRules ?? []);

  for (const rule of patternRules) {
    let totalMatches = 0;

    for (const pattern of rule.patterns) {
      const matches = combinedText.match(pattern);
      if (matches) totalMatches += matches.length;
    }

    const matched = totalMatches > 0;
    const confidence = matched ? calculateConfidence(totalMatches, rule.severity) : 0;

    results.push({
      rule: {
        id: rule.name,
        index: 0,
        title: rule.name,
        description: rule.description,
        category: 'content',
      },
      matched,
      confidence,
      reason: matched
        ? rule.description
        : `No patterns matching "${rule.name}" detected.`,
      severity: rule.severity,
    });
  }

  results.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return (order[b.severity] ?? 0) - (order[a.severity] ?? 0) || b.confidence - a.confidence;
  });

  return results;
}

// ── Content summary ──

export function generateContentSummary(
  title: string,
  body: string,
  ruleMatches: RuleMatch[]
) {
  const combined = `${title} ${body}`;
  const wordCount = combined.split(/\s+/).filter(Boolean).length;

  const hostileWords = ['hate', 'kill', 'die', 'idiot', 'stupid', 'garbage', 'trash', 'terrible', 'worst', 'awful', 'disgusting'];
  const negativeWords = ['bad', 'wrong', 'disagree', 'problem', 'issue', 'fail', 'never', 'no', 'not', "don't", "can't", 'wont'];
  const positiveWords = ['great', 'good', 'thanks', 'helpful', 'agree', 'love', 'best', 'excellent', 'amazing', 'appreciate'];

  const lowerText = combined.toLowerCase();
  const hostileCount = hostileWords.filter((w) => lowerText.includes(w)).length;
  const negativeCount = negativeWords.filter((w) => lowerText.includes(w)).length;
  const positiveCount = positiveWords.filter((w) => lowerText.includes(w)).length;

  let sentiment: 'positive' | 'neutral' | 'negative' | 'hostile' = 'neutral';
  if (hostileCount >= 2) sentiment = 'hostile';
  else if (negativeCount > positiveCount + 2) sentiment = 'negative';
  else if (positiveCount > negativeCount + 1) sentiment = 'positive';

  const hasHarassment = ruleMatches.some((m) => m.matched && m.severity === 'high');
  const hasIncivility = ruleMatches.some((m) => m.matched && m.severity === 'medium');
  const isLowQuality = wordCount < 10;

  let shortSummary: string;
  if (wordCount < 5) {
    shortSummary = `Very short content (${wordCount} words). Insufficient context.`;
  } else if (sentiment === 'hostile') {
    shortSummary = `Content contains hostile language. ${hostileCount} flagged terms detected.`;
  } else if (hasHarassment) {
    shortSummary = 'Content may violate harassment policies. Review before deciding.';
  } else if (hasIncivility) {
    shortSummary = 'Discussion shows signs of incivility. Evaluate whether intervention is needed.';
  } else if (isLowQuality) {
    shortSummary = `Low-effort content (${wordCount} words). Lacks substantive contribution.`;
  } else {
    shortSummary = `Standard content (${wordCount} words). No immediate red flags.`;
  }

  const topicPatterns = [
    /\b(moderation|mod tools|automod|ban|remove|approve)\b/gi,
    /\b(community|subreddit|discussion|debate|question)\b/gi,
    /\b(product|service|website|link|promo|discount)\b/gi,
    /\b(politics|news|controversy|drama|fight)\b/gi,
    /\b(help|support|question|advice|tip)\b/gi,
  ];
  const topicLabels = ['moderation', 'community', 'promotion', 'controversy', 'help/advice'];
  const keyTopics: string[] = [];
  topicPatterns.forEach((tp, i) => {
    const label = topicLabels[i];
    if (label && tp.test(combined)) keyTopics.push(label);
  });

  return {
    shortSummary,
    isControversial: sentiment === 'hostile' || hasHarassment,
    hasEscalation: sentiment === 'hostile' || hasIncivility,
    isLowQuality,
    sentiment,
    keyTopics: keyTopics.length > 0 ? keyTopics : ['general'],
  };
}
