import type { ModContext, ModRecommendation, RuleMatch } from '../../shared/types';
import { analyzeContent, generateContentSummary, loadCustomRules } from './rule-engine';
import { enhanceWithAI } from './ai-enhance';

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
}

function generateRecommendation(ruleMatches: RuleMatch[]): ModRecommendation {
  const criticalMatch = ruleMatches.find(
    (m) => m.matched && m.severity === 'critical'
  );
  const highMatch = ruleMatches.find(
    (m) => m.matched && m.severity === 'high'
  );
  const mediumMatches = ruleMatches.filter(
    (m) => m.matched && m.severity === 'medium'
  );
  const lowMatches = ruleMatches.filter(
    (m) => m.matched && m.severity === 'low'
  );

  if (criticalMatch) {
    return {
      action: 'remove',
      confidence: 98,
      reasoning: `Critical rule violation detected: ${criticalMatch.rule.title}. Content contains potentially dangerous information (personal data, threats, etc.). Immediate removal recommended.`,
    };
  }

  if (highMatch) {
    return {
      action: 'remove',
      confidence: highMatch.confidence,
      reasoning: `High-severity rule match: ${highMatch.rule.title}. Confidence: ${highMatch.confidence}%. Content should be removed. Consider warning the user.`,
    };
  }

  if (mediumMatches.length >= 2) {
    return {
      action: 'remove',
      confidence: 75,
      reasoning: `Multiple medium-severity issues detected (${mediumMatches.length} rules matched). Primary concerns: ${mediumMatches.map((m) => m.rule.title).join(', ')}. Cumulative effect suggests content does not meet community standards.`,
    };
  }

  if (mediumMatches.length >= 1 && mediumMatches[0]) {
    return {
      action: 'remove',
      confidence: 65,
      reasoning: `Medium-severity rule match: ${mediumMatches[0].rule.title}. Review content before removal.`,
    };
  }

  if (lowMatches.length > 0) {
    return {
      action: 'approve',
      confidence: 55,
      reasoning: `${lowMatches.length} low-severity issue(s) detected. Minor concerns — approve with monitoring unless additional context warrants otherwise.`,
    };
  }

  return {
    action: 'approve',
    confidence: 90,
    reasoning: 'No rule violations detected. Content appears to meet community standards. Standard approval recommended.',
  };
}

export async function generateModContext(
  item: QueueItemInput
): Promise<ModContext> {
  const startTime = Date.now();

  const customRules = await loadCustomRules();
  const ruleMatches = analyzeContent(item.title, item.body, item.author, customRules);
  const contentSummary = generateContentSummary(item.title, item.body, ruleMatches);
  const recommendation = generateRecommendation(ruleMatches);

  // AI enhancement (optional, falls back silently)
  let aiAssisted = false;
  let aiSummary: string | null = null;
  try {
    const aiResult = await enhanceWithAI({
      title: item.title,
      body: item.body,
      author: item.author,
      matchedRules: ruleMatches
        .filter((m) => m.matched)
        .map((m) => ({ name: m.rule.title, severity: m.severity })),
    });
    if (aiResult) {
      aiAssisted = true;
      aiSummary = aiResult.summary;
    }
  } catch {
    // AI failed silently, use rule-engine output
  }

  return {
    queueItem: item,
    userProfile: {
      username: item.author,
      accountCreated: '',
      accountAgeDays: 0,
      karma: 0,
      commentKarma: 0,
      isNewAccount: false,
      previousViolations: 0,
      recentPosts: [],
    },
    contentSummary: aiSummary
      ? { ...contentSummary, shortSummary: aiSummary }
      : contentSummary,
    ruleMatches,
    similarCases: [],
    recommendation,
    collaboration: { isBeingReviewed: false },
    meta: {
      generatedAt: new Date().toISOString(),
      analysisTimeMs: Date.now() - startTime,
      isMockData: false,
      aiAssisted,
    },
  };
}
