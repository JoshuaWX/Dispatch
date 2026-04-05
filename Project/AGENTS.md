# DISPATCH — AI-Native News Platform
## Agent Operating Instructions

You are a Senior Software Engineer, UI/UX Engineer, DevOps Engineer, 
System Architect, and Hackathon Winner. You are building DISPATCH — 
a fully automated, AI-native news platform. No human editorial layer. 
Every article is researched and written by AI to newsroom standards.

---

## STACK
- Framework: Next.js 14 (App Router), TypeScript
- Styling: Tailwind CSS + shadcn/ui
- Primary AI: Groq API (llama-3.3-70b-versatile)
- Fallback AI: OpenRouter (google/gemma-2-27b-it)
- Trend Signals: Virlo API (daily snapshot, 1 call/day MAX)
- News + Research: NewsData.io API (primary topic feed + research)
- Deployment: Vercel
- Frontend: Already built via v0 — do NOT modify frontend components

---

## CRITICAL RULES — READ BEFORE TOUCHING ANYTHING
1. Never call Virlo more than once per UTC day. It costs money.
2. Never use Claude web_search for research. Use NewsData results only.
3. Never modify frontend components, API route signatures, or env vars.
4. Never publish an article that contains banned phrases (listed below).
5. Never publish a Grade D or HOLD article under any circumstances.
6. Always work only inside: lib/pipeline.ts, lib/prompts.ts, 
   lib/virlo.ts, lib/newsdata.ts, lib/store.ts, and the 
   /api/generate route implementation.

---

## DATA SOURCES

### Virlo API — Daily Snapshot Only
- Base URL: https://api.virlo.ai/v1
- Auth: Bearer token (use existing env var, do not rename)
- Endpoint: GET /v1/trends/digest
- Rule: Call ONCE per UTC day. Cache 24 hours at UTC day boundary.
- Purpose: Daily trend signal snapshot only. Not for research.
- IMPORTANT: Use /v1/trends/digest NOT /trends/digest

### NewsData.io — Primary Topic Feed + Research
- Base URL: https://newsdata.io/api/1
- Topics: GET /news?apikey=KEY&language=en&category=world,technology,business,science
- Research: GET /news?apikey=KEY&q=[topic]&size=10
- Cache: 1 hour
- This is the ONLY research source. Claude works from these results only.

### Fallback Topic Hierarchy
1. NewsData headlines (primary)
2. Virlo daily snapshot topics (if NewsData fails)
3. Hardcoded seed topics (if both fail):
   ["AI regulation", "climate summit", "global markets", 
    "tech layoffs", "space exploration", "cybersecurity breach",
    "election updates", "energy transition", 
    "healthcare innovation", "geopolitical tensions"]

### AI Model Hierarchy
- Primary: Groq (llama-3.3-70b-versatile) — fast, free tier
- Fallback: OpenRouter (google/gemma-2-27b-it) — if Groq fails
- Switch to fallback automatically on any Groq error or timeout

---

## 7-STEP PIPELINE

### STEP 1 — INGEST
- Check if Virlo snapshot exists for today (UTC)
  - If NO → call Virlo once, store snapshot with UTC date key
  - If YES → skip Virlo entirely, use cached snapshot
- Fetch 15 topics from NewsData
- If NewsData fails → use Virlo snapshot topics
- If both fail → use seed topics
- Deduplicate similar topics (same story, different headlines = keep one)
- Output: rawTopics[] — exactly 15 topics max

### STEP 2 — TOPIC SCORING
Call AI to score each topic. Use this prompt exactly: