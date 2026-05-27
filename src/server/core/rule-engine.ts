import type { RuleMatch, Severity, SubredditRule } from '../../shared/types';
import { DEFAULT_RULES } from './mock-data';

interface PatternRule {
  ruleId: string;
  patterns: RegExp[];
  severity: Severity;
  reasonTemplate: string;
  category: string;
}

const PATTERN_RULES: PatternRule[] = [
  {
    ruleId: 'rule-1',
    patterns: [
      /\b(idiots?|stupid|dumb|morons?|brainless|imbeciles?)\b/gi,
      /\b(kill yourself|kys|die in a fire)\b/gi,
      /\b(i hate (you|all|everyone|this)|you people are)\b/gi,
      /\b(garbage human|worthless|pathetic)\b/gi,
      /\bracist|sexist|bigot|homophobic|transphobic\b.*\b(you|they|he|she)\b/gi,
    ],
    severity: 'high',
    reasonTemplate:
      'Content contains {count} instance(s) of harassing or hateful language.',
    category: 'harassment',
  },
  {
    ruleId: 'rule-2',
    patterns: [
      /^(lol|lmao|ok|this|nice|yes|no|agreed|same|what|\?|\.)$/gim,
      /^.{0,5}$/,
      /^(upvote|downvote|bump|following)$/gim,
    ],
    severity: 'low',
    reasonTemplate:
      'Content is too short and lacks meaningful contribution to the discussion.',
    category: 'low_quality',
  },
  {
    ruleId: 'rule-3',
    patterns: [],
    severity: 'low',
    reasonTemplate: 'Content may be off-topic for this subreddit.',
    category: 'off_topic',
  },
  {
    ruleId: 'rule-4',
    patterns: [
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
      /\b\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln)\b/gi,
      /\b\d{5}(-\d{4})?\b/,
      /\b(ssn|social security).*?\d{3}[-.]?\d{2}[-.]?\d{4}\b/gi,
    ],
    severity: 'critical',
    reasonTemplate:
      'Content appears to contain personal information (phone, email, address, or SSN).',
    category: 'doxxing',
  },
  {
    ruleId: 'rule-5',
    patterns: [
      /\b(buy now|click here|limited time offer|act now|free money|earn \$\d+|make \$\d+|discount code|use my code)\b/gi,
      /\b(http:\/\/|https:\/\/)[^\s]+\b.*\b(buy|shop|discount|offer|deal|sale)\b/gi,
      /(check out my|visit my|subscribe to my|follow me on)\b.{0,50}\b(channel|site|page|profile|blog)/gi,
    ],
    severity: 'medium',
    reasonTemplate:
      'Content matches spam/self-promotion patterns with commercial intent.',
    category: 'spam',
  },
  {
    ruleId: 'rule-6',
    patterns: [/^(thoughts\??|opinion\??|title|help|question|idea)$/gim],
    severity: 'low',
    reasonTemplate:
      'Post title is vague or clickbait-style. Does not clearly describe content.',
    category: 'low_quality',
  },
  {
    ruleId: 'rule-7',
    patterns: [
      /\b(shut up|shut the|get lost|go away|nobody asked|who asked|nobody cares)\b/gi,
      /\b(you always|you never|youre always|youre never|typical)\b.{0,30}\b(bad|wrong|terrible|awful)\b/gi,
      /\b(calm down|triggered|snowflake|cry about it|cope|seethe)\b/gi,
    ],
    severity: 'medium',
    reasonTemplate:
      'Content shows uncivil or dismissive language targeting other users.',
    category: 'incivility',
  },
];

const RULE_MAP = new Map<string, SubredditRule>();
DEFAULT_RULES.forEach((r) => RULE_MAP.set(r.id, r));

