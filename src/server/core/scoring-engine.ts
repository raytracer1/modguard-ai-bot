import type { AIAnalysisOutput, AIAugmentation, LightAIOutput, ModRecommendation, ModerationSignals, RiskBuckets, RiskScore, RuleMatch } from '../../shared/types';
import { redis } from '@devvit/web/server';

// ═══════════════════════════════════════════════════════════════════════
// Risk Bucket Architecture
//
// Five independent buckets, each with a cap. No signal crosses buckets.
// This eliminates double-counting: a spam post gets scored in SpamBucket
// only, not also in Content + Rule + Behavior as before.
//
//   SpamBucket          (0-25)
//   HarassmentBucket    (0-30)
//   LowQualityBucket    (0-15)
//   AccountRiskBucket   (0-20)
//   UncertaintyScore    (0-10)   ← recall-first: catches implicit abuse
//   CommunityMultiplier (1.0-1.15)
//   ─────────────────────────
//   Total               (0-100)
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// Word Dictionaries
// ═══════════════════════════════════════════════════════════════════════

const PROFANITY_WORDS = [
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'crap', 'hell',
  'bastard', 'dick', 'piss', 'slut', 'whore', 'cunt',
];

const SPAM_PHRASES = [
  'buy now', 'click here', 'limited time offer', 'act now',
  'free money', 'discount code', 'use my code', 'check out my',
  'visit my', 'subscribe to my', 'follow me on', 'make money',
  'earn cash', '100% free', 'exclusive offer', 'best price',
  'cheap', 'lowest price', 'order now', "don't miss out",
  'hurry', 'while supplies last', 'risk free', 'satisfaction guaranteed',
  'winner', "you've won", 'congratulations', 'selected',
  'bitcoin', 'crypto currency', 'invest now',
];

// ═══════════════════════════════════════════════════════════════════════
// Target-Aware Hostility Detection (fixes issues 4 & 5)
//
// Distinguishes:
//   "fuck this game"     → general profanity (low risk)
//   "fuck you idiot"     → targeted attack (high risk)
//   "I hate bugs"        → frustration (low risk)
//   "you're an idiot"    → directed insult (high risk)
// ═══════════════════════════════════════════════════════════════════════

// Pattern 1: Second-person attack — profanity/hostility directed at "you"
const SECOND_PERSON_ATTACK = [
  /(?:you|u|ur|you'?re)\s+(?:are\s+)?(?:a\s+)?(?:fuck(?:ing|in)?\s+)?(?:idiot|moron|imbecile|stupid|dumb|trash|garbage|worthless|pathetic|piece\s+of\s+shit|pos|bitch|asshole|dick|cunt|loser|retard|scum)/i,
  /(?:fuck|shit|screw)\s*(?:you|u|off)/i,
  /(?:you|u)\s+(?:suck|are\s+(?:so|a)\s+(?:bad|wrong|terrible|awful))/i,
];

// Pattern 2: Directed insult — name-calling with second-person context
const DIRECTED_INSULT = [
  /(?:you|u|ur)\s+.*?(?:idiot|moron|stupid|dumb|loser|clown|joke)/i,
  /(?:idiot|moron|stupid|dumb|loser|clown).*?(?:you|u|ur)/i,
  /(?:what\s+an?\s+)(?:idiot|moron|imbecile|loser|clown|joke)/i,
];

// Pattern 3: Imperative hostility — aggressive commands
const IMPERATIVE_HOSTILITY = [
  /(?:shut|fuck|piss)\s*(?:up|off|you)/i,
  /(?:go|get)\s*(?:away|lost|fucked|out|a\s+life)/i,
  /kill\s*(?:yourself|urself|you)/i,
  /(?:nobody|who)\s*(?:asked|cares|wants\s+you)/i,
];

// Pattern 4: General profanity — not directed at a person (low risk)
const GENERAL_PROFANITY = [
  /\b(?:fuck|shit|damn|crap|hell|ass)\b/i,
];

/**
 * Returns { targeted: boolean, score: 0-3 } where:
 *   0 = no hostility detected
 *   1 = general profanity only (low concern)
 *   2 = possible targeted hostility (moderate concern)
 *   3 = clear targeted hostility (high concern)
 */
function detectHostility(text: string): { targeted: boolean; score: number; patterns: string[] } {
  const triggered: string[] = [];

  // Check most severe first
  for (const pattern of SECOND_PERSON_ATTACK) {
    if (pattern.test(text)) {
      triggered.push('second-person attack');
      break;
    }
  }
  for (const pattern of DIRECTED_INSULT) {
    if (pattern.test(text)) {
      triggered.push('directed insult');
      break;
    }
  }
  for (const pattern of IMPERATIVE_HOSTILITY) {
    if (pattern.test(text)) {
      triggered.push('imperative hostility');
      break;
    }
  }

  const hasTargeted = triggered.length > 0;

  // Check general profanity
  let hasGeneralProfanity = false;
  for (const pattern of GENERAL_PROFANITY) {
    if (pattern.test(text)) {
      hasGeneralProfanity = true;
      break;
    }
  }

  let score: number;
  if (triggered.includes('second-person attack') || triggered.includes('imperative hostility')) {
    score = 3;
  } else if (triggered.includes('directed insult')) {
    score = 2;
  } else if (hasGeneralProfanity) {
    score = 1;
  } else {
    score = 0;
  }

  return { targeted: hasTargeted, score, patterns: triggered };
}

// ═══════════════════════════════════════════════════════════════════════
// Uncertainty Scoring — recall-first: catch implicit abuse, sarcasm, dog whistles
// ═══════════════════════════════════════════════════════════════════════

const AMBIGUOUS_PATTERNS = [
  /^(?:interesting|wow|nice|ok+ay?|sure|lol|lmao|bruh|based|yikes|oof|hmm+\.*)$/i,
  /^(?:what|why|how|when|who)\??$/i,
  /^(?:cool story|thanks for sharing|good for you|imagine that)[.!]*$/i,
  /^(?:sure.*whatever|ok.*buddy|right.*sure)[.!]*$/i,
];

const SARCASTIC_PATTERNS = [
  /^(?:thanks|thx|ty).*(?:for nothing|i guess|i suppose)/i,
  /^(?:wow|amazing|incredible|brilliant).*(?:just what|exactly what)/i,
  /^(?:congratulations|congrats).*(?:you played yourself|you win)/i,
  /^(?:oh|ah).*(?:really|wow|i see|now i get it)[.!]*$/i,
  /totally.*(?:normal|fine|okay|great|awesome)/i,
  /definitely.*(?:not|n't).*(?:suspicious|weird|odd|strange)/i,
];

function computeUncertaintyScore(text: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const trimmed = text.trim();
  const len = trimmed.length;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  // Very short / single-word — inherently ambiguous
  if (len < 10) {
    score += 5;
    reasons.push('very short text (< 10 chars)');
  } else if (len < 30) {
    score += 3;
    reasons.push('short text (< 30 chars)');
  } else if (len < 60 && wordCount < 8) {
    score += 1;
    reasons.push('brief, low-context text');
  }

  // Ambiguous one-liners that often signal implicit hostility
  for (const pattern of AMBIGUOUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      score += 3;
      reasons.push('ambiguous one-liner');
      break;
    }
  }

  // Sarcasm / passive-aggressive patterns
  for (const pattern of SARCASTIC_PATTERNS) {
    if (pattern.test(trimmed)) {
      score += 3;
      reasons.push('possible sarcasm/passive-aggression');
      break;
    }
  }

  // Sentiment conflict: positive words in short hostile context
  const positiveCount = (trimmed.match(/\b(?:great|good|thanks|helpful|agree|love|best|excellent|amazing|appreciate|nice|wonderful|beautiful)\b/gi) || []).length;
  const hasNegativeContext = /\b(?:but|however|though|actually|honestly|frankly|no offense|not gonna lie)\b/i.test(trimmed);
  if (positiveCount > 0 && hasNegativeContext && wordCount < 20) {
    score += 2;
    reasons.push('positive words in dismissive context');
  }

  // No rule-triggering words, but unusual phrasing patterns
  const hasUnusualPhrasing = /^(?:so|very|much|such|many).*(?:wow|amaze)/i.test(trimmed)
    || /^(?:be|stay|remain).*(?:blessed|positive|beautiful)[.!]*$/i.test(trimmed);
  if (hasUnusualPhrasing) {
    score += 2;
    reasons.push('unusual phrasing pattern');
  }

  return { score: Math.min(score, 10), reasons };
}

// ═══════════════════════════════════════════════════════════════════════
// Adversarial Detection — catch intentional evasion, coded speech, politeness masking
// ═══════════════════════════════════════════════════════════════════════

const POLITENESS_MASKING = [
  /\bwith all due respect\b/i,
  /\bno offense\b.{0,30}\bbut\b/i,
  /\bnot gonna lie\b.{0,30}\bbut\b/i,
  /\bjust (?:saying|being honest)\b/i,
  /\bI('?m| am) not (?:trying to be|being)\b.{0,20}\bbut\b/i,
  /\bdon'?t (?:want to|mean to)\b.{0,20}\bbut\b/i,
];

const INDIRECT_INSULT = [
  /\b(?:some people|someone|certain individuals)\b.{0,40}\b(?:just|always|never|can'?t)\b/i,
  /\bif the shoe fits\b/i,
  /\bbless (?:your|their|his|her) (?:heart|soul)\b/i,
  /\b(?:imagine|imagine that|go figure|who would have thought)\b[.!]*$/i,
  /\b(?:must be nice|good for you|how convenient)\b/i,
  /\b(?:whatever helps you|if that'?s what you|tell yourself)\b.{0,30}\b(?:sleep|think|believe)\b/i,
];

const CODED_SPEECH = [
  /[\u{1F300}-\u{1F6FF}].{0,5}[\u{1F300}-\u{1F6FF}].{0,5}[\u{1F300}-\u{1F6FF}]/u, // 3+ emoji in close proximity
  /\b(?:certain|particular|specific|some|those)\b.{0,10}\b(?:people|individuals|groups|types|kinds)\b.{0,30}\b(?:always|never|tend to|keep)\b/i,
  /\b(?:interesting|curious|funny|strange|odd|weird)\b.{0,20}\b(?:how|that|you|they|people)\b/i,
  /\b(?:I'?m just|just|simply|merely)\b.{0,15}\b(?:asking|wondering|curious|questioning)\b/i,
];

const EMOJI_HOSTILITY_MASK = [
  /[\u{1F600}-\u{1F64F}].{0,3}\b(?:idiot|stupid|dumb|trash|garbage|loser|clown)\b.{0,3}[\u{1F600}-\u{1F64F}]/u,
  /[\u{1F600}-\u{1F64F}].{0,3}\b(?:hate|kill|die|awful|terrible|worst)\b.{0,3}[\u{1F600}-\u{1F64F}]/u,
];

function detectAdversarial(text: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  for (const pattern of POLITENESS_MASKING) {
    if (pattern.test(text)) { score += 4; reasons.push('politeness masking hostility'); break; }
  }
  for (const pattern of INDIRECT_INSULT) {
    if (pattern.test(text)) { score += 5; reasons.push('indirect insult / passive aggression'); break; }
  }
  for (const pattern of CODED_SPEECH) {
    if (pattern.test(text)) { score += 4; reasons.push('coded speech / dog whistle pattern'); break; }
  }
  for (const pattern of EMOJI_HOSTILITY_MASK) {
    if (pattern.test(text)) { score += 5; reasons.push('emoji masking hostility'); break; }
  }

  return { score: Math.min(score, 10), reasons };
}

// ═══════════════════════════════════════════════════════════════════════
// Anomaly Detection — catch unusual phrasing, outliers, potentially evasive content
// ═══════════════════════════════════════════════════════════════════════

function detectAnomaly(text: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const words = text.split(/\s+/).filter(Boolean);
  const len = text.length;

  // Excessive punctuation relative to text length
  const punctCount = (text.match(/[!?.,;:]{2,}/g) || []).length;
  if (punctCount > 3) { score += 2; reasons.push('excessive punctuation clusters'); }

  // Unusual character repetition (not normal emphasis)
  if (/([a-zA-Z])\1{4,}/.test(text)) { score += 3; reasons.push('unusual character repetition'); }

  // Mixed scripts (Latin + Cyrillic lookalikes, common in evasion)
  const hasCyrillic = /[Ѐ-ӿ]/.test(text);
  const hasLatin = /[a-zA-Z]/.test(text);
  if (hasCyrillic && hasLatin) { score += 4; reasons.push('mixed scripts — possible evasion'); }

  // Zero-width characters (common evasion technique)
  if (/[​-‏﻿]/.test(text)) { score += 5; reasons.push('zero-width characters detected'); }

  // Excessive word repetition (same word > 30% of total)
  if (words.length >= 6) {
    const wordFreq: Record<string, number> = {};
    words.forEach((w) => { const lower = w.toLowerCase(); wordFreq[lower] = (wordFreq[lower] || 0) + 1; });
    const maxFreq = Math.max(...Object.values(wordFreq));
    if (maxFreq / words.length > 0.3) { score += 2; reasons.push('unusual word repetition'); }
  }

  // Length outlier: very long single sentence (potential copypasta / spam variant)
  if (len > 500 && (text.match(/[.!?]/g) || []).length < 3) { score += 2; reasons.push('run-on text — possible copypasta'); }

  return { score: Math.min(score, 10), reasons };
}

// ═══════════════════════════════════════════════════════════════════════
// Smooth Decay Curves (fixes issue 2 — no more binary flags)
// ═══════════════════════════════════════════════════════════════════════

function accountAgeRisk(days: number): number {
  if (days <= 0) return 0;           // unknown → no penalty
  if (days < 1) return 12;           // < 1 day
  if (days < 3) return 9;            // 1-3 days
  if (days < 7) return 6;            // 3-7 days
  if (days < 14) return 4;           // 1-2 weeks
  if (days < 30) return 2;           // 2-4 weeks
  return 0;                          // established account
}

function karmaRisk(totalKarma: number, accountAgeDays: number): number {
  if (accountAgeDays <= 0) return 0; // unknown → no penalty
  if (totalKarma < 0) return 8;      // negative karma
  if (totalKarma < 1) return 6;      // 0 karma
  if (totalKarma < 5) return 4;      // 1-4
  if (totalKarma < 20) return 2;     // 5-19
  return 0;
}

// ═══════════════════════════════════════════════════════════════════════
// Time-Decayed Trust (fixes issue 3 — no more permanent "original sin")
// ═══════════════════════════════════════════════════════════════════════

interface TimestampedRecord {
  timestamps: number[]; // unix ms
}

function countInWindow(timestamps: number[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter((t) => t > cutoff).length;
}

function removalRisk(timestamps: number[]): number {
  const recent30d = countInWindow(timestamps, 30 * 86_400_000);
  const recent180d = countInWindow(timestamps, 180 * 86_400_000);
  const older = timestamps.length - recent180d;

  // Recent removals: 4 points each (max 12)
  // Medium-term: 2 points each (max 8)
  // Old: 1 point each (max 3)
  return Math.min(recent30d * 4, 12) + Math.min((recent180d - recent30d) * 2, 8) + Math.min(older, 3);
}

function banRisk(timestamps: number[]): number {
  const recent30d = countInWindow(timestamps, 30 * 86_400_000);
  const recent180d = countInWindow(timestamps, 180 * 86_400_000);
  const older = timestamps.length - recent180d;

  // Recent ban: 20 points (instant high risk)
  // Medium-term: 8 points each
  // Old: 3 points each
  let risk = 0;
  if (recent30d > 0) risk += 20;
  risk += Math.min((recent180d - recent30d) * 8, 16);
  risk += Math.min(older * 3, 6);
  return Math.min(risk, 20);
}

// ═══════════════════════════════════════════════════════════════════════
// Signal Extraction
// ═══════════════════════════════════════════════════════════════════════

export interface SignalExtractionInput {
  author: string;
  title: string;
  body: string;
  reportCount: number;
  score: number;
  upvoteRatio?: number;
  createdAt: string;
  ruleMatches: RuleMatch[];
  subreddit: string;
}

export function extractContentSignals(
  title: string,
  body: string,
): {
  word_count: number;
  link_count: number;
  all_caps_ratio: number;
  spam_phrase_count: number;
  emoji_count: number;
  profanity_score: number;
  hostility: ReturnType<typeof detectHostility>;
} {
  const combined = `${title} ${body}`;
  const lowerText = combined.toLowerCase();

  const wordCount = combined.split(/\s+/).filter(Boolean).length;

  const urlPattern = /https?:\/\/[^\s]+/gi;
  const linkCount = (combined.match(urlPattern) || []).length;

  const letterChars = combined.replace(/[^A-Za-z]/g, '');
  const upperChars = letterChars.replace(/[^A-Z]/g, '');
  const allCapsRatio = letterChars.length > 0 ? upperChars.length / letterChars.length : 0;

  const spamPhraseCount = SPAM_PHRASES.filter((w) => lowerText.includes(w)).length;

  const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const emojiCount = (combined.match(emojiPattern) || []).length;

  // Profanity count (general, not targeted)
  const profanityHits = PROFANITY_WORDS.filter((w) => {
    const regex = new RegExp(`\\b${w.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    return regex.test(lowerText);
  }).length;
  const profanityScore = Math.min(profanityHits, 4);

  const hostility = detectHostility(lowerText);

  return {
    word_count: wordCount,
    link_count: linkCount,
    all_caps_ratio: allCapsRatio,
    spam_phrase_count: spamPhraseCount,
    emoji_count: emojiCount,
    profanity_score: profanityScore,
    hostility,
  };
}

export function extractRuleSignals(ruleMatches: RuleMatch[]) {
  const matched = ruleMatches.filter((m) => m.matched);
  return {
    rule_match_count: matched.length,
    critical_rule_match: matched.some((m) => m.severity === 'critical'),
    high_severity_match: matched.some((m) => m.severity === 'high'),
    medium_severity_matches: matched.filter((m) => m.severity === 'medium').length,
    low_severity_matches: matched.filter((m) => m.severity === 'low').length,
    // Classify which rules matched (for bucket routing)
    has_spam_rule: matched.some((m) =>
      /spam|self.?promotion|promotion/i.test(m.rule.title)),
    has_harassment_rule: matched.some((m) =>
      /harassment|hate|incivility|civil/i.test(m.rule.title)),
    has_low_quality_rule: matched.some((m) =>
      /low.?quality|low.?effort|vague|title/i.test(m.rule.title)),
  };
}

async function extractUserSignals(author: string) {
  const [removalsRaw, bansRaw, lastPostRaw] = await Promise.all([
    redis.get(`mg:user:${author}:removals`),
    redis.get(`mg:user:${author}:bans`),
    redis.get(`mg:user:${author}:last_post_ts`),
  ]);

  // Parse timestamp arrays for time-decayed scoring
  let removalTimestamps: number[] = [];
  let banTimestamps: number[] = [];
  try {
    if (removalsRaw) removalTimestamps = JSON.parse(removalsRaw);
    if (bansRaw) banTimestamps = JSON.parse(bansRaw);
  } catch {
    // fallback: try legacy integer format
    const rCount = removalsRaw ? parseInt(removalsRaw, 10) : 0;
    const bCount = bansRaw ? parseInt(bansRaw, 10) : 0;
    if (rCount > 0 && removalTimestamps.length === 0) {
      removalTimestamps = Array(rCount).fill(Date.now() - 90 * 86_400_000); // assume 90d ago
    }
    if (bCount > 0 && banTimestamps.length === 0) {
      banTimestamps = Array(bCount).fill(Date.now() - 90 * 86_400_000);
    }
  }

  let postsInLastHour = 0;
  if (lastPostRaw) {
    const lastTs = parseInt(lastPostRaw, 10);
    if (Date.now() - lastTs < 3_600_000) {
      const countRaw = await redis.get(`mg:user:${author}:post_count_1h`);
      postsInLastHour = countRaw ? parseInt(countRaw, 10) : 1;
    }
  }

  let accountAgeDays = 0;
  let linkKarma = 0;
  let commentKarma = 0;
  try {
    const cachedRaw = await redis.get(`mg:user-profile:${author}`);
    if (cachedRaw) {
      const profile = JSON.parse(cachedRaw);
      accountAgeDays = profile.accountAgeDays ?? 0;
      linkKarma = profile.linkKarma ?? 0;
      commentKarma = profile.commentKarma ?? 0;
    }
  } catch {
    // use defaults
  }

  return {
    account_age_days: accountAgeDays,
    link_karma: linkKarma,
    comment_karma: commentKarma,
    total_karma: linkKarma + commentKarma,
    removal_timestamps: removalTimestamps,
    ban_timestamps: banTimestamps,
    posts_in_last_hour: postsInLastHour,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Bucket Scoring (fixes issue 1 — no more double counting)
// ═══════════════════════════════════════════════════════════════════════

interface BucketScores {
  spam: number;
  harassment: number;
  lowQuality: number;
  accountRisk: number;
  uncertainty: number;
  adversarial: number;
  anomaly: number;
  communityConcern: number;
}

interface SignalBreakdown {
  signal: string;
  contribution: number;
  detail: string;
}

interface ScoringResult {
  total: number;
  buckets: BucketScores;
  topSignals: SignalBreakdown[];
  routing: RiskScore['routing'];
}

function computeBucketScores(
  content: ReturnType<typeof extractContentSignals>,
  rules: ReturnType<typeof extractRuleSignals>,
  user: Awaited<ReturnType<typeof extractUserSignals>>,
  reportCount: number,
  downvoteRatio: number,
  timeInQueueMs: number,
  relatedItemInQueue: boolean,
  fullText: string,
): ScoringResult {
  const signals: SignalBreakdown[] = [];

  // ── SpamBucket (0-25) ──
  let spamRaw = 0;

  if (content.link_count >= 3) {
    spamRaw += 10;
    signals.push({ signal: 'Multiple links', contribution: 10, detail: `${content.link_count} links detected` });
  } else if (content.link_count >= 1) {
    spamRaw += 4;
    signals.push({ signal: 'Contains link', contribution: 4, detail: `${content.link_count} link detected` });
  }

  const spamPhraseScore = Math.min(Math.ceil(content.spam_phrase_count / 2) * 4, 12);
  if (spamPhraseScore > 0) {
    spamRaw += spamPhraseScore;
    signals.push({ signal: 'Spam phrases', contribution: spamPhraseScore, detail: `${content.spam_phrase_count} spam-related phrases` });
  }

  if (rules.has_spam_rule) {
    spamRaw += 8;
    signals.push({ signal: 'Spam rule match', contribution: 8, detail: 'Matched spam/self-promotion rule' });
  }

  if (content.emoji_count > 5 && spamRaw > 0) {
    spamRaw += 3;
    signals.push({ signal: 'Emoji overload', contribution: 3, detail: `${content.emoji_count} emojis with spam signals` });
  }

  const spamScore = Math.min(spamRaw, 25);

  // ── HarassmentBucket (0-30) ──
  let harassmentRaw = 0;

  if (content.hostility.score === 3) {
    harassmentRaw += 14;
    signals.push({ signal: 'Targeted hostility', contribution: 14, detail: `Patterns: ${content.hostility.patterns.join(', ')}` });
  } else if (content.hostility.score === 2) {
    harassmentRaw += 8;
    signals.push({ signal: 'Directed insult', contribution: 8, detail: `Patterns: ${content.hostility.patterns.join(', ')}` });
  } else if (content.hostility.score === 1) {
    harassmentRaw += 3;
    signals.push({ signal: 'General profanity', contribution: 3, detail: 'Non-targeted profanity — may be acceptable in context' });
  }

  if (rules.has_harassment_rule) {
    if (rules.high_severity_match) {
      harassmentRaw += 16;
      signals.push({ signal: 'Harassment rule (high)', contribution: 16, detail: 'High-severity harassment/hate speech rule matched' });
    } else {
      harassmentRaw += 8;
      signals.push({ signal: 'Civility rule (medium)', contribution: 8, detail: 'Medium-severity civility rule matched' });
    }
  }

  const harassmentScore = Math.min(harassmentRaw, 30);

  // ── LowQualityBucket (0-15) ──
  let lowQualityRaw = 0;

  if (content.word_count < 3) {
    lowQualityRaw += 6;
    signals.push({ signal: 'Very short', contribution: 6, detail: `${content.word_count} words — extremely brief` });
  } else if (content.word_count < 8) {
    lowQualityRaw += 3;
    signals.push({ signal: 'Short content', contribution: 3, detail: `${content.word_count} words — below typical` });
  }

  if (content.all_caps_ratio > 0.6) {
    lowQualityRaw += 5;
    signals.push({ signal: 'ALL CAPS', contribution: 5, detail: `${Math.round(content.all_caps_ratio * 100)}% uppercase` });
  } else if (content.all_caps_ratio > 0.3) {
    lowQualityRaw += 2;
    signals.push({ signal: 'Heavy caps', contribution: 2, detail: `${Math.round(content.all_caps_ratio * 100)}% uppercase` });
  }

  if (rules.has_low_quality_rule) {
    lowQualityRaw += 3;
    signals.push({ signal: 'Quality rule match', contribution: 3, detail: 'Low-quality/vague title rule matched' });
  }

  if (content.emoji_count > 8 && harassmentRaw === 0 && spamRaw === 0) {
    lowQualityRaw += 3;
    signals.push({ signal: 'Emoji spam', contribution: 3, detail: `${content.emoji_count} emojis` });
  }

  const lowQualityScore = Math.min(lowQualityRaw, 15);

  // ── AccountRiskBucket (0-20) ──
  let accountRiskRaw = 0;

  const ageRisk = accountAgeRisk(user.account_age_days);
  if (ageRisk > 0) {
    accountRiskRaw += ageRisk;
    const label = user.account_age_days < 1 ? '< 1 day' :
      user.account_age_days < 3 ? '1-3 days' :
      user.account_age_days < 7 ? '< 1 week' :
      user.account_age_days < 14 ? '< 2 weeks' : '< 1 month';
    signals.push({ signal: 'New account', contribution: ageRisk, detail: `Account age: ${label}` });
  }

  const kRisk = karmaRisk(user.total_karma, user.account_age_days);
  if (kRisk > 0) {
    accountRiskRaw += kRisk;
    signals.push({ signal: 'Low karma', contribution: kRisk, detail: `Total karma: ${user.total_karma}` });
  }

  const removalR = removalRisk(user.removal_timestamps);
  if (removalR > 0) {
    accountRiskRaw += removalR;
    const recent30 = countInWindow(user.removal_timestamps, 30 * 86_400_000);
    signals.push({
      signal: 'Prior removals',
      contribution: removalR,
      detail: `${user.removal_timestamps.length} total, ${recent30} in last 30 days`,
    });
  }

  const banR = banRisk(user.ban_timestamps);
  if (banR > 0) {
    accountRiskRaw += banR;
    const recent30 = countInWindow(user.ban_timestamps, 30 * 86_400_000);
    signals.push({
      signal: 'Prior bans',
      contribution: banR,
      detail: `${user.ban_timestamps.length} total, ${recent30} in last 30 days`,
    });
  }

  // Posting burst
  if (user.posts_in_last_hour > 5) {
    accountRiskRaw += 8;
    signals.push({ signal: 'Flooding', contribution: 8, detail: `${user.posts_in_last_hour} posts in last hour` });
  } else if (user.posts_in_last_hour > 2) {
    accountRiskRaw += 4;
    signals.push({ signal: 'High posting rate', contribution: 4, detail: `${user.posts_in_last_hour} posts in last hour` });
  }

  // ── AccountRisk dampening (fixes issue 4) ──
  // Account risk only amplifies when content has signals.
  // A new account posting clean content shouldn't trigger AI.
  const hasContentSignal = (spamRaw + harassmentRaw + lowQualityRaw) > 0;
  const accountRiskScore = Math.min(
    hasContentSignal ? accountRiskRaw : Math.round(accountRiskRaw * 0.2),
    20,
  );

  // ── UncertaintyScore (0-10) — recall-first: catch implicit abuse ──
  const uncertainty = computeUncertaintyScore(fullText);
  let uncertaintyScore = uncertainty.score;
  if (uncertainty.reasons.length > 0) {
    signals.push({ signal: 'Uncertainty', contribution: uncertaintyScore, detail: uncertainty.reasons.join('; ') });
  }

  // Boost: if no rule match + no content signals + high uncertainty → likely missed abuse
  if (!rules.has_spam_rule && !rules.has_harassment_rule && !rules.has_low_quality_rule
      && spamScore === 0 && harassmentScore === 0 && lowQualityScore === 0
      && uncertaintyScore >= 3) {
    uncertaintyScore = Math.min(uncertaintyScore + 3, 10);
    signals.push({ signal: 'Rule-gap uncertainty', contribution: 3, detail: 'No rules matched but content is ambiguous — possible implicit abuse' });
  }

  // ── Adversarial Detection (0-10) — catch evasion ──
  const adversarial = detectAdversarial(fullText);
  const adversarialScore = adversarial.score;
  if (adversarial.reasons.length > 0) {
    signals.push({ signal: 'Adversarial pattern', contribution: adversarialScore, detail: adversarial.reasons.join('; ') });
  }

  // ── Anomaly Detection (0-10) — catch unusual / evasive content ──
  const anomaly = detectAnomaly(fullText);
  const anomalyScore = anomaly.score;
  if (anomaly.reasons.length > 0) {
    signals.push({ signal: 'Anomaly detected', contribution: anomalyScore, detail: anomaly.reasons.join('; ') });
  }

  // ══════════════════════════════════════════════════════════════
  // DOMINANT BUCKET AGGREGATION
  // Primary signal dominates. Secondary contributes at 30%.
  // Spillover buckets capped at 10% total.
  // Prevents double-counting when correlated buckets fire together.
  // ══════════════════════════════════════════════════════════════

  const contentBuckets = [
    { name: 'spam', score: spamScore },
    { name: 'harassment', score: harassmentScore },
    { name: 'lowQuality', score: lowQualityScore },
  ].sort((a, b) => b.score - a.score);

  const primary = contentBuckets[0]!;
  const secondary = contentBuckets[1]!;
  const spillover = contentBuckets.slice(2);

  const spilloverSum = spillover.reduce((s, b) => s + b.score, 0);
  const dominantContentScore = primary.score
    + secondary.score * 0.25
    + Math.min(spilloverSum * 0.05, 3);

  if (secondary.score > 0 && secondary.score > primary.score * 0.5) {
    signals.push({ signal: `Mixed signals: ${primary.name}+${secondary.name}`, contribution: 0, detail: `Primary ${primary.name}=${primary.score}, secondary ${secondary.name}=${secondary.score}` });
  }

  // ══════════════════════════════════════════════════════════════
  // ADDITIVE COMMUNITY SIGNALS (replaces multiplier)
  // Each signal is independently additive and explainable.
  // No hidden multiplicative effects.
  // ══════════════════════════════════════════════════════════════

  let reportScore = 0;
  let controversyScore = 0;
  let queuePressureScore = 0;
  const communityNotes: string[] = [];

  if (reportCount >= 5) { reportScore = 8; communityNotes.push(`${reportCount} reports`); }
  else if (reportCount >= 3) { reportScore = 5; communityNotes.push(`${reportCount} reports`); }
  else if (reportCount >= 1) { reportScore = 2; communityNotes.push(`${reportCount} report(s)`); }

  if (downvoteRatio < 0.4) { controversyScore = 5; communityNotes.push(`${Math.round(downvoteRatio * 100)}% upvoted`); }
  else if (downvoteRatio < 0.6) { controversyScore = 3; communityNotes.push(`${Math.round(downvoteRatio * 100)}% upvoted`); }

  if (timeInQueueMs > 3_600_000) { queuePressureScore = 2; communityNotes.push('aging in queue'); }
  if (relatedItemInQueue) { queuePressureScore = Math.max(queuePressureScore, 1); communityNotes.push('multiple items from author'); }

  const communityConcernScore = reportScore + controversyScore + queuePressureScore;

  if (communityNotes.length > 0) {
    signals.push({ signal: 'Community signals', contribution: communityConcernScore, detail: communityNotes.join('; ') });
  }

  // ══════════════════════════════════════════════════════════════
  // RECALL GATE — weighted fusion + stability banding
  // Weighted fusion prevents single-noise false positives.
  // Stability gate: requires uncertainty ≥ 3 to confirm structural risk.
  // ══════════════════════════════════════════════════════════════

  const recallScore = uncertaintyScore * 0.40 + adversarialScore * 0.35 + anomalyScore * 0.25;
  const recallTriggered = recallScore >= 5.5 && uncertaintyScore >= 3;

  if (recallTriggered) {
    signals.push({
      signal: 'Recall gate triggered',
      contribution: Math.round(recallScore),
      detail: `weighted=${recallScore.toFixed(1)} (u×0.4 + a×0.35 + an×0.25), uncertainty=${uncertaintyScore}≥3`,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // TOTAL SCORE
  // = dominant content + account context + community + detection
  // No multipliers. Fully additive. Every point explainable.
  // ══════════════════════════════════════════════════════════════

  const total = Math.min(Math.round(
    dominantContentScore + accountRiskScore + communityConcernScore + recallScore
  ), 100);

  let routing: RiskScore['routing'];
  if (recallTriggered || total >= 5) {
    routing = total >= 15 ? 'deep_ai' : 'light_ai';
  } else {
    routing = 'no_ai';
  }

  // Sort signals by contribution (highest first)
  signals.sort((a, b) => b.contribution - a.contribution);

  return {
    total,
    buckets: {
      spam: spamScore,
      harassment: harassmentScore,
      lowQuality: lowQualityScore,
      accountRisk: accountRiskScore,
      uncertainty: uncertaintyScore,
      adversarial: adversarialScore,
      anomaly: anomalyScore,
      communityConcern: communityConcernScore,
    },
    topSignals: signals.slice(0, 6),
    routing,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Legacy-compatible computeRiskScore
// ═══════════════════════════════════════════════════════════════════════

export function computeRiskScore(signals: ModerationSignals): RiskScore {
  // Legacy compat — approximate from old signal fields
  const raw =
    (signals.account_age_lt_7d ? 8 : 0) +
    (signals.karma_lt_10 ? 5 : 0) +
    Math.min(signals.prior_removals_in_sub * 3, 10) +
    (signals.prior_bans_in_sub ? 15 : 0) +
    (signals.link_count >= 3 ? 10 : signals.link_count >= 1 ? 4 : 0) +
    (signals.all_caps_ratio > 0.5 ? 5 : 0) +
    Math.min(signals.profanity_score * 3, 10) +
    Math.min(signals.spam_word_score * 4, 10) +
    (signals.word_count < 5 ? 5 : 0) +
    (signals.sentiment_score < -0.5 ? 6 : 0) +
    (signals.emoji_count > 5 ? 3 : 0) +
    (signals.critical_rule_match ? 25 : 0) +
    (signals.high_severity_match ? 16 : 0) +
    Math.min(signals.medium_severity_matches * 6, 12) +
    Math.min(signals.low_severity_matches * 2, 4) +
    Math.min(signals.report_count * 3, 10) +
    (signals.downvote_ratio < 0.5 ? 5 : signals.downvote_ratio < 0.7 ? 2 : 0) +
    (signals.posts_in_last_hour > 3 ? 6 : signals.posts_in_last_hour > 1 ? 3 : 0) +
    (signals.time_in_queue_ms > 3_600_000 ? 2 : 0) +
    (signals.related_item_in_queue ? 1 : 0);
  const total = Math.min(Math.round(raw), 100);

  let routing: RiskScore['routing'];
  if (total < 5) routing = 'no_ai';
  else if (total < 15) routing = 'light_ai';
  else routing = 'deep_ai';

  return {
    total,
    breakdown: { user: 0, content: 0, rule: 0, behavior: 0, queue: 0 },
    routing,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Full Signal Extraction (new bucket-based)
// ═══════════════════════════════════════════════════════════════════════

export interface FullScoringOutput {
  riskScore: RiskScore;
  buckets: BucketScores;
  topSignals: SignalBreakdown[];
}

export async function extractSignals(
  input: SignalExtractionInput,
): Promise<ModerationSignals> {
  // Legacy compat — still returns ModerationSignals for types.ts compat
  const content = extractContentSignals(input.title, input.body);
  const rules = extractRuleSignals(input.ruleMatches);
  const user = await extractUserSignals(input.author);

  const downvoteRatio =
    input.upvoteRatio ??
    (input.score <= 0 && input.reportCount > 0 ? 0.3 : 0.75);

  const timeInQueueMs = Date.now() - new Date(input.createdAt).getTime();

  let relatedItemInQueue = false;
  try {
    const raw = await redis.get('mg:queue');
    if (raw) {
      const queue = JSON.parse(raw);
      relatedItemInQueue = queue.some(
        (q: { author: string }) => q.author === input.author,
      );
    }
  } catch { /* ignore */ }

  // Legacy sentiment score mapping
  let sentimentScore: number;
  if (content.hostility.score >= 3) sentimentScore = -0.8;
  else if (content.hostility.score === 2) sentimentScore = -0.5;
  else if (content.hostility.score === 1) sentimentScore = -0.2;
  else sentimentScore = 0;

  return {
    // User
    account_age_days: user.account_age_days,
    account_age_lt_7d: user.account_age_days > 0 && user.account_age_days < 7,
    link_karma: user.link_karma,
    comment_karma: user.comment_karma,
    karma_lt_10: user.account_age_days > 0 && user.total_karma < 10,
    prior_removals_in_sub: user.removal_timestamps.length,
    prior_bans_in_sub: user.ban_timestamps.length > 0 ? 1 : 0,
    // Content
    word_count: content.word_count,
    link_count: content.link_count,
    all_caps_ratio: content.all_caps_ratio,
    profanity_score: content.profanity_score,
    spam_word_score: Math.min(Math.ceil(content.spam_phrase_count / 2), 4),
    sentiment_score: sentimentScore,
    emoji_count: content.emoji_count,
    // Rule
    ...rules,
    // Behavior
    report_count: input.reportCount,
    downvote_ratio: downvoteRatio,
    posts_in_last_hour: user.posts_in_last_hour,
    // Queue
    time_in_queue_ms: Math.max(0, timeInQueueMs),
    related_item_in_queue: relatedItemInQueue,
  };
}

/**
 * NEW: Full bucket-based scoring. Returns explainable breakdown.
 * This is the primary scoring entry point going forward.
 */
export async function computeFullScore(input: SignalExtractionInput): Promise<FullScoringOutput> {
  const content = extractContentSignals(input.title, input.body);
  const rules = extractRuleSignals(input.ruleMatches);
  const user = await extractUserSignals(input.author);

  const downvoteRatio =
    input.upvoteRatio ??
    (input.score <= 0 && input.reportCount > 0 ? 0.3 : 0.75);

  const timeInQueueMs = Date.now() - new Date(input.createdAt).getTime();

  let relatedItemInQueue = false;
  try {
    const raw = await redis.get('mg:queue');
    if (raw) {
      const queue = JSON.parse(raw);
      relatedItemInQueue = queue.some(
        (q: { author: string }) => q.author === input.author,
      );
    }
  } catch { /* ignore */ }

  const result = computeBucketScores(
    content, rules, user,
    input.reportCount, downvoteRatio,
    Math.max(0, timeInQueueMs), relatedItemInQueue,
    `${input.title} ${input.body}`,
  );

  return {
    riskScore: {
      total: result.total,
      breakdown: {
        user: result.buckets.accountRisk,
        content: result.buckets.spam + result.buckets.harassment + result.buckets.lowQuality,
        rule: 0,
        behavior: result.buckets.communityConcern,
        queue: 0,
      },
      routing: result.routing,
    },
    buckets: result.buckets,
    topSignals: result.topSignals,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Quick scoring for trigger path (sync-only)
// ═══════════════════════════════════════════════════════════════════════

export function computeQuickRiskScore(
  title: string,
  body: string,
  reportCount: number,
  score: number,
  ruleMatches: RuleMatch[],
): { riskScore: number; routing: RiskScore['routing'] } {
  const content = extractContentSignals(title, body);
  const rules = extractRuleSignals(ruleMatches);

  // In trigger path, user signals are unknown — use zero risk (optimistic)
  const user = {
    account_age_days: 0,
    link_karma: 0,
    comment_karma: 0,
    total_karma: 0,
    removal_timestamps: [] as number[],
    ban_timestamps: [] as number[],
    posts_in_last_hour: 0,
  };

  const downvoteRatio = score <= 0 && reportCount > 0 ? 0.3 : 0.75;

  const result = computeBucketScores(
    content, rules, user,
    reportCount, downvoteRatio,
    0, false,
    `${title} ${body}`,
  );

  return { riskScore: result.total, routing: result.routing };
}

// ── Helpers for ban/removal timestamp storage ──

export async function recordUserRemoval(author: string): Promise<void> {
  try {
    const raw = await redis.get(`mg:user:${author}:removals`);
    const timestamps: number[] = raw ? JSON.parse(raw) : [];
    timestamps.push(Date.now());
    // Keep last 30 entries
    if (timestamps.length > 30) timestamps.splice(0, timestamps.length - 30);
    await redis.set(`mg:user:${author}:removals`, JSON.stringify(timestamps));
  } catch { /* non-critical */ }
}

export async function recordUserBan(author: string): Promise<void> {
  try {
    const raw = await redis.get(`mg:user:${author}:bans`);
    const timestamps: number[] = raw ? JSON.parse(raw) : [];
    timestamps.push(Date.now());
    if (timestamps.length > 30) timestamps.splice(0, timestamps.length - 30);
    await redis.set(`mg:user:${author}:bans`, JSON.stringify(timestamps));
  } catch { /* non-critical */ }
}

// ═══════════════════════════════════════════════════════════════════════
// Recommendation Engine (deterministic — AI never sets action)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Deterministic recommendation engine.
 *
 * AI NEVER decides the action. AI only provides context (summary, tone, risk_factors).
 * This function determines action purely from bucket scores and rule matches.
 *
 * Confidence levels:
 *   90+  = near-certain (critical rule, clear violation)
 *   75-89 = high confidence (strong signals)
 *   60-74 = moderate (clear signals but room for judgment)
 *   50-59 = uncertain (grey zone, moderator discretion needed)
 */
/**
 * Deterministic recommendation engine.
 * AI never sets the action. Bucket scores determine the recommendation.
 * Confidence reflects how certain the system is — low confidence = moderator discretion.
 */
/**
 * STRICT PRIORITY LADDER — one content, one decision.
 * Higher tiers override lower tiers. No conflicts, no dual outputs.
 *
 *  L1: HARD SAFETY  — PII/doxxing/threats → REMOVE (non-negotiable)
 *  L2: RECALL       — recallGate triggered → REVIEW (override all)
 *  L3: HIGH SIGNAL  — harassment/spam ≥ 20 → REMOVE/SPAM
 *  L4: MODERATE     — harassment/spam ≥ 18 → REMOVE/SPAM
 *  L5: LOW SIGNAL   — accountRisk/lowQuality/spam≥12 → BAN/REMOVE
 *  L6: FALLBACK     — total score → APPROVE with confidence
 */
export function generateRecommendation(
  ruleMatches: RuleMatch[],
  riskScore: RiskScore,
  buckets: RiskBuckets,
  aiSummary?: string | null,
  aiAug?: AIAugmentation | null,
): ModRecommendation {
  // Apply AI augmentation with confidence weighting and 15% impact cap
  const augHarass = aiAug && aiAug.confidence > 0.5
    ? Math.round(aiAug.harassment_delta * aiAug.confidence)
    : 0;
  const harassment = Math.min(30, Math.max(0, buckets.harassment + augHarass));
  const augUncertainty = aiAug && aiAug.confidence > 0.5
    ? Math.round(aiAug.uncertainty_delta * aiAug.confidence)
    : 0;
  const aiAdversarial = aiAug?.adversarial_confirmation && (aiAug?.confidence ?? 0) > 0.5;

  const ctx = aiSummary ? ` AI: ${aiSummary.slice(0, 80)}` : '';
  const deltaNote = augHarass !== 0 ? ` [AI Δ=${augHarass > 0 ? '+' : ''}${augHarass}]` : '';

  // ── L1: HARD SAFETY ──
  const criticalMatch = ruleMatches.find((m) => m.matched && m.severity === 'critical');
  if (criticalMatch) {
    return { action: 'remove', confidence: 99,
      reasoning: `HARD SAFETY: ${criticalMatch.rule.title}. PII/doxxing/threats. Remove immediately.` };
  }

  // ── L2: RECALL OVERRIDE ──
  const recallGate = (buckets.uncertainty * 0.40 + buckets.adversarial * 0.35 + buckets.anomaly * 0.25) >= 5.5
    && buckets.uncertainty >= 3;
  if (recallGate || aiAdversarial) {
    return { action: 'approve', confidence: 45,
      reasoning: `RECALL OVERRIDE: structural risk detected (u=${buckets.uncertainty}, adv=${buckets.adversarial}, anom=${buckets.anomaly}). Review required.${ctx}` };
  }

  // ── L3: HIGH SIGNAL ──
  if (harassment >= 20) {
    return { action: 'remove', confidence: 90,
      reasoning: `HIGH: harassment=${harassment}/30${deltaNote}.${ctx}` };
  }
  if (buckets.spam >= 20) {
    return { action: 'spam', confidence: 88,
      reasoning: `HIGH: spam=${buckets.spam}/25.${ctx}` };
  }

  // ── L4: MODERATE ──
  if (harassment >= 18) {
    return { action: 'remove', confidence: 80,
      reasoning: `MODERATE: harassment=${harassment}/30${deltaNote}.${ctx}` };
  }
  if (buckets.spam >= 18) {
    return { action: 'spam', confidence: 78,
      reasoning: `MODERATE: spam=${buckets.spam}/25.${ctx}` };
  }

  // ── L5: LOW SIGNAL ──
  if (harassment >= 12) {
    return { action: 'remove', confidence: 68,
      reasoning: `LOW: harassment=${harassment}/30${deltaNote}.${ctx}` };
  }
  if (buckets.spam >= 12) {
    return { action: 'remove', confidence: 65,
      reasoning: `LOW: spam=${buckets.spam}/25.${ctx}` };
  }
  if (buckets.lowQuality >= 10 && (buckets.spam + harassment) < 5) {
    return { action: 'remove', confidence: 60,
      reasoning: `LOW: quality=${buckets.lowQuality}/15.${ctx}` };
  }
  if (buckets.accountRisk >= 15 && (buckets.spam + harassment) > 0) {
    return { action: 'ban', confidence: 65,
      reasoning: `LOW: account_risk=${buckets.accountRisk}/20 + content signals.${ctx}` };
  }

  // ── L6: SCORE FALLBACK ──
  if (riskScore.total >= 15) {
    return { action: 'approve', confidence: 55,
      reasoning: `FALLBACK: score=${riskScore.total}/100. Review suggested.${ctx}` };
  }
  if (riskScore.total >= 5) {
    return { action: 'approve', confidence: 70,
      reasoning: `FALLBACK: score=${riskScore.total}/100.${ctx}` };
  }
  return { action: 'approve', confidence: 95,
    reasoning: `SAFE: score=${riskScore.total}/100.` };
}
