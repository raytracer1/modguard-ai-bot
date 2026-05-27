import type { ModContext, ModRecommendation, RuleMatch } from '../../shared/types';
import { analyzeContent, generateContentSummary } from './rule-engine';
import {
  getMockUserProfile,
  getMockSimilarCases,
  getMockCollaborationStatus,
} from './mock-data';

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

function generateRecommendation(
  ruleMatches: RuleMatch[],
  userViolations: number
): ModRecommendation {
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
      reasoning: [
        `Critical rule violation detected: ${criticalMatch.rule.title}.`,
        `Content contains potentially dangerous information (personal data, threats, etc.).`,
        userViolations > 0
          ? `User has ${userViolations} prior violation(s). Escalate review for possible ban.`
          : 'Immediate removal recommended regardless of user history.',
      ].join(' '),
    };
  }

  if (highMatch) {
    const reasoning = [
      `High-severity rule match: ${highMatch.rule.title}.`,
      `Confidence: ${highMatch.confidence}%.`,
      userViolations >= 2
        ? `Repeat offender (${userViolations} prior violations). Strongly recommend removal.`
        : 'Content should be removed. Consider warning the user.',
    ].join(' ');
    return {
      action: 'remove',
      confidence: highMatch.confidence,
      reasoning,
    };
  }

  if (mediumMatches.length >= 2) {
    return {
      action: 'remove',
      confidence: 75,
      reasoning: [
        `Multiple medium-severity issues detected (${mediumMatches.length} rules matched).`,
        `Primary concerns: ${mediumMatches.map((m) => m.rule.title).join(', ')}.`,
        'Cumulative effect suggests content does not meet community standards.',
      ].join(' '),
    };
  }

  if (mediumMatches.length === 1 && mediumMatches[0]) {
    const match = mediumMatches[0];
    if (match.rule.id === 'rule-7') {
      return {
        action: 'lock',
        confidence: 70,
        reasoning: [
          'Incivility detected but content may not warrant full removal.',
          'Locking thread prevents further escalation while preserving context.',
          'Consider warning the user about civility expectations.',
        ].join(' '),
      };
    }
    return {
      action: 'remove',
      confidence: 65,
      reasoning: [
        `Rule match: ${match.rule.title}.`,
        'Medium confidence — review context and user history before final decision.',
      ].join(' '),
    };
  }

  if (lowMatches.length > 0) {
    const lowQuality = lowMatches.find((m) => m.rule.id === 'rule-2');
    if (lowQuality && lowQuality.matched) {
      return {
        action: 'remove',
        confidence: 60,
        reasoning: [
          'Content flagged as low-quality / low-effort.',
          'Consider whether content adds value. If marginal, removal is appropriate.',
        ].join(' '),
      };
    }
    return {
      action: 'approve',
      confidence: 55,
      reasoning: [
        'Minor issues detected but none rise to removal threshold.',
        'Approve with monitoring. Consider adding a flair for context.',
      ].join(' '),
    };
  }

  return {
    action: 'approve',
    confidence: 90,
    reasoning: [
      'No rule violations detected.',
      'Content appears to meet community standards.',
      'Standard approval recommended.',
    ].join(' '),
  };
}

export async function generateModContext(
  item: QueueItemInput
): Promise<ModContext> {
  const startTime = Date.now();

  const userProfile = getMockUserProfile(item.author);
  const ruleMatches = analyzeContent(item.title, item.body, item.author);
  const contentSummary = generateContentSummary(
    item.title,
    item.body,
    ruleMatches
  );
  const recommendation = generateRecommendation(
    ruleMatches,
    userProfile.previousViolations
  );

  const primaryCategory =
    ruleMatches.find((m) => m.matched)?.rule.id === 'rule-1'
      ? 'harassment'
      : ruleMatches.find((m) => m.matched)?.rule.id === 'rule-2'
        ? 'low_quality'
        : ruleMatches.find((m) => m.matched)?.rule.id === 'rule-4'
          ? 'doxxing'
          : ruleMatches.find((m) => m.matched)?.rule.id === 'rule-5'
            ? 'spam'
            : ruleMatches.find((m) => m.matched)?.rule.id === 'rule-7'
              ? 'incivility'
              : 'general';

  const similarCases = getMockSimilarCases(primaryCategory);
  const collaboration = getMockCollaborationStatus(item.id);

  const analysisTimeMs = Date.now() - startTime;

  return {
    queueItem: item,
    userProfile,
    contentSummary,
    ruleMatches,
    similarCases,
    recommendation,
    collaboration,
    meta: {
      generatedAt: new Date().toISOString(),
      analysisTimeMs,
      isMockData: true,
      aiAssisted: false,
    },
  };
}