function getRuleById(id: string): SubredditRule {
  return (
    RULE_MAP.get(id) ?? {
      id,
      index: 0,
      title: 'Unknown Rule',
      description: '',
      category: 'content',
    }
  );
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
  _author?: string
): RuleMatch[] {
  const combinedText = `${title}\n${body}`;
  const results: RuleMatch[] = [];

  for (const rule of PATTERN_RULES) {
    let totalMatches = 0;
    const matchedPatterns: string[] = [];

    for (const pattern of rule.patterns) {
      const matches = combinedText.match(pattern);
      if (matches) {
        totalMatches += matches.length;
        matchedPatterns.push(pattern.source.slice(0, 40));
      }
    }

    const matched = totalMatches > 0;
    const ruleDef = getRuleById(rule.ruleId);
    const confidence = matched
      ? calculateConfidence(totalMatches, rule.severity)
      : 0;

    results.push({
      rule: ruleDef,
      matched,
      confidence,
      reason: matched
        ? rule.reasonTemplate.replace('{count}', String(totalMatches))
        : `No patterns matching "${ruleDef.title}" detected.`,
      severity: rule.severity,
    });
  }

  // Sort: matched first, then by severity/confidence
  results.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    const severityOrder: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    return (
      (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0) ||
      b.confidence - a.confidence
    );
  });

  return results;
}

export function generateContentSummary(
  title: string,
  body: string,
  ruleMatches: RuleMatch[]
): {
  shortSummary: string;
  isControversial: boolean;
  hasEscalation: boolean;
  isLowQuality: boolean;
  sentiment: 'positive' | 'neutral' | 'negative' | 'hostile';
  keyTopics: string[];
} {
  const combined = `${title} ${body}`;
  const wordCount = combined.split(/\s+/).filter(Boolean).length;

  // Sentiment analysis via keyword matching
  const hostileWords = [
    'hate',
    'kill',
    'die',
    'idiot',
    'stupid',
    'garbage',
    'trash',
    'terrible',
    'worst',
    'awful',
    'disgusting',
  ];
  const negativeWords = [
    'bad',
    'wrong',
    'disagree',
    'problem',
    'issue',
    'fail',
    'never',
    'no',
    'not',
    "don't",
    "can't",
    'wont',
  ];
  const positiveWords = [
    'great',
    'good',
    'thanks',
    'helpful',
    'agree',
    'love',
    'best',
    'excellent',
    'amazing',
    'appreciate',
  ];

  const lowerText = combined.toLowerCase();
  const hostileCount = hostileWords.filter((w) => lowerText.includes(w)).length;
  const negativeCount = negativeWords.filter((w) => lowerText.includes(w)).length;
  const positiveCount = positiveWords.filter((w) => lowerText.includes(w)).length;

  let sentiment: 'positive' | 'neutral' | 'negative' | 'hostile' = 'neutral';
  if (hostileCount >= 2) sentiment = 'hostile';
  else if (negativeCount > positiveCount + 2) sentiment = 'negative';
  else if (positiveCount > negativeCount + 1) sentiment = 'positive';

  const hasHarassment = ruleMatches.some(
    (m) => m.matched && m.rule.id === 'rule-1'
  );
  const hasIncivility = ruleMatches.some(
    (m) => m.matched && m.rule.id === 'rule-7'
  );
  const isLowQuality =
    wordCount < 10 ||
    ruleMatches.some((m) => m.matched && m.rule.id === 'rule-2');

  // Build summary text
  let shortSummary: string;
  if (wordCount < 5) {
    shortSummary = `Very short content (${wordCount} words). Insufficient context for meaningful evaluation.`;
  } else if (sentiment === 'hostile') {
    shortSummary = `Content contains hostile language. ${hostileCount} flagged terms detected suggesting aggressive intent.`;
  } else if (hasHarassment) {
    shortSummary = `Content may violate harassment policies. Review context and user history before deciding.`;
  } else if (hasIncivility) {
    shortSummary = `Discussion shows signs of incivility. Evaluate whether intervention (warning/removal) is warranted.`;
  } else if (isLowQuality) {
    shortSummary = `Low-effort content (${wordCount} words). Lacks substantive contribution to the discussion.`;
  } else {
    shortSummary = `Standard content (${wordCount} words). No immediate red flags detected. Review for rule compliance and relevance.`;
  }

  // Extract key topics
  const topicPatterns = [
    /\b(moderation|mod tools|automod|ban|remove|approve)\b/gi,
    /\b(community|subreddit|discussion|debate|question)\b/gi,
    /\b(product|service|website|link|promo|discount)\b/gi,
    /\b(politics|news|controversy|drama|fight)\b/gi,
    /\b(help|support|question|advice|tip)\b/gi,
  ];
  const topicLabels = [
    'moderation',
    'community',
    'promotion',
    'controversy',
    'help/advice',
  ];
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
