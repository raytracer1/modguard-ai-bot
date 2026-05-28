import { redis } from '@devvit/web/server';
import type { AIAnalysisOutput, LightAIOutput, ModerationSignals, RiskScore, ModPrecedent } from '../../shared/types';
import { OPENAI_API_KEY } from './api-key';

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export interface AIAnalysisInput {
  title: string;
  body: string;
  author: string;
  type: 'post' | 'comment';
  signals: ModerationSignals;
  riskScore: RiskScore;
  matchedRules: Array<{ name: string; severity: string; reason: string; confidence: number }>;
  recentUserContent: Array<{ type: string; subreddit: string; title: string; score: number; removed: boolean }>;
  precedents: ModPrecedent[];
}

// ═══════════════════════════════════════════════════════════════════════
// OpenAI API Config
// ═══════════════════════════════════════════════════════════════════════

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';
const AI_TIMEOUT_MS = 5000;

function getAPIKey(): string | null {
  return OPENAI_API_KEY || null;
}

// ═══════════════════════════════════════════════════════════════════════
// Circuit Breaker
// ═══════════════════════════════════════════════════════════════════════

const CIRCUIT_BREAKER_KEY = 'mg:ai-circuit-breaker';
const FAILURE_COUNT_KEY = 'mg:ai-failure-count';
const CIRCUIT_BREAKER_TTL_SEC = 300;
const FAILURE_THRESHOLD = 3;

async function isCircuitOpen(): Promise<boolean> {
  try {
    const breaker = await redis.get(CIRCUIT_BREAKER_KEY);
    return breaker === 'open';
  } catch {
    return false;
  }
}

async function recordAIFailure(): Promise<void> {
  try {
    const raw = await redis.get(FAILURE_COUNT_KEY);
    const count = (raw ? parseInt(raw, 10) : 0) + 1;
    if (count >= FAILURE_THRESHOLD) {
      await redis.set(CIRCUIT_BREAKER_KEY, 'open');
      await redis.expire(CIRCUIT_BREAKER_KEY, CIRCUIT_BREAKER_TTL_SEC);
      await redis.del(FAILURE_COUNT_KEY);
    } else {
      await redis.set(FAILURE_COUNT_KEY, String(count));
      await redis.expire(FAILURE_COUNT_KEY, 120);
    }
  } catch {
    // silent
  }
}

async function recordAISuccess(): Promise<void> {
  try {
    await redis.del(FAILURE_COUNT_KEY);
  } catch {
    // silent
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Prompt Engineering
// ═══════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are a moderation context analyst for Reddit. You do NOT decide if content should be removed.
Your role is to provide structured, uncertainty-aware context analysis that helps a human moderator make faster, more consistent decisions.

CRITICAL RULES:
1. Never state that content IS or IS NOT a violation. Use uncertainty language: "may indicate", "possible", "signals suggest", "could be interpreted as"
2. Never recommend a specific action (remove/approve/ban). The recommended_review_action field is about review approach, not the final decision.
3. Always note when context is insufficient to draw conclusions.
4. Consider cultural context, sarcasm, humor, and hyperbole as alternative interpretations.
5. If the content is in a non-English language, note this and do NOT attempt detailed tone analysis.
6. Be concise. Every field should be 1-3 sentences max, except summary (2-4 sentences).
7. Do not moralize or express personal opinions about the content.

Your output MUST be valid JSON matching the schema exactly. No text outside the JSON.`;

function buildUserPrompt(input: AIAnalysisInput): string {
  const ruleLines = input.matchedRules.length > 0
    ? input.matchedRules.map(r =>
        `  - [${r.severity}] ${r.name}: ${r.reason} (confidence: ${r.confidence}%)`
      ).join('\n')
    : '  No rules matched';

  const recentContentLines = input.recentUserContent.length > 0
    ? input.recentUserContent.map(c =>
        `  - [${c.type}] in r/${c.subreddit}: "${c.title.slice(0, 80)}" (${c.score} pts, removed: ${c.removed})`
      ).join('\n')
    : '  No recent content data available';

  const precedentLines = input.precedents.length > 0
    ? input.precedents.slice(0, 5).map(p =>
        `  - "${p.contentExcerpt.slice(0, 100)}" → ${p.outcome} (reason: ${p.reason})`
      ).join('\n')
    : '  No similar precedents available';

  return `Analyze the following content for moderation context.

── CONTENT ──
Type: ${input.type}
Title: ${input.title || '(no title — comment)'}
Body: ${input.body.slice(0, 800)}

── AUTHOR CONTEXT ──
Username: ${input.author}
Account age: ${input.signals.account_age_days} days${input.signals.account_age_lt_7d ? ' (NEW ACCOUNT - less than 7 days old)' : ''}
Link karma: ${input.signals.link_karma}
Comment karma: ${input.signals.comment_karma}
Prior removals in subreddit: ${input.signals.prior_removals_in_sub}
Prior bans in subreddit: ${input.signals.prior_bans_in_sub}
Posts in last hour: ${input.signals.posts_in_last_hour}

── COMMUNITY SIGNALS ──
Reports: ${input.signals.report_count}
Downvote ratio: ${Math.round(input.signals.downvote_ratio * 100)}%
Risk score: ${input.riskScore.total}/100 (routing: ${input.riskScore.routing})

── RULE ENGINE RESULTS ──
${ruleLines}

── RECENT USER CONTENT ──
${recentContentLines}

── SIMILAR PRECEDENTS ──
${precedentLines}

Analyze and return JSON.`;

  // Few-shot examples are embedded as system context, not in user prompt
  // See FEW_SHOT_PREFIX below
}

const FEW_SHOT_EXAMPLES = `
EXAMPLE OF GOOD ANALYSIS:

INPUT:
Content: "I made a free tool that helps mods track rule violations — github.com/username/mod-tracker. Would love feedback from actual moderators on what features to add next."
Author: 2yr account, 5000 karma, 0 prior removals
Reports: 2, Risk score: 45/100
Rule match: "No spam or self-promotion" (medium, 65%)

CORRECT OUTPUT:
{
  "summary": "User is sharing a self-made tool relevant to the subreddit's interests. The post solicits feedback rather than purely promoting. Context shows a legitimate community member (2yr, 5k karma, no priors) seeking engagement rather than driving clicks.",
  "risk_factors": [
    { "signal": "External link to personal project", "strength": "moderate", "explanation": "..." },
    { "signal": "Two user reports for spam", "strength": "low", "explanation": "..." }
  ],
  "possible_rule_matches": [
    { "rule": "No spam or self-promotion", "relevance": "partial", "explanation": "..." }
  ],
  "tone_analysis": {
    "primary_tone": "helpful/contributing", "secondary_tones": ["self-promotional"],
    "certainty": "moderate", "notes": "..."
  },
  "precedent_summary": "Similar cases of community-made tools by established members are typically approved.",
  "recommended_review_action": "moderator_discretion",
  "confidence": 0.55,
  "augmentation": {
    "harassment_delta": 0,
    "uncertainty_delta": 1,
    "adversarial_confirmation": false,
    "confidence": 0.55
  }
}

AUGMENTATION RULES:
- harassment_delta: -3 to +3 only. Positive = AI sees more harassment than rules detected.
- uncertainty_delta: -2 to +2 only. Positive = AI is more uncertain than signals suggest.
- adversarial_confirmation: true if AI detects intentional evasion/coded speech.
- confidence: 0.0-1.0. Deltas are weighted by confidence before application.
- Be conservative. Most deltas should be 0 or ±1. Never use extreme values.

NOW ANALYZE THE ACTUAL CONTENT BELOW:`;

// ═══════════════════════════════════════════════════════════════════════
// JSON Schema Validation
// ═══════════════════════════════════════════════════════════════════════

function validateAIOutput(parsed: unknown): AIAnalysisOutput | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;

  // Required string fields
  if (typeof p.summary !== 'string' || p.summary.length < 10) return null;
  if (typeof p.precedent_summary !== 'string') return null;
  if (typeof p.confidence !== 'number' || p.confidence < 0 || p.confidence > 1) return null;

  // recommended_review_action enum
  const validActions = ['approve_likely_safe', 'moderator_discretion', 'escalate_for_review'];
  if (typeof p.recommended_review_action !== 'string' || !validActions.includes(p.recommended_review_action)) {
    return null;
  }

  // risk_factors array
  if (!Array.isArray(p.risk_factors)) return null;
  for (const rf of p.risk_factors) {
    if (typeof rf.signal !== 'string' || typeof rf.explanation !== 'string') return null;
    if (!['low', 'moderate', 'high'].includes(rf.strength)) return null;
  }

  // possible_rule_matches array
  if (!Array.isArray(p.possible_rule_matches)) return null;
  for (const prm of p.possible_rule_matches) {
    if (typeof prm.rule !== 'string' || typeof prm.explanation !== 'string') return null;
    if (!['unlikely', 'partial', 'likely', 'definite'].includes(prm.relevance)) return null;
  }

  // tone_analysis object
  if (!p.tone_analysis || typeof p.tone_analysis !== 'object') return null;
  const ta = p.tone_analysis as Record<string, unknown>;
  if (typeof ta.primary_tone !== 'string') return null;
  if (!Array.isArray(ta.secondary_tones) || !ta.secondary_tones.every((t: unknown) => typeof t === 'string')) return null;
  if (!['low', 'moderate', 'high'].includes(ta.certainty as string)) return null;
  if (typeof ta.notes !== 'string') return null;

  // augmentation (optional for backward compat)
  if (p.augmentation && typeof p.augmentation === 'object') {
    const aug = p.augmentation as Record<string, unknown>;
    if (typeof aug.harassment_delta === 'number') aug.harassment_delta = Math.max(-3, Math.min(3, Math.round(aug.harassment_delta)));
    else aug.harassment_delta = 0;
    if (typeof aug.uncertainty_delta === 'number') aug.uncertainty_delta = Math.max(-2, Math.min(2, Math.round(aug.uncertainty_delta)));
    else aug.uncertainty_delta = 0;
    if (typeof aug.adversarial_confirmation !== 'boolean') aug.adversarial_confirmation = false;
    if (typeof aug.confidence !== 'number') aug.confidence = 0.5;
  } else {
    (p as Record<string, unknown>).augmentation = { harassment_delta: 0, uncertainty_delta: 0, adversarial_confirmation: false, confidence: 0 };
  }

  return p as AIAnalysisOutput;
}

// ═══════════════════════════════════════════════════════════════════════
// OpenAI API Call Helper
// ═══════════════════════════════════════════════════════════════════════

async function callAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  timeoutMs: number = AI_TIMEOUT_MS,
): Promise<string | null> {
  const apiKey = getAPIKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error('OpenAI API error:', res.status);
      return null;
    }

    const data = (await res.json()) as { choices?: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn('OpenAI call timed out after', timeoutMs, 'ms');
    } else {
      console.error('OpenAI call failed:', err instanceof Error ? err.message : err);
    }
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════

export async function shouldCallAI(routing: RiskScore['routing']): Promise<boolean> {
  if (routing === 'no_ai') return false;
  if (await isCircuitOpen()) return false;
  return getAPIKey() !== null;
}

// ── Light AI ──

export async function callLightAI(input: {
  title: string;
  body: string;
  author: string;
  matchedRules: Array<{ name: string; severity: string }>;
  riskScore: number;
}): Promise<LightAIOutput | null> {
  const apiKey = getAPIKey();
  if (!apiKey) return null;

  const ruleNames = input.matchedRules.map((r) => `${r.name} (${r.severity})`).join(', ') || 'none';

  const text = await callAI(
    'Triage scanner. One sentence. JSON only. Use uncertainty language.',
    `Quick moderation scan:\nContent: "${input.title || '(comment)'} ${input.body.slice(0, 300)}"\nBy: ${input.author}\nRules matched: ${ruleNames}\nRisk score: ${input.riskScore}/100\n\nRespond with ONLY this JSON (no other text):\n{"summary":"1-sentence neutral summary","needs_deep_review":true/false,"primary_concern":"<single phrase or null>","confidence":0.0-1.0}`,
    100,
    3000,
  );
  if (!text) return null;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.summary || typeof parsed.confidence !== 'number') return null;
    return {
      summary: parsed.summary.slice(0, 200),
      needs_deep_review: parsed.needs_deep_review === true,
      primary_concern: typeof parsed.primary_concern === 'string' ? parsed.primary_concern : null,
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
    };
  } catch {
    return null;
  }
}

// ── Deep AI ──

export async function callAIForDeepAnalysis(input: AIAnalysisInput): Promise<AIAnalysisOutput | null> {
  const apiKey = getAPIKey();
  if (!apiKey) return null;

  const systemWithExamples = SYSTEM_PROMPT + '\n\n' + FEW_SHOT_EXAMPLES;
  const prompt = buildUserPrompt(input);

  const text = await callAI(systemWithExamples, prompt, 400, AI_TIMEOUT_MS);
  if (!text) {
    await recordAIFailure();
    return null;
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) { await recordAIFailure(); return null; }

  let parsed: unknown;
  try { parsed = JSON.parse(jsonMatch[0]); }
  catch { await recordAIFailure(); return null; }

  const validated = validateAIOutput(parsed);
  if (!validated) { await recordAIFailure(); return null; }

  validated.summary = stripCertaintyLanguage(validated.summary);
  await recordAISuccess();
  return validated;
}

// ── Post-processing: strip certainty language ──

const CERTAINTY_PATTERNS = [
  /\bthis is (definitely|clearly|obviously|absolutely|certainly|undoubtedly)\b/gi,
  /\bthis (is|constitutes|represents) (spam|harassment|hate speech|a violation)\b/gi,
  /\b(without question|without a doubt|no doubt|for sure)\b/gi,
  /\b(must be|has to be|needs to be) (removed|banned|deleted)\b/gi,
];

function stripCertaintyLanguage(text: string): string {
  let result = text;
  for (const pattern of CERTAINTY_PATTERNS) {
    result = result.replace(pattern, (match) => {
      // Replace with uncertainty equivalent
      if (/definitely|clearly|obviously|absolutely|certainly|undoubtedly/i.test(match)) return 'may be';
      if (/this is spam|this is harassment|this is hate speech/i.test(match)) return 'signals may indicate this is';
      if (/without question|without a doubt|no doubt|for sure/i.test(match)) return 'likely';
      if (/must be|has to be|needs to be/i.test(match)) return 'may warrant being';
      return match;
    });
  }
  return result;
}

