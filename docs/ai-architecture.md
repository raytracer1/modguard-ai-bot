# ModGuard AI — Three-Layer Moderation Intelligence Architecture

## A. Architecture Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MODERATOR UI (splash.tsx)                     │
│   Queue → Expand → Context Panel → Risk Signals → Decision Buttons  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ POST /api/context
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CONTEXT ENGINE (context-engine.ts)                │
│   Orchestrates: Score → Route → Analyze → Recommend → Return        │
└───────┬──────────────────┬──────────────────┬───────────────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────────┐
│ LAYER 1       │  │ LAYER 2       │  │ LAYER 3           │
│ Fast Scoring  │  │ AI Context    │  │ Recommendation    │
│ Engine        │  │ Reasoning     │  │ Engine            │
│               │  │               │  │                   │
│ • Rule-based  │  │ • LLM call    │  │ • Deterministic   │
│ • Heuristic   │  │ • Only when   │  │ • Never AI-decided│
│ • < 1ms       │  │   score 30-70 │  │ • Maps AI signals │
│ • No AI       │  │ • 5s timeout  │  │   → actions       │
│               │  │ • Structured  │  │                   │
│               │  │   JSON output │  │                   │
└───────────────┘  └───────────────┘  └───────────────────┘
        │                  │                  │
        └──────────────────┴──────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                    │
│   Redis KV: mg:queue, mg:rules, mg:ai-config, mg:precedents         │
│   Reddit API: user profile, post/comment data, mod actions          │
└─────────────────────────────────────────────────────────────────────┘
```

**Key principle**: AI never touches obvious content (score < 30 or > 70). It only analyzes the grey zone.

---

## B. End-to-End Moderation Flow

```
CONTENT CREATED (post/comment)
        │
        ▼
[Trigger: onContentCreate]
        │
        ▼
[Layer 1: Fast Scoring Engine]
  • Extract all signals (user, content, behavior, reports, rules)
  • Compute risk score (0-100)
  • Determine routing tier
        │
        ├── Score 0-30: NEGLIGIBLE RISK
        │     → Skip AI entirely
        │     → Auto-recommend APPROVE (confidence 90%+)
        │     → Do NOT add to queue (optional: add if user wants visibility)
        │
        ├── Score 30-70: AMBIGUOUS (GREY ZONE)
        │     → Add to queue with priority = score
        │     → Flag for AI deep analysis
        │     → AI analyzes: context, intent, tone, precedent
        │     → Recommendation engine maps signals → action
        │     → UI: full explainability panel
        │
        └── Score 70-100: HIGH RISK
              → Skip AI (waste of latency/cost)
              → Rule engine already has high confidence
              → Auto-recommend REMOVE (confidence 85-98%)
              → Add to queue with high priority
              → UI: critical alert styling
        │
        ▼
[MODERATOR VIEWS QUEUE]
        │
        ▼
[Expand Item → POST /api/context]
  • Re-run scoring (data may be stale from trigger)
  • Determine if AI analysis needed (score 30-70)
  • If yes → call AI (5s timeout, fallback to rule-engine)
  • Build ModContext with all signals
  • Return to UI
        │
        ▼
[MODERATOR MAKES DECISION]
  • Reads risk signals, AI analysis, recommendation
  • Clicks: Approve / Remove / Spam / Ban
  • POST /api/decision
  • Action executed via Reddit API
  • Decision recorded as precedent
```

---

## C. Scoring Engine Design

### C.1 Signals Taxonomy

#### A. User Signals (U)
| Feature | Risk Meaning | Extraction |
|---|---|---|
| `account_age_days` | New accounts = higher risk of spam/ban evasion | Reddit API `created_utc` |
| `link_karma` | Very low karma → possible throwaway | Reddit API `link_karma` |
| `comment_karma` | Negative karma → troll/bad actor | Reddit API `comment_karma` |
| `is_verified_email` | Unverified → higher risk | Reddit API `has_verified_email` |
| `account_age_lt_7d` | New account flag | Derived: age < 7 days |
| `karma_lt_10` | Low-karma flag | Derived: combined karma < 10 |
| `prior_removals_in_sub` | Repeat offender | Redis `mg:user:<name>:removals` |
| `prior_bans_in_sub` | Previously banned | Redis `mg:user:<name>:bans` |
| `removal_rate_30d` | High removal % = problem user | Redis counter |

#### B. Content Signals (C)
| Feature | Risk Meaning | Extraction |
|---|---|---|
| `word_count` | Very short → low effort; very long → possible spam | `.split(/\s+/).length` |
| `link_count` | Many links → spam/self-promotion | Regex count URLs |
| `all_caps_ratio` | SHOUTING → incivility | `[A-Z]{2,}` ratio |
| `exclamation_count` | Excessive !!! → spam/low quality | Count `!` chars |
| `question_mark_count` | Excessive ??? → clickbait | Count `?` chars |
| `emoji_count` | Emoji spam | Unicode emoji ranges |
| `repeated_char_ratio` | "soooo goooood" → low quality | Consecutive same-char ratio |
| `contains_image_link` | Image-only post → context-light | Check for image URL patterns |
| `profanity_score` | Slurs/swears → hostility | Dictionary lookup |
| `spam_word_score` | "buy now", "click here" etc. | Dictionary lookup |
| `sentiment_score` | -1 (hostile) to 1 (positive) | Dictionary-based |
| `caps_lock_title` | ALL CAPS TITLE | Title check |

#### C. Subreddit Rule Signals (R)
| Feature | Risk Meaning | Extraction |
|---|---|---|
| `rule_match_count` | How many rules triggered | Rule engine output |
| `max_rule_severity` | Worst severity matched | `max(severity_weights)` |
| `critical_rule_match` | PII/doxxing → immediate action | Boolean |
| `high_severity_match` | Harassment/hate → likely remove | Boolean |
| `medium_severity_matches` | Count of medium matches | Count |
| `low_severity_matches` | Count of low matches | Count |
| `custom_rule_match` | Sub-specific rule triggered | Boolean |

#### D. Behavioral Signals (B)
| Feature | Risk Meaning | Extraction |
|---|---|---|
| `report_count` | Community concern level | `post.numReports` |
| `report_rate` | Reports relative to views | `reports / max(score, 1)` |
| `downvote_ratio` | Community disagreement | `post.upvoteRatio` |
| `comment_count` | High engagement → controversial | `post.numComments` |
| `score_velocity` | Rapid downvoting → bad content | Needs time-series |
| `time_since_last_post` | Flooding/spam behavior | Redis `mg:user:<name>:last_post_ts` |
| `posts_in_last_hour` | Rate limiting signal | Redis counter |
| `thread_depth` | Deep reply chains → escalation | Comment depth |
| `replied_to_own_post` | Self-reply for bumping | Author check |

#### E. Moderator Queue Signals (Q)
| Feature | Risk Meaning | Extraction |
|---|---|---|
| `time_in_queue_ms` | Stale items → urgency | `now - createdAt` |
| `is_re_reported` | Previously approved now reported again | Redis flag |
| `prior_mod_actions_on_user` | Pattern of behavior | Redis counter |
| `related_item_in_queue` | Same user has other items flagged | Queue scan |
| `mod_note_count` | Other mods flagged concern | Reddit API mod notes |

### C.2 Heuristic Risk Scoring Formula

```typescript
function computeRiskScore(signals: Signals): number {
  // ── User risk sub-score (0-25) ──
  const U =
    (signals.account_age_lt_7d ? 15 : 0) +
    (signals.karma_lt_10 ? 10 : 0) +
    Math.min(signals.prior_removals_in_sub * 5, 15) +
    (signals.prior_bans_in_sub ? 25 : 0);

  const userScore = Math.min(U, 25);

  // ── Content risk sub-score (0-30) ──
  const C =
    (signals.link_count >= 3 ? 10 : signals.link_count >= 1 ? 5 : 0) +
    (signals.all_caps_ratio > 0.5 ? 8 : 0) +
    Math.min(signals.profanity_score * 3, 12) +
    Math.min(signals.spam_word_score * 4, 12) +
    (signals.word_count < 5 ? 8 : 0) +
    (signals.sentiment_score < -0.5 ? 6 : 0) +
    (signals.emoji_count > 5 ? 5 : 0);

  const contentScore = Math.min(C, 30);

  // ── Rule match sub-score (0-25) ──
  const R =
    (signals.critical_rule_match ? 25 : 0) +
    (signals.high_severity_match ? 18 : 0) +
    Math.min((signals.medium_severity_matches ?? 0) * 8, 16) +
    Math.min((signals.low_severity_matches ?? 0) * 3, 9);

  const ruleScore = Math.min(R, 25);

  // ── Behavioral sub-score (0-15) ──
  const B =
    Math.min(signals.report_count * 6, 15) +
    (signals.downvote_ratio < 0.5 ? 8 : signals.downvote_ratio < 0.7 ? 4 : 0) +
    (signals.posts_in_last_hour > 3 ? 8 : signals.posts_in_last_hour > 1 ? 4 : 0);

  const behaviorScore = Math.min(B, 15);

  // ── Queue sub-score (0-5) ──
  const Q =
    (signals.time_in_queue_ms > 3_600_000 ? 3 : 0) +  // stale > 1hr
    (signals.related_item_in_queue ? 2 : 0);

  const queueScore = Math.min(Q, 5);

  // ── Weighted total ──
  const total = userScore + contentScore + ruleScore + behaviorScore + queueScore;

  return Math.min(Math.round(total), 100);
}
```

**Design rationale**:
- U (25%) — user history is important but not dominant; a new account isn't automatically spam
- C (30%) — content is the strongest signal; what was actually said matters most
- R (25%) — rule matches are high-weight because subreddit rules are the ground truth
- B (15%) — community signals (reports, votes) are informative but can be gamed
- Q (5%) — queue staleness is a minor urgency signal, not a risk signal

The formula is **fully explainable**: every point can be traced to a specific signal. Moderators can see exactly why a score is what it is.

### C.3 Routing Thresholds

```
SCORE 0–30: NEGLIGIBLE RISK — ROUTE "NO AI"
  • Clear non-violation content
  • Low-karma user posting helpful content
  • False positive rule match (single low-confidence medium)
  → AI would add no value; deterministic recommendation is APPROVE
  → Latency: < 1ms (scoring only)
  → Cost: $0

SCORE 30–70: AMBIGUOUS — ROUTE "AI DEEP ANALYSIS"
  • Mixed signals: some reports but unclear violation
  • Medium-severity rule match with confounding context
  • User has history but content might be okay
  • Tone is borderline (sarcasm, humor, cultural context)
  → THIS is where AI adds value — interpreting ambiguity
  → Latency: 500-5000ms (includes LLM call)
  → Cost: ~$0.001-0.005 per analysis (Claude Haiku)

SCORE 70–100: HIGH RISK — ROUTE "NO AI"  
  • Critical rule match (PII, doxxing, clear hate speech)
  • Multiple high-severity matches
  • Highly reported + strong content signals + repeat offender
  → AI is unnecessary; rules + heuristics are conclusive
  → Adding AI risks hallucinated nuance ("maybe they meant well")
  → Latency: < 1ms (scoring only)
  → Cost: $0
```

**Why these thresholds?**
- 30/70 split creates a wide "grey zone" — most ambiguous content falls here
- Below 30: nearly all signals point to safe content; AI would just confirm the obvious
- Above 70: strong rule matches + behavioral signals make the case clear; AI could only confuse
- The 30-70 band is calibrated so ~60-70% of queue items skip AI entirely

---

## D. Prompt Engineering

### D.1 System Prompt

```
You are a moderation context analyst for Reddit. You do NOT decide if content should be removed.
Your role is to provide structured, uncertainty-aware context analysis that helps a human moderator make faster, more consistent decisions.

CRITICAL RULES:
1. Never state that content IS or IS NOT a violation. Use uncertainty language: "may indicate", "possible", "signals suggest", "could be interpreted as"
2. Never recommend a specific action (remove/approve/ban). The moderator decides.
3. Always note when context is insufficient to draw conclusions.
4. Consider cultural context, sarcasm, and humor as alternative interpretations.
5. If the content is in a non-English language, note this and do NOT attempt to analyze tone.

Your output MUST be valid JSON matching the schema exactly. No text outside the JSON.
```

### D.2 User Prompt Template

```
Analyze the following content for moderation context.

── CONTENT ──
Type: {{type}}
Title: {{title}}
Body: {{body}}

── AUTHOR CONTEXT ──
Username: {{author}}
Account age: {{account_age_days}} days
Karma: {{karma}} (link: {{link_karma}}, comment: {{comment_karma}})
Prior removals in this subreddit: {{prior_removals}}
Prior bans: {{prior_bans}}

── COMMUNITY SIGNALS ──
Reports: {{report_count}}
Score: {{score}}
Upvote ratio: {{upvote_ratio}}%

── RULE ENGINE RESULTS ──
Matched rules:
{{#each matched_rules}}
  - [{{severity}}] {{name}}: {{reason}} (confidence: {{confidence}}%)
{{/each}}

Risk score: {{risk_score}}/100 (routing: {{routing_tier}})

── RECENT USER CONTENT ──
{{#each recent_posts}}
  - [{{type}}] in r/{{subreddit}}: "{{title}}" ({{score}} pts, removed: {{removed}})
{{/each}}

Analyze and return JSON.
```

### D.3 Few-Shot Examples

**Example 1: Ambiguous self-promotion**

Input:
```
Content: "I made a free tool that helps mods track rule violations — github.com/username/mod-tracker. Would love feedback from actual moderators on what features to add next."
Author: 2yr account, 5000 karma, 0 prior removals
Reports: 2, Score: 15, Upvote ratio: 70%
Rule match: "No spam or self-promotion" (medium, confidence: 65%)
Risk score: 45/100
```

Expected output:
```json
{
  "summary": "User is sharing a self-made tool relevant to the subreddit's interests. The post solicits feedback rather than purely promoting. Context shows a legitimate community member (2yr, 5k karma, no priors) seeking engagement.",
  "risk_factors": [
    {
      "signal": "External link to personal project",
      "strength": "moderate",
      "explanation": "Links to personal projects may indicate self-promotion, but the tool is directly relevant to the community's moderation focus"
    },
    {
      "signal": "Two user reports for spam",
      "strength": "low",
      "explanation": "Only 2 reports with positive score (15) and reasonable upvote ratio (70%) — community response is mixed but not overwhelmingly negative"
    }
  ],
  "possible_rule_matches": [
    {
      "rule": "No spam or self-promotion",
      "relevance": "partial",
      "explanation": "While the post promotes a personal project, it is on-topic, non-commercial, and invites discussion rather than driving clicks — this is closer to community contribution than spam"
    }
  ],
  "tone_analysis": {
    "primary_tone": "helpful/contributing",
    "secondary_tones": ["self-promotional"],
    "certainty": "moderate",
    "notes": "The phrasing 'would love feedback' signals genuine community engagement intent rather than aggressive promotion. No urgency language or commercial framing detected."
  },
  "precedent_summary": "Similar cases of community-made tools posted by established members are typically approved when they invite feedback and are directly relevant to the subreddit's topic.",
  "recommended_review_action": "moderator_discretion",
  "confidence": 0.55
}
```

**Example 2: Hostile comment with mitigating context**

Input:
```
Content: "you're an idiot if you think that's how it works"
Author: 4yr account, 12000 karma, 1 prior removal
Reports: 3, Score: -5, Upvote ratio: 30%
Rule match: "No harassment or hate speech" (high, confidence: 75%)
Risk score: 62/100
Parent comment: "The earth is flat and NASA is lying to us — here's my 5000-word proof..."
```

Expected output:
```json
{
  "summary": "Comment contains a personal insult ('you're an idiot') which violates civility rules. However, the target appears to be a clearly false/misinformation claim. The insult is directed at an idea ('if you think that') rather than persistent personal harassment.",
  "risk_factors": [
    {
      "signal": "Name-calling / personal insult",
      "strength": "high",
      "explanation": "'you're an idiot' is a direct personal insult and violates civility standards regardless of context"
    },
    {
      "signal": "Target is misinformation content",
      "strength": "moderate",
      "explanation": "The parent comment promotes well-known conspiracy theories — the frustration may be reactive rather than predatory"
    },
    {
      "signal": "Negative community reception",
      "strength": "moderate",
      "explanation": "Score of -5 and low upvote ratio suggest the community disapproves of the tone"
    }
  ],
  "possible_rule_matches": [
    {
      "rule": "No harassment or hate speech",
      "relevance": "partial",
      "explanation": "While a personal insult is present, it appears to be a single frustrated reaction rather than targeted harassment — the distinction between incivility and harassment matters here"
    },
    {
      "rule": "Be civil in discussions",
      "relevance": "likely",
      "explanation": "The comment clearly violates civility standards — name-calling, dismissive tone — even if the frustration is understandable"
    }
  ],
  "tone_analysis": {
    "primary_tone": "frustrated/dismissive",
    "secondary_tones": ["corrective"],
    "certainty": "high",
    "notes": "The tone is confrontational and insulting, but appears to stem from genuine frustration with misinformation rather than targeted harassment. Single insult rather than sustained attack."
  },
  "precedent_summary": "Single-instance insult comments directed at misinformation are often treated as incivility violations (removal + warning) rather than harassment (ban). The response to bad-faith content is a mitigating factor but does not excuse incivility.",
  "recommended_review_action": "moderator_discretion",
  "confidence": 0.72
}
```

**Example 3: Clear spam — will NOT be sent to AI (score > 70)**

This content would score ~85 and skip AI entirely. Just for reference:
```
Content: "BUY NOW!!! LIMITED TIME OFFER!!! Click here for FREE MONEY -> spamlink.xyz"
Author: 1hr account, 1 karma
Reports: 12, Score: -20
Rule match: "No spam" (medium, 98%)
→ AI NOT CALLED → Rule engine handles this directly
```

---

## E. JSON Schema (TypeScript)

```typescript
// ── AI Analysis Output Schema ──

interface AIAnalysisOutput {
  /** 2-4 sentence neutral summary of what the content is and the moderation question it raises */
  summary: string;

  /** Specific risk factors identified, ordered by signal strength */
  risk_factors: RiskFactor[];

  /** How each matched rule relates to this specific content */
  possible_rule_matches: PossibleRuleMatch[];

  /** Tone and intent interpretation */
  tone_analysis: ToneAnalysis;

  /** Summary of similar historical cases (if any) */
  precedent_summary: string;

  /** Suggested review approach — moderator ALWAYS decides the actual action */
  recommended_review_action: 'approve_likely_safe' | 'moderator_discretion' | 'escalate_for_review';

  /** How confident the AI is in its analysis (0-1). Higher = more certain about the interpretation. */
  confidence: number;
}

interface RiskFactor {
  /** The signal name */
  signal: string;
  /** How strongly this signal indicates a problem */
  strength: 'low' | 'moderate' | 'high';
  /** Why this signal matters in context */
  explanation: string;
}

interface PossibleRuleMatch {
  /** Which rule is being evaluated */
  rule: string;
  /** How relevant this rule is to the content */
  relevance: 'unlikely' | 'partial' | 'likely' | 'definite';
  /** Detailed reasoning about the match — MUST include alternative interpretations */
  explanation: string;
}

interface ToneAnalysis {
  /** Primary detected tone */
  primary_tone: string;
  /** Other tones present */
  secondary_tones: string[];
  /** How certain the tone analysis is */
  certainty: 'low' | 'moderate' | 'high';
  /** Nuanced notes about tone interpretation, including cultural/sarcasm flags */
  notes: string;
}
```

### E.1 Extended Shared Types (new/modified)

```typescript
// ── Signal taxonomy types ──

interface ModerationSignals {
  // User signals
  account_age_days: number;
  account_age_lt_7d: boolean;
  link_karma: number;
  comment_karma: number;
  karma_lt_10: boolean;
  prior_removals_in_sub: number;
  prior_bans_in_sub: number;

  // Content signals
  word_count: number;
  link_count: number;
  all_caps_ratio: number;
  profanity_score: number;
  spam_word_score: number;
  sentiment_score: number;
  emoji_count: number;

  // Rule signals
  rule_match_count: number;
  critical_rule_match: boolean;
  high_severity_match: boolean;
  medium_severity_matches: number;
  low_severity_matches: number;

  // Behavioral signals
  report_count: number;
  downvote_ratio: number;
  posts_in_last_hour: number;

  // Queue signals
  time_in_queue_ms: number;
  related_item_in_queue: boolean;
}

interface RiskScore {
  /** 0-100 composite risk score */
  total: number;
  /** Sub-scores for explainability */
  breakdown: {
    user: number;      // 0-25
    content: number;   // 0-30
    rule: number;      // 0-25
    behavior: number;  // 0-15
    queue: number;     // 0-5
  };
  /** Routing decision */
  routing: 'no_ai_approve' | 'ai_deep_analysis' | 'no_ai_remove';
}

// Extended ModContext (additions to existing)
interface ModContextV2 extends ModContext {
  riskScore: RiskScore;
  aiAnalysis: AIAnalysisOutput | null;  // null when AI not called
  signals: ModerationSignals;
}
```

### E.2 Precedent Storage Schema

```typescript
interface ModPrecedent {
  id: string;
  contentExcerpt: string;       // first 300 chars
  riskScore: number;
  signals: ModerationSignals;
  ruleMatches: string[];        // matched rule names
  aiSummary: string;            // AI's summary at decision time
  outcome: 'removed' | 'approved' | 'locked' | 'warned' | 'banned';
  moderator: string;
  reason: string;
  timestamp: string;
  subreddit: string;
}
```

---

## F. Recommendation Engine (Deterministic)

### F.1 Core Logic

```typescript
function generateRecommendation(
  ruleMatches: RuleMatch[],
  riskScore: RiskScore,
  aiAnalysis: AIAnalysisOutput | null
): ModRecommendation {

  // ── CRITICAL: always remove, no AI needed ──
  const criticalMatch = ruleMatches.find(m => m.matched && m.severity === 'critical');
  if (criticalMatch) {
    return {
      action: 'remove',
      confidence: 98,
      reasoning: `Critical rule violation: ${criticalMatch.rule.title}. Content contains potentially dangerous information (PII, threats, doxxing). Immediate removal recommended regardless of context.`
    };
  }

  // ── HIGH RISK: deterministic remove ──
  if (riskScore.routing === 'no_ai_remove') {
    const highMatch = ruleMatches.find(m => m.matched && m.severity === 'high');
    return {
      action: 'remove',
      confidence: 85,
      reasoning: `High risk score (${riskScore.total}/100). ${highMatch ? `Primary: ${highMatch.rule.title}. ` : ''}Multiple signals indicate content likely violates community standards.`
    };
  }

  // ── NEGLIGIBLE RISK: deterministic approve ──
  if (riskScore.routing === 'no_ai_approve') {
    return {
      action: 'approve',
      confidence: 92,
      reasoning: `Low risk score (${riskScore.total}/100). No significant rule violations or behavioral signals detected. Standard approval recommended.`
    };
  }

  // ── GREY ZONE: use AI analysis signals ──
  if (aiAnalysis) {
    // AI says "likely safe" + high confidence → approve
    if (aiAnalysis.recommended_review_action === 'approve_likely_safe' && aiAnalysis.confidence > 0.7) {
      return {
        action: 'approve',
        confidence: Math.round(aiAnalysis.confidence * 100),
        reasoning: `AI analysis suggests content is likely safe. ${aiAnalysis.summary.slice(0, 150)}`
      };
    }

    // AI says "escalate" + high confidence → remove
    if (aiAnalysis.recommended_review_action === 'escalate_for_review' && aiAnalysis.confidence > 0.75) {
      return {
        action: 'remove',
        confidence: Math.round(aiAnalysis.confidence * 100),
        reasoning: `AI analysis recommends escalated review. ${aiAnalysis.summary.slice(0, 150)}`
      };
    }

    // Default grey zone: AI says "moderator_discretion" → remove at lower confidence
    const highRiskFactors = aiAnalysis.risk_factors.filter(f => f.strength === 'high');
    if (highRiskFactors.length > 0) {
      return {
        action: 'remove',
        confidence: Math.min(Math.round(aiAnalysis.confidence * 100), 70),
        reasoning: `Grey zone content with high-risk signals: ${highRiskFactors.map(f => f.signal).join(', ')}. AI suggests moderator review. ${aiAnalysis.summary.slice(0, 120)}`
      };
    }
  }

  // ── Fallback: grey zone, no/broken AI → use rule matches ──
  const highMatch = ruleMatches.find(m => m.matched && m.severity === 'high');
  if (highMatch) {
    return {
      action: 'remove',
      confidence: highMatch.confidence,
      reasoning: `High-severity rule match without AI context: ${highMatch.rule.title}. Review manually.`
    };
  }

  const mediumMatches = ruleMatches.filter(m => m.matched && m.severity === 'medium');
  if (mediumMatches.length >= 2) {
    return {
      action: 'remove',
      confidence: 65,
      reasoning: `Multiple medium-severity rule matches (${mediumMatches.length}). Recommend manual review.`
    };
  }

  return {
    action: 'approve',
    confidence: 55,
    reasoning: `Grey zone content with insufficient negative signals. Recommend approve with monitoring.`
  };
}
```

### F.2 Invariants (Hard Constraints)

1. **AI never sets `action`** — the `action` field is always computed by deterministic logic
2. **AI `recommended_review_action` is advisory only** — it informs the recommendation but doesn't control it
3. **Critical rules always → remove** — regardless of AI output
4. **`confidence` from AI is capped at 75%** — AI confidence is about interpretation, not violation certainty
5. **`confidence` from rules is capped at 98%** — nothing is 100% certain

---

## G. Failure Fallback Strategy

### G.1 Degradation Levels

```
LEVEL 0: FULLY OPERATIONAL
  • Fast scoring + AI analysis + recommendation
  • All signals extracted, AI enriches grey zone
  • Latency: 500-5000ms for grey zone, < 1ms otherwise

LEVEL 1: AI TIMEOUT (5s exceeded)
  • Fast scoring + rule-based recommendation only
  • Grey zone items still shown but without AI insights
  • UI shows: "AI analysis timed out — rule-based assessment only"
  • Latency: < 1ms for all items
  • Trigger: single request timeout → retry next request

LEVEL 2: AI API UNAVAILABLE (3 consecutive failures)
  • AI disabled for 5 minutes (circuit breaker)
  • All items use rule-based path
  • UI shows: "AI temporarily unavailable — rule engine active"
  • Redis key: `mg:ai-circuit-breaker` with TTL
  • Latency: < 1ms for all items

LEVEL 3: REDIS UNAVAILABLE
  • Queue stored in memory (last 50 items)
  • Rules fall back to hardcoded defaults
  • AI config unavailable → AI disabled
  • UI shows: "Storage degraded — limited functionality"
  • Latency: depends on Reddit API response time

LEVEL 4: TOTAL AI DISABLED (moderator opted out)
  • No AI key configured
  • All analysis is rule-based only
  • UI: "AI not configured — rule engine only"
  • This is a valid, supported operating mode
```

### G.2 Circuit Breaker Implementation

```typescript
const CIRCUIT_BREAKER_KEY = 'mg:ai-circuit-breaker';
const CIRCUIT_BREAKER_TTL_SEC = 300; // 5 minutes
const FAILURE_THRESHOLD = 3;

async function shouldCallAI(): Promise<boolean> {
  // Check if circuit is open
  const breaker = await redis.get(CIRCUIT_BREAKER_KEY);
  if (breaker) return false;

  return true;
}

async function recordAIFailure(): Promise<void> {
  const key = 'mg:ai-failure-count';
  const count = await redis.incrBy(key, 1);

  if (count >= FAILURE_THRESHOLD) {
    // Open circuit breaker
    await redis.set(CIRCUIT_BREAKER_KEY, 'open');
    await redis.expire(CIRCUIT_BREAKER_KEY, CIRCUIT_BREAKER_TTL_SEC);
    await redis.del(key); // Reset counter
  } else {
    // Set TTL on counter so stale failures expire
    await redis.expire(key, 120);
  }
}

async function recordAISuccess(): Promise<void> {
  // Reset failure count on success
  await redis.del('mg:ai-failure-count');
}
```

### G.3 Timeout Strategy

```typescript
const AI_TIMEOUT_MS = 5000; // 5 seconds max for AI call

async function callAIWithTimeout(prompt: string): Promise<AIAnalysisOutput | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const result = await fetchAI(prompt, controller.signal);
    clearTimeout(timeout);
    await recordAISuccess();
    return result;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn('AI call timed out after', AI_TIMEOUT_MS, 'ms');
    }
    await recordAIFailure();
    return null; // Silent fallback
  }
}
```

---

## H. Explainability Design (UI)

### H.1 Risk Score Panel (moderator-facing)

The expanded context panel in splash.tsx should show:

```
┌─────────────────────────────────────────────┐
│  RISK ASSESSMENT                  Score: 52 │
│  ████████████░░░░░░░░░░░░  MEDIUM           │
│                                              │
│  SIGNALS:                                     │
│  ├─ User           ████░░░░  8/25             │
│  │  · Account age 7 days (new account)        │
│  │  · 0 prior removals                        │
│  │                                             │
│  ├─ Content        ████████░  16/30           │
│  │  · 2 links detected                        │
│  │  · 3 spam-related keywords                 │
│  │  · Neutral sentiment                       │
│  │                                             │
│  ├─ Rules          ██████░░░  12/25           │
│  │  · Matched: "No spam" (medium, 65%)        │
│  │                                             │
│  ├─ Behavior       ████████░  12/15           │
│  │  · 4 user reports                          │
│  │  · Score: -2 (slightly negative)            │
│  │                                             │
│  └─ Queue          ██░░░░░░░  4/5             │
│     · In queue for 2 hours                    │
│     · Same user has other flagged item         │
│                                              │
│  ROUTING: AI Deep Analysis (grey zone)        │
└─────────────────────────────────────────────┘
```

### H.2 AI Analysis Panel

```
┌─────────────────────────────────────────────┐
│  AI CONTEXT ANALYSIS              🤖 AI      │
│                                              │
│  This content sits in the grey zone. The AI  │
│  analyzed context to help you decide.         │
│                                              │
│  Summary:                                     │
│  User is sharing a self-made tool relevant    │
│  to the subreddit. The post solicits feedback │
│  rather than purely promoting. Established    │
│  community member (2yr, 5k karma, no priors). │
│                                              │
│  Risk Factors:                                │
│  ⚠ Moderate · External link to personal      │
│    project — may indicate self-promotion      │
│  ⚡ Low · 2 user reports for spam —           │
│    community response is mixed                │
│                                              │
│  Rule Assessment:                             │
│  📋 "No spam" — partial match                 │
│    On-topic, non-commercial, invites          │
│    discussion → closer to contribution        │
│                                              │
│  Tone: helpful/contributing (moderate cert.)  │
│    · "would love feedback" = engagement       │
│    · No urgency or commercial language        │
│                                              │
│  Precedent:                                   │
│  Community tools by established members are   │
│  typically approved when they invite feedback │
│                                              │
│  AI Confidence: 55% (low — moderator          │
│  discretion strongly advised)                 │
└─────────────────────────────────────────────┘
```

### H.3 Trust Principles

1. **Every AI output element has a source label**: `🤖 AI` vs `📋 Rule Engine`
2. **Confidence is always visible**: never hide low confidence
3. **Risk breakdown is expandable**: moderator can see exactly what drove the score
4. **Uncertainty language in AI outputs is preserved**: "may indicate", "possible", "signals suggest"
5. **AI output is clearly separated from recommendation**: the recommendation box shows deterministic logic; the AI box shows interpretive analysis
6. **"AI skipped" is shown when applicable**: "AI not called — risk too low/high for meaningful analysis"
7. **Fallback state is visible**: "AI unavailable — rule engine only" shown when degraded

---

## I. Devvit Implementation Plan

### I.1 File Structure Changes

```
src/
├── shared/
│   ├── types.ts              # EXTEND: add AIAnalysisOutput, ModerationSignals, RiskScore, etc.
│   └── api.ts                # EXTEND: re-export new types
├── server/
│   ├── core/
│   │   ├── scoring-engine.ts # NEW: fast heuristic scoring engine
│   │   ├── rule-engine.ts    # KEEP: existing regex rule engine
│   │   ├── ai-enhance.ts     # REWRITE: new prompt engineering, JSON schema, circuit breaker
│   │   ├── context-engine.ts # REWRITE: three-layer orchestration
│   │   └── post.ts           # KEEP: custom post creation
│   ├── routes/
│   │   ├── api.ts            # EXTEND: new /api/precedents, enrich /api/context
│   │   ├── triggers.ts       # EXTEND: integrate scoring engine into onContentCreate
│   │   ├── menu.ts           # KEEP
│   │   └── forms.ts          # KEEP
│   └── index.ts              # KEEP: Hono app wiring
└── client/
    └── splash.tsx            # EXTEND: explainability UI panels
```

### I.2 Implementation Phases

**Phase 1: Scoring Engine + Types (no AI changes)**
1. Add `ModerationSignals`, `RiskScore`, `AIAnalysisOutput` to types.ts
2. Create `scoring-engine.ts` with `extractSignals()` and `computeRiskScore()`
3. Integrate into `context-engine.ts` → `generateModContext()` calls scoring before AI
4. Update `triggers.ts` → `onContentCreate` uses scoring engine for priority
5. UI: add risk score bar to splash.tsx

**Phase 2: AI Context Reasoning Rewrite**
1. Rewrite `ai-enhance.ts` with new system prompt, few-shot examples, JSON schema
2. Add circuit breaker and timeout logic
3. Add `callAIForDeepAnalysis()` function
4. Update `context-engine.ts` to route grey-zone items to new AI function

**Phase 3: Recommendation Engine Enhancement**
1. Rewrite `generateRecommendation()` to use risk score routing + AI signals
2. Cap AI confidence at 75%
3. Ensure critical rules always → remove

**Phase 4: Precedent Storage**
1. Add `mg:precedents` Redis key (max 500 entries)
2. Record decisions after moderator action
3. Use in AI prompt as few-shot context

**Phase 5: UI Explainability**
1. Risk score breakdown panel in splash.tsx
2. AI analysis panel with signal-by-signal breakdown
3. Fallback/degradation state indicators

### I.3 Latency Optimization

```
1. Scoring engine: ALWAYS synchronous, < 1ms
   - All signals computed in-memory from available data
   - No external calls during scoring

2. AI analysis: ASYNCHRONOUS (on-demand), 500-5000ms
   - Only called when moderator expands a grey-zone item
   - Not called during trigger (onContentCreate)
   - Trigger only scores + queues; AI happens on expand

3. User profile: CACHED in Redis (5 min TTL)
   - Key: mg:user-profile:<username>
   - Reddit API calls are expensive; cache aggressively

4. Precedents: PRELOADED on expand
   - Loaded from Redis (key: mg:precedents)
   - Included in AI prompt as few-shot context

5. Queue priority: COMPUTED ON WRITE (trigger)
   - Not re-computed on every read
   - Stored in queue item JSON
```

### I.4 KV Storage Schema

```
mg:queue               → QueueItem[] (max 100, sorted by priority)
mg:rules               → CustomRule[] (moderator-configured)
mg:ai-config           → { provider, apiKey, model, endpoint }
mg:ai-circuit-breaker  → 'open' (TTL 300s when tripped)
mg:ai-failure-count    → number (consecutive failures)
mg:precedents          → ModPrecedent[] (max 500, ring buffer)
mg:user:<name>:removals → number (lifetime removals in sub)
mg:user:<name>:bans     → number (lifetime bans in sub)
mg:user:<name>:last_post_ts → timestamp
mg:user:<name>:post_count_1h → number (rate limiting signal)
mg:user-profile:<name>  → cached Reddit user profile (TTL 300s)
mg:reviewing:<itemId>   → { username, since } (collaboration)
mg:decision:<itemId>    → decision record
modguard:analyzed       → counter
modguard:decisions:<action> → per-action counter
```

### I.5 On-Demand AI (Not Real-Time)

**Critical design decision**: AI is never called during content creation triggers.

Why:
- Triggers need to be fast (< 2s) — Devvit has execution time limits
- AI calls are 500-5000ms and cost money
- 60-70% of queue items won't need AI at all
- The moderator decides when to open an item and trigger AI

Flow:
1. `onContentCreate` → scoring engine → if match → add to queue (no AI)
2. Moderator opens app → sees queue with risk scores
3. Moderator expands item → POST `/api/context`
4. Context engine checks risk score → if grey zone (30-70) → call AI
5. AI result included in ModContext response
6. Moderator reads AI analysis + recommendation → decides

### I.6 Cost Estimation

Per subreddit, per month (estimated):
- Assume 500 flagged items/month
- Assume 60% score 0-30 or 70-100 → no AI → 300 items
- Assume 40% score 30-70 → AI called → 200 items
- Claude Haiku: ~$0.001/call with ~500 input tokens + ~200 output tokens
- Monthly cost: 200 × $0.001 = **~$0.20/subreddit/month**

This is negligible. Even at 10,000 flagged items/month: **~$4/month**.

---

## J. Implementation Checklist

- [ ] Add `ModerationSignals`, `RiskScore`, `AIAnalysisOutput`, `ModPrecedent` to types.ts
- [ ] Create `scoring-engine.ts` with `extractSignals()` and `computeRiskScore()`
- [ ] Rewrite `ai-enhance.ts` with new prompts, JSON schema, circuit breaker
- [ ] Rewrite `context-engine.ts` → `generateModContext()` orchestrates three layers
- [ ] Rewrite `generateRecommendation()` in context-engine.ts
- [ ] Update `triggers.ts` → `onContentCreate` uses scoring engine
- [ ] Add `/api/precedents` endpoint
- [ ] Update `/api/context` to return enriched ModContextV2
- [ ] Record decisions as precedents in `/api/decision`
- [ ] Add risk score bar to splash.tsx
- [ ] Add AI analysis panel to splash.tsx
- [ ] Add fallback state indicators to splash.tsx
- [ ] Cache user profiles in Redis (5min TTL)
