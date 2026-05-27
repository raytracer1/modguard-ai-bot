import { redis } from '@devvit/web/server';
import type { AIAnalysisOutput, LightAIOutput, ModerationSignals, RiskScore, ModPrecedent } from '../../shared/types';

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

interface AIConfig {
  provider: 'anthropic' | 'openai' | 'custom';
  apiKey: string;
  model?: string;
  endpoint?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// Circuit Breaker
// ═══════════════════════════════════════════════════════════════════════

const CIRCUIT_BREAKER_KEY = 'mg:ai-circuit-breaker';
const FAILURE_COUNT_KEY = 'mg:ai-failure-count';
const CIRCUIT_BREAKER_TTL_SEC = 300;
const FAILURE_THRESHOLD = 3;
const AI_TIMEOUT_MS = 5000;

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
    // silent — circuit breaker failure shouldn't block moderation
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
// Config
// ═══════════════════════════════════════════════════════════════════════

const PROVIDER_DEFAULTS: Record<string, { model: string; endpoint: string }> = {
  anthropic: {
    model: 'claude-haiku-4-5-20251001',
    endpoint: 'https://api.anthropic.com/v1/messages',
  },
  openai: {
    model: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
};

async function getAIConfig(): Promise<AIConfig | null> {
  try {
    const raw = await redis.get('mg:ai-config');
    if (!raw) return null;
    const config = JSON.parse(raw) as AIConfig;
    if (!config.apiKey) return null;
    return config;
  } catch {
    return null;
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
// AI Call
// ═══════════════════════════════════════════════════════════════════════

function buildRequestBody(config: AIConfig, prompt: string) {
  const provider = config.provider || 'anthropic';
  const key = provider in PROVIDER_DEFAULTS ? provider : 'anthropic';
  const def = PROVIDER_DEFAULTS[key]!;
  const model = config.model || def.model;

  const systemWithExamples = SYSTEM_PROMPT + '\n\n' + FEW_SHOT_EXAMPLES;

  if (provider === 'anthropic') {
    return {
      model,
      max_tokens: 400,
      system: systemWithExamples,
      messages: [{ role: 'user' as const, content: prompt }],
    };
  }

  // OpenAI / custom
  return {
    model,
    max_tokens: 400,
    messages: [
      { role: 'system' as const, content: systemWithExamples },
      { role: 'user' as const, content: prompt },
    ],
  };
}

function buildRequestHeaders(config: AIConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.provider === 'anthropic') {
    headers['x-api-key'] = config.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }
  return headers;
}

function extractTextFromResponse(data: unknown, provider: string): string {
  const d = data as Record<string, unknown>;
  if (provider === 'anthropic') {
    const content = d.content as Array<{ text: string }> | undefined;
    return content?.[0]?.text ?? '';
  }
  const choices = d.choices as Array<{ message: { content: string } }> | undefined;
  return choices?.[0]?.message?.content ?? '';
}

// ═══════════════════════════════════════════════════════════════════════
// AI Result Cache (trigger pre-computation → expand-time read)
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check whether AI should be called for this content.
 * Returns false if: circuit breaker open, no config, or routing says skip.
 */
export async function shouldCallAI(routing: RiskScore['routing']): Promise<boolean> {
  if (routing === 'no_ai') return false;
  if (await isCircuitOpen()) return false;
  const config = await getAIConfig();
  return config !== null;
}

// ═══════════════════════════════════════════════════════════════════════
// Light AI — fast, cheap, minimal. For low-mid ambiguity (score 16-35).
// ~200 input tokens, ~100 output. Cost ~$0.0002/call on Haiku.
// ═══════════════════════════════════════════════════════════════════════

export async function callLightAI(input: {
  title: string;
  body: string;
  author: string;
  matchedRules: Array<{ name: string; severity: string }>;
  riskScore: number;
}): Promise<LightAIOutput | null> {
  const config = await getAIConfig();
  if (!config) return null;

  const ruleNames = input.matchedRules.map((r) => `${r.name} (${r.severity})`).join(', ') || 'none';

  const prompt = `Quick moderation scan:
Content: "${input.title || '(comment)'} ${input.body.slice(0, 300)}"
By: ${input.author}
Rules matched: ${ruleNames}
Risk score: ${input.riskScore}/100

Respond with ONLY this JSON (no other text):
{"summary":"1-sentence neutral summary","needs_deep_review":true/false,"primary_concern":"<single phrase or null>","confidence":0.0-1.0}

Rules:
- Use uncertainty language ("may", "possible", "signals suggest")
- "needs_deep_review": true only if you see genuine ambiguity that needs deeper analysis
- "primary_concern": the single biggest moderation concern, or null if none
- Be brief. This is a triage scan.`;

  const provider = config.provider || 'anthropic';
  const key = provider in PROVIDER_DEFAULTS ? provider : 'anthropic';
  const def = PROVIDER_DEFAULTS[key]!;
  const model = config.model || def.model;
  const endpoint = config.endpoint || def.endpoint;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: unknown;
    if (provider === 'anthropic') {
      headers['x-api-key'] = config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      body = { model, max_tokens: 100, system: 'Triage scanner. One sentence. JSON only.', messages: [{ role: 'user', content: prompt }] };
    } else {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      body = { model, max_tokens: 100, messages: [{ role: 'system', content: 'Triage scanner. One sentence. JSON only.' }, { role: 'user', content: prompt }] };
    }

    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = (await res.json()) as { content?: Array<{ text: string }>; choices?: Array<{ message: { content: string } }> };
    const text = data.content?.[0]?.text ?? data.choices?.[0]?.message?.content ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.summary || typeof parsed.confidence !== 'number') return null;

    return {
      summary: parsed.summary.slice(0, 200),
      needs_deep_review: parsed.needs_deep_review === true,
      primary_concern: typeof parsed.primary_concern === 'string' ? parsed.primary_concern : null,
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
    };
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/**
 * Call AI for deep context analysis of grey-zone content.
 * Returns null on any failure — caller falls back to rule-based analysis.
 */
export async function callAIForDeepAnalysis(input: AIAnalysisInput): Promise<AIAnalysisOutput | null> {
  const config = await getAIConfig();
  if (!config) return null;

  const prompt = buildUserPrompt(input);
  const body = buildRequestBody(config, prompt);
  const headers = buildRequestHeaders(config);
  const endpoint = config.endpoint || PROVIDER_DEFAULTS[config.provider]?.endpoint || PROVIDER_DEFAULTS.anthropic.endpoint;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error('AI API error:', res.status);
      await recordAIFailure();
      return null;
    }

    const data = await res.json();
    const text = extractTextFromResponse(data, config.provider);

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('AI response contained no JSON');
      await recordAIFailure();
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error('AI response JSON parse failed');
      await recordAIFailure();
      return null;
    }

    const validated = validateAIOutput(parsed);
    if (!validated) {
      console.error('AI response failed schema validation');
      await recordAIFailure();
      return null;
    }

    // Post-process: enforce uncertainty language
    validated.summary = stripCertaintyLanguage(validated.summary);

    await recordAISuccess();
    return validated;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn('AI call timed out after', AI_TIMEOUT_MS, 'ms');
    } else {
      console.error('AI call failed:', err instanceof Error ? err.message : err);
    }
    await recordAIFailure();
    return null;
  }
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

// ── Legacy API for backward compat ──

export async function enhanceWithAI(input: {
  title: string;
  body: string;
  author: string;
  matchedRules: Array<{ name: string; severity: string }>;
}): Promise<{ summary: string; confidence: number } | null> {
  const config = await getAIConfig();
  if (!config) return null;

  const ruleNames = input.matchedRules.map((r) => `${r.name} (${r.severity})`).join(', ');
  const prompt = `Content: "${input.title || '(comment)'} ${input.body.slice(0, 500)}"\nMatched rules: ${ruleNames || 'None'}\n\nProvide a 2-3 sentence moderation context analysis. Do NOT state whether content IS a violation — use uncertainty language ("may indicate", "possible", "signals suggest"). Respond with JSON: {"summary": "...", "confidence": 0-100}`;

  const provider = config.provider || 'anthropic';
  const key = provider in PROVIDER_DEFAULTS ? provider : 'anthropic';
  const def = PROVIDER_DEFAULTS[key]!;
  const model = config.model || def.model;
  const endpoint = config.endpoint || def.endpoint;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: unknown;
    if (provider === 'anthropic') {
      headers['x-api-key'] = config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      body = {
        model,
        max_tokens: 256,
        system: 'You are a moderation context analyst. Use uncertainty language. Do not state content IS a violation.',
        messages: [{ role: 'user', content: prompt }],
      };
    } else {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      body = {
        model,
        max_tokens: 256,
        messages: [
          { role: 'system', content: 'You are a moderation context analyst. Use uncertainty language. Do not state content IS a violation.' },
          { role: 'user', content: prompt },
        ],
      };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = (await res.json()) as {
      content?: Array<{ text: string }>;
      choices?: Array<{ message: { content: string } }>;
    };
    const text = data.content?.[0]?.text ?? data.choices?.[0]?.message?.content ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const result = JSON.parse(jsonMatch[0]) as { summary: string; confidence: number };
    if (!result.summary || typeof result.confidence !== 'number') return null;

    return {
      summary: result.summary.slice(0, 300),
      confidence: Math.min(100, Math.max(0, Math.round(result.confidence))),
    };
  } catch {
    return null;
  }
}
