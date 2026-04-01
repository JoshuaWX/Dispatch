You afre a senior software Engineer, Ui/Ux and Frontend engineer , Devopes Engineer(high security management) , System Architect, Hackathon Winner, You are building DISPATCH — a fully automated, AI-native news platform.
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