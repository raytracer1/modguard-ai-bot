import { redis } from '@devvit/web/server';

interface AIEnhanceInput {
  title: string;
  body: string;
  author: string;
  matchedRules: Array<{ name: string; severity: string }>;
}

interface AIEnhanceOutput {
  summary: string;
  confidence: number;
}

interface AIConfig {
  provider: 'anthropic' | 'openai' | 'custom';
  apiKey: string;
  model?: string;
  endpoint?: string;
}

const DEFAULTS: Record<string, { model: string; endpoint: string }> = {
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

function buildAnthropicBody(model: string, prompt: string) {
  return {
    model,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  };
}

function buildOpenAIBody(model: string, prompt: string) {
  return {
    model,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  };
}

export async function enhanceWithAI(input: AIEnhanceInput): Promise<AIEnhanceOutput | null> {
  const config = await getAIConfig();
  if (!config) return null;

  const ruleNames = input.matchedRules.map((r) => `${r.name} (${r.severity})`).join(', ');
  const content = `Title: ${input.title || '(comment)'}\nBody: ${input.body.slice(0, 500)}`;

  const prompt = `You are a content moderation assistant. Analyze this content and matched rules.

Content:
${content}

Matched rules: ${ruleNames || 'None'}

Respond with JSON only:
{"summary": "2-3 sentence summary and whether content is problematic", "confidence": 0-100}`;

  const provider = config.provider || 'anthropic';
  const key = provider in DEFAULTS ? provider : 'anthropic';
  const def = DEFAULTS[key]!;
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
      body = buildAnthropicBody(model, prompt);
    } else if (provider === 'openai') {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      body = buildOpenAIBody(model, prompt);
    } else {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      body = buildAnthropicBody(model, prompt);
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error('AI API error:', res.status);
      return null;
    }

    const data = (await res.json()) as {
      content?: Array<{ text: string }>;
      choices?: Array<{ message: { content: string } }>;
    };

    const text =
      data.content?.[0]?.text ??
      data.choices?.[0]?.message?.content ??
      '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const result = JSON.parse(jsonMatch[0]) as AIEnhanceOutput;
    if (!result.summary || typeof result.confidence !== 'number') return null;

    return {
      summary: result.summary.slice(0, 300),
      confidence: Math.min(100, Math.max(0, Math.round(result.confidence))),
    };
  } catch (err) {
    console.error('AI enhancement failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
