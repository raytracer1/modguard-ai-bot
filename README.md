# 🛡 ModGuard AI — Context Copilot for Moderators

> **Not an auto-moderation tool. A decision accelerator for human moderators.**

ModGuard AI reduces moderator decision time in the mod queue by providing a unified context panel that eliminates the need to switch between multiple pages. Built on the [Reddit Devvit](https://developers.reddit.com/) platform.

---

## The Problem

Moderators spend **too much time context-switching** when reviewing content in the mod queue:

| Current Workflow | Time Cost |
|---|---|
| Check mod queue item | — |
| Open user profile page | +5-10s |
| Check user history / karma | +5-10s |
| Cross-reference subreddit rules | +5-10s |
| Search for similar past cases | +10-20s |
| Check mod log for prior actions | +5-10s |
| Read comment thread context | +10-15s |
| Make decision | — |

**Result:** 45-75 seconds per item, fragmented attention, inconsistent decisions.

### Why This Matters

- **Decision fatigue** leads to inconsistent moderation
- **Page switching** increases cognitive load
- **New moderators** lack institutional knowledge of past cases
- **Duplicate work** when two mods review the same item

---

## The Solution

ModGuard AI provides a **single unified context panel** alongside every mod queue item, surfacing everything a moderator needs to make a fast, informed decision — in under 10 seconds.

### Core Design Principle

```
Context → Decision → Action
```

We don't automate actions. We accelerate the context-gathering phase so human moderators can decide faster and more consistently.

---

## MVP Features

### 1. Context Panel (Core)

Each mod queue item gets a rich context card with four sections:

#### A. User Context
- Account creation date & age
- Karma (post + comment)
- New account flag
- Previous violation count
- Last 5 posts/comments with removal status

#### B. Content Summary
- 2-4 line AI-generated or rule-based summary
- Sentiment analysis (positive / neutral / negative / hostile)
- Controversy & escalation flags
- Low-quality content detection
- Key topic extraction

#### C. Rule Matching
- Automated pattern matching against subreddit rules
- 7 built-in rule categories (harassment, low quality, spam, doxxing, incivility, off-topic, title format)
- Severity ranking (low / medium / high / critical)
- Confidence score with visual progress bars
- Plain-language explanation for each match

#### D. Similar Cases
- Historical cases with comparable characteristics
- Past outcomes (removed / approved / locked / warned)
- Similarity scoring
- Resolution reasons for precedent

### 2. Recommendation Panel

Every item receives a **suggested action** with:

- **Recommended action**: Approve / Remove / Lock / Approve + Flair
- **1-3 sentence reasoning** explaining the recommendation
- **Confidence score** (0-100%) with visual badge
- **Alternative actions** always available
- **Human-in-the-loop**: no automatic execution

### 3. Collaboration Status

- Real-time indicator if another moderator is reviewing the item
- Shows reviewer username and time started
- Prevents duplicate moderation effort

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Reddit Mod Queue            │
├─────────────────────────────────────────────┤
│  ┌─────────────┐    ┌────────────────────┐   │
│  │ Queue Item   │    │ ModGuard Panel     │   │
│  │              │    │                    │   │
│  │ Post/Comment│    │ 👤 User Context    │   │
│  │              │    │ 📋 Rule Analysis   │   │
│  │              │    │ 📊 Similar Cases   │   │
│  │              │    │ 💡 Recommendation  │   │
│  └─────────────┘    └────────────────────┘   │
├─────────────────────────────────────────────┤
│              Devvit Platform                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Server  │  │   KV     │  │  Reddit  │   │
│  │  (Hono)  │  │  Store   │  │   API    │   │
│  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────┘
```

### Tech Stack
- **Framework**: Reddit Devvit
- **Frontend**: React 19 + TypeScript + Tailwind CSS 4
- **Backend**: Hono (Devvit server runtime)
- **Storage**: Devvit Redis (KV store)
- **AI/Rules**: Pattern-matching rule engine with optional LLM fallback

### Data Flow
1. Moderator opens ModGuard from mod queue menu
2. Client sends content to `/api/context` endpoint
3. Server runs rule engine + mock data layer
4. Unified `ModContext` object returned to client
5. React components render context cards
6. Moderator makes decision → recorded via `/api/decision`
7. Stats updated in Redis KV store

---

## Project Structure

```
src/
├── shared/
│   ├── api.ts              # API type contracts
│   └── types.ts            # Shared TypeScript types
├── server/
│   ├── index.ts            # Hono server entry
│   ├── core/
│   │   ├── context-engine.ts  # Main context generation
│   │   ├── rule-engine.ts     # Pattern-matching rule analysis
│   │   ├── mock-data.ts       # Mock user/case data
│   │   └── post.ts            # Post creation utility
│   └── routes/
│       ├── api.ts             # Context + decision + stats endpoints
│       ├── menu.ts            # Mod queue menu handlers
│       ├── forms.ts           # Form submission handlers
│       └── triggers.ts        # App install triggers
└── client/
    ├── splash.tsx           # Landing page (splash screen)
    ├── game.tsx             # Main app (context panel)
    ├── index.css            # Dark-mode design system
    ├── types.ts             # Client-side types
    ├── hooks/
    │   └── useModContext.ts # Context fetching + decision recording
    └── components/
        ├── ContextPanel.tsx          # Main panel wrapper
        ├── UserInfoCard.tsx          # User profile context
        ├── ContentSummaryCard.tsx    # AI/content summary
        ├── RuleMatchCard.tsx         # Rule violation analysis
        ├── SimilarCasesPanel.tsx     # Historical cases
        ├── RecommendationPanel.tsx   # Action suggestions
        ├── CollaborationBadge.tsx    # Review status
        ├── ConfidenceBadge.tsx       # Confidence score
        ├── StatsBar.tsx              # Success metrics
        └── DemoPanel.tsx             # Hackathon demo scenarios
```

---

## Demo Flow

1. **Open ModGuard** from the subreddit menu ("ModGuard Context Panel")
2. **Landing screen** shows feature highlights and demo scenarios
3. **Select a scenario** (5 pre-loaded moderation cases):
   - Harassment / hate speech
   - Low-quality content
   - Incivility in discussion
   - Spam / self-promotion
   - Doxxing / personal information
4. **Context panel loads** with all four sections populated
5. **Review the recommendation** and confidence score
6. **Choose an action** — the recommended one or an alternative
7. **See the decision confirmation** and updated stats

---

## Success Metrics

Built into the app via the StatsBar component:

| Metric | Target | How We Measure |
|---|---|---|
| Decision time per item | < 15 seconds | Saved context-switch time |
| Content analyzed | Tracked in KV | `modguard:analyzed` counter |
| AI-assisted decisions | 78%+ | Decisions following recommendation |
| Context switches reduced | 3-4 per item | Eliminated profile/rule/case lookups |

---

## What ModGuard AI Is NOT

This is critical to the product positioning:

- ❌ NOT an auto-moderation bot
- ❌ NOT a replacement for human judgment
- ❌ NOT a chat system or social platform
- ❌ NOT a full analytics dashboard
- ❌ NOT a ban evasion detection system
- ❌ NOT a complex risk-scoring engine

**ModGuard AI is one thing**: a context copilot that helps moderators decide faster and more consistently.

---

## Hackathon Positioning

### Primary Value Proposition

> **"Reduce mod queue decision time by 60% without replacing human judgment."**

### Key Differentiators

1. **Human-in-the-loop** — We suggest, you decide
2. **Context aggregation** — Everything in one panel
3. **Precedent-driven** — Similar cases build institutional knowledge
4. **Lightweight** — No external dependencies, runs on Devvit natively
5. **Collaboration-aware** — Prevents duplicate work across mod teams

### Target Users
- Subreddit moderators managing 50+ items/day in mod queue
- New moderators who need context to make consistent decisions
- Mod teams that want to align on enforcement standards

---

## Getting Started

### Prerequisites
- Node.js >= 22.2.0
- Reddit developer account
- Devvit CLI

### Setup

```bash
# Install dependencies
npm install

# Login to Reddit
npm run login

# Start development server
npm run dev

# Build for production
npm run build

# Deploy to Reddit
npm run deploy
```

### Configuration

Edit `devvit.json` to change:
- `dev.subreddit` — your test subreddit name
- `menu.items` — menu item labels and locations

---

## Design Decisions

### Why Rule Engine Instead of LLM-First?

The pattern-matching rule engine provides:
- **Zero latency** — No API calls, instant analysis
- **No external dependencies** — Works fully within Devvit
- **Explainable** — Every match has a clear pattern and reason
- **Fallback-ready** — LLM integration point is designed but optional

### Why Mock Data?

The mock data layer:
- **Demonstrates the concept** without requiring real Reddit API data
- **Provides consistent demos** for the hackathon
- **Is swappable** — Real Reddit API calls drop into the same interfaces

---

## License

BSD-3-Clause
