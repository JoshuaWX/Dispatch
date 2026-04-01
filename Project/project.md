# 🗞️ DISPATCH — AI-Native News Platform

---

## 1. Project Vision

An autonomous newsroom that ingests trending signals, researches stories across multiple sources, and publishes full reported articles — with zero human editorial involvement. The bar is The Atlantic quality, the pipeline is fully automated.

---

## 2. System Architecture

```
[VIRLO API]  ──trend signals──▶  [TOPIC SELECTOR]
                                        │
                              [WEB RESEARCH AGENT]
                              (multi-source, 3-5 sources)
                                        │
                              [ARTICLE WRITER - Claude]
                              (inverted pyramid, sourced)
                                        │
                              [EDITORIAL QUALITY GATE]
                              (second Claude pass, scoring)
                                        │
                              [ARTICLE STORE - in-memory/localStorage]
                                        │
                              [NEXT.JS FRONTEND - Vercel]
```

---

## 3. Full Feature List

### Core (Score-critical)
- **Automated Article Pipeline** — full end-to-end, no human touch
- **Virlo Trend Radar** — pulls today's viral topic signals as editorial input
- **Multi-source Research Pass** — Claude web-searches 3-5 sources per story to corroborate
- **Journalistic Article Writer** — inverted pyramid structure, proper lede, attribution, context
- **Editorial Quality Gate** — second AI pass scores each article for sensationalism, source diversity, factual confidence
- **Source Transparency Panel** — every article shows its sources inline (huge trust signal for judges)

### UX Layer (UX score)
- **Live Pipeline Feed** — visible ticker showing "Currently researching: Gaza ceasefire talks…" (makes the AI pipeline tangible)
- **Article Q&A — "Ask the Reporter"** — readers can ask questions about any article, answered from the article's research context
- **Category filtering** — World, Tech, Business, Science
- **Reading time estimate** on each card

### Design (UI score)
- NYT-meets-Axios aesthetic
- Serif headlines (Playfair Display or Lora)
- Strong typographic hierarchy
- Dark/light mode
- Mobile responsive

---

## 4. Recommended Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 App Router | SSR + API routes in one, deploys free on Vercel |
| Styling | Tailwind CSS + shadcn/ui | Fast, polished, consistent |
| AI | Anthropic Claude API | Free, no key needed in demo |
| Trend Data | Virlo `/v1/trends/digest` | Score multiplier, free 500 credits |
| Storage | In-memory + localStorage | Zero infra, works for demo |
| Deployment | Vercel | Free HTTPS, one command deploy |
| Fonts | Playfair Display + Inter | Newsroom credibility |

> **Frontend UI:** Build with [v0 by Vercel](https://v0.dev) for polished, publication-quality design at speed. Wire in API calls and pipeline logic manually after export.

---

## 5. File Structure

```
dispatch/
├── app/
│   ├── page.tsx                  # Homepage / feed
│   ├── article/[id]/page.tsx     # Article reader
│   ├── pipeline/page.tsx         # Live pipeline feed
│   └── api/
│       ├── generate/route.ts     # Article generation endpoint
│       ├── research/route.ts     # Web research pass
│       ├── trends/route.ts       # Virlo trend fetch
│       └── qa/route.ts           # Ask the reporter
├── components/
│   ├── ArticleCard.tsx
│   ├── ArticleReader.tsx
│   ├── PipelineFeed.tsx
│   ├── QAPanel.tsx
│   ├── SourcePanel.tsx
│   └── CategoryFilter.tsx
├── lib/
│   ├── pipeline.ts               # Core orchestration logic
│   ├── virlo.ts                  # Virlo API client
│   ├── prompts.ts                # All system prompts
│   └── store.ts                  # In-memory article store
└── types/index.ts
```

---

## 6. The Three Critical Prompts

> These are what separate a winner from a summarizer. Everything rides on prompt architecture.

### Prompt 1 — Research Brief
```
You are a senior investigative researcher at a world-class newsroom.
Given a trending topic, use web search to find 3-5 credible, diverse
sources. Extract: key verified facts with source attribution, named
individuals quoted or referenced, important dates and timeline, any
conflicting claims or disputed facts, and essential background context
a reader needs. Return ONLY valid JSON matching this schema:
{
  topic: string,
  sources: [{ name, url, credibilityNotes }],
  keyFacts: [{ fact, source, confidence: 'confirmed'|'reported'|'alleged' }],
  namedSources: string[],
  timeline: [{ date, event }],
  conflictingClaims: [{ claim, source, counterclaim, counterSource }],
  backgroundContext: string
}
```

### Prompt 2 — Article Writer
```
You are a staff writer at a world-class newsroom. You write with the
depth and integrity of Reuters, The Atlantic, or the New York Times.
Using the research brief provided, write a fully reported news article.
Mandatory structure:
  (1) News lede — most important fact, who/what/when/where in first sentence.
  (2) Context graf — why this matters now.
  (3) Body — develop the story with attributed facts, quotes where available,
      conflicting views if present.
  (4) Background — essential context for readers unfamiliar with the topic.
Length: 600-900 words.
Rules: attribute every factual claim to its source, never write 'according
to AI' — attribute to the actual source, separate confirmed facts from
reported claims using language like 'reportedly' or 'according to [source]',
no sensational language, no clickbait framing.
Return JSON: { headline: string, subheadline: string, lede: string,
body: string, category: string, tags: string[] }
```

### Prompt 3 — Quality Gate
```
You are a senior editor at a world-class newsroom reviewing an article
before publication. Score the following article on these dimensions (0-10 each):
  - sourceDiversity: are multiple independent sources used?
  - sensationalism: 10 = no sensationalism, 0 = highly sensational
  - factualConfidence: are claims properly attributed and supported?
  - ledeStrength: does the first sentence contain the core news?
Also list any flaggedClaims (unsupported assertions that should be removed
or attributed). Minimum publishable overall score: 7.0.
Return ONLY JSON:
{
  sourceDiversity: number,
  sensationalism: number,
  factualConfidence: number,
  ledeStrength: number,
  overallScore: number,
  flaggedClaims: string[],
  publishRecommendation: boolean
}
```

---

## 7. Tooling Split

| Responsibility | Tool |
|---|---|
| Frontend UI & design | v0 by Vercel |
| Backend pipeline + API routes | GitHub Copilot |
| Prompts + Virlo integration | GitHub Copilot |
| Deployment | Vercel (direct from v0 export) |

---

## 8. Ultimate GitHub Copilot Prompt

> Paste this verbatim into Copilot Chat or your `AGENTS.md` at the start of every session.

```
You are building DISPATCH — a fully automated, AI-native news platform.
No human editorial layer. Every article is researched and written by AI
to newsroom standards.

STACK: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui,
Anthropic Claude API (endpoint: https://api.anthropic.com/v1/messages,
model: claude-sonnet-4-20250514, no API key needed in headers for
artifact context), Virlo API for trends (https://api.virlo.ai/v1),
deployed on Vercel. Frontend was generated via v0 by Vercel — your job
is the backend pipeline and API wiring only.

CORE PIPELINE (build this first):
1. Call Virlo GET /v1/trends/digest to get today's trending topics
2. For each selected topic, trigger a research pass: call Claude with
   web_search tool enabled to gather facts from 3-5 sources, return
   structured JSON: { topic, sources[], keyFacts[], namedSources[],
   backgroundContext, conflictingClaims[] }
3. Pass research JSON to Claude article writer prompt — output a
   600-900 word reported article in inverted pyramid structure with
   proper attribution. NOT a summary. A reported article.
4. Pass article to Claude editorial quality gate — returns scorecard:
   { sourceDiversity, sensationalismScore, factualConfidence,
   ledeStrength, flaggedClaims[] }. Only publish if overall score > 7.
5. Store article in memory with metadata: id, headline, lede, body,
   sources[], category, readingTime, publishedAt, qualityScore

API ROUTES TO BUILD:
- POST /api/generate     — triggers full pipeline for one topic
- GET  /api/trends       — fetches Virlo trends digest
- GET  /api/articles     — returns all published articles
- GET  /api/articles/[id]— single article
- POST /api/qa           — ask the reporter { articleId, question }
- GET  /api/pipeline/status — current pipeline state for live feed

VIRLO INTEGRATION:
Base URL: https://api.virlo.ai/v1
Auth: Bearer token in Authorization header
Key endpoint: GET /v1/trends/digest — returns today's trending topics
Use trend names as article topics for the research pass.
Cache trend responses for 1 hour to preserve free credits.

ERROR HANDLING:
- If Virlo is unavailable, fall back to a curated seed topic list
- If quality gate score < 7, retry the writer pass once with
  flagged claims removed from the research brief
- Never publish an article that fails quality gate twice
- Show graceful loading states throughout the pipeline UI

BUILD ORDER:
1. lib/prompts.ts       — all prompts as exported constants
2. lib/pipeline.ts      — core orchestration (research → write → gate → store)
3. lib/virlo.ts         — Virlo API client with 1hr cache
4. lib/store.ts         — in-memory article store
5. API routes           — generate, articles, trends, qa, pipeline/status
6. Wire API calls into v0-generated frontend components
7. Polish: error states, loading states, edge cases

The demo must feel like a real publication a reader would take seriously.
Every engineering decision should serve that goal.
```

---

## 9. Build Timeline (Apr 1–5)

| Day | Focus |
|---|---|
| Day 1 (Apr 1) | Pipeline core + prompts working end-to-end locally |
| Day 2 (Apr 2) | v0 frontend generation + API routes |
| Day 3 (Apr 3) | Wire frontend to backend, Q&A feature, pipeline feed |
| Day 4 (Apr 4) | Deploy to Vercel, Virlo integration, edge case handling |
| Day 5 (Apr 5) | Polish, SaaS Market listing, submission |

---

## 10. Scoring Strategy

| Category | Max | Our Play |
|---|---|---|
| Editorial / article quality | 10 | Prompt architecture — inverted pyramid, attribution, quality gate |
| UI design | 10 | v0-generated, NYT-meets-Axios, Playfair Display headlines |
| UX design | 10 | Live pipeline feed, Ask the Reporter, zero-friction navigation |
| Extras & integrations | 10 | Virlo trend radar + meaningful AI pipeline visibility |
| **Virlo multiplier** | — | Boosts final score if Virlo integration is strong |