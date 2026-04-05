MAJOR PIPELINE UPGRADE (COST-CONTROLLED): Rebuild the article generation pipeline from scratch incorporating the changes below. This is the most important update before submission.

KEY COST DECISIONS (LOCKED)
- Virlo is expensive: call it AT MOST once per day (24h cache, UTC day boundary).
- After the daily Virlo snapshot is taken, use NewsData for topic ingestion for the rest of the day.
- Research is done using NewsData search results (NOT Claude web_search).

════════════════════════════════════════
DATA SOURCES (UPDATED)
════════════════════════════════════════

PRIMARY (DAILY SNAPSHOT): Virlo API
- Base URL: https://api.virlo.ai/v1
- Auth: Bearer token in Authorization header (use the existing project env var; do not introduce/rename env vars)
- Endpoint: GET /v1/trends/digest
- Purpose: Take ONE daily snapshot of trending social topics (for the “Virlo integration” story + fallback pool)
- Cache: 24 hours (max 1 call/day). Never call more than once per UTC day.
- IMPORTANT: Do NOT call non-versioned /trends/digest

DEFAULT (ALL DAY): NewsData.io API (topics + research)
- Base URL: https://newsdata.io/api/1
- Topics endpoint: GET /news?apikey=KEY&language=en&category=world,technology,business,science
- Research endpoint: same /news endpoint but with query (q=topic) and a reasonable size limit
- Cache: 1 hour
- Use: Primary topic feed after the daily Virlo snapshot; also the sole research source provider

LAST RESORT: Hardcoded seed topics
- Use only if both APIs fail
- Topics:
  [
    "AI regulation", "climate summit", "global markets", "tech layoffs",
    "space exploration", "cybersecurity breach", "election updates",
    "energy transition", "healthcare innovation", "geopolitical tensions"
  ]

════════════════════════════════════════
NEW 7-STEP PIPELINE (UPDATED)
════════════════════════════════════════

──────────────────────────────────────
STEP 1 — INGEST (UPDATED)
──────────────────────────────────────
- Daily Virlo snapshot logic:
  - If no Virlo snapshot exists for today (UTC), call Virlo /v1/trends/digest once and store it.
  - If Virlo snapshot for today already exists, DO NOT call Virlo again.
- Topic ingestion for generation:
  - If this is the first run of the day and Virlo snapshot succeeded, still proceed to NewsData for ongoing topic ingestion after snapshot is captured.
  - Fetch topics from NewsData and extract the top 15 raw topic signals (titles/headlines).
  - If NewsData errors/returns empty, fall back to the daily Virlo snapshot topics.
  - If both are unavailable, fall back to seed topics.
- Deduplicate similar topics (if two topics are about the same story, keep only one).
- Store rawTopics[] (the final 15-topic list that will be scored).

──────────────────────────────────────
STEP 2 — TOPIC SCORING
──────────────────────────────────────
For each raw topic, call Claude to score it on 4 axes (0-25 points each, max 100):

SCORING PROMPT:
"Score this news topic on four axes, 0-25 each:
1. Freshness — how recent and time-sensitive is this?
   (breaking = 25, week-old = 10, evergreen = 5)
2. Source availability — can 3+ credible independent sources likely be found?
   (definitely = 25, probably = 15, unlikely = 5)
3. Public interest — how broadly relevant to a general global audience?
   (universal = 25, regional = 15, niche = 5)
4. Verifiability — are the core claims checkable against named people, dates, numbers, places?
   (highly verifiable = 25, vague = 5)

Return ONLY JSON: {
  topic: string,
  freshness: number,
  sourceAvailability: number,
  publicInterest: number,
  verifiability: number,
  totalScore: number,
  skipReason: string | null
}"

- Sort topics by totalScore descending
- DISCARD any topic scoring below 60
- Take top 5 topics forward to research
- Log: "Topic [name] scored [X]/100"

──────────────────────────────────────
STEP 3 — RESEARCH (UPDATED: NEWSDATA-BASED)
──────────────────────────────────────
For each qualifying topic:
- Call NewsData search (q=topic) to gather candidate sources/articles.
- Then call Claude to turn those search hits into a newsroom-grade research brief.
- Claude MUST NOT use web_search or outside browsing; it may only use the provided NewsData results.

RESEARCH PROMPT (UPDATED):
"You are a senior investigative researcher at a world-class newsroom.
You are given a list of NewsData search results for a topic (title, url, source, excerpt, publishedAt).
Using ONLY these provided sources (do not browse, do not use outside knowledge), select 3-5 credible, diverse sources and extract verifiable facts.

HARD RULES:
- If you cannot produce at least 3 specific verifiable facts with named sources from the provided results, return:
  { error: 'insufficient_data', reason: string }
- Do NOT generalize or fabricate.
- Every fact must have a named source attached (must match one of the source names in sources[]).
- Look for: named individuals, specific numbers, dates, places, official statements, data.

Return ONLY valid JSON:
{
  topic: string,
  sources: [{
    name: string,
    url: string,
    tier: 1 | 2 | 3,
    credibilityNotes: string
  }],
  keyFacts: [{
    fact: string,
    source: string,
    confidence: 'confirmed' | 'reported' | 'alleged'
  }],
  namedSources: string[],
  timeline: [{ date: string, event: string }],
  conflictingClaims: [{
    claim: string,
    source: string,
    counterclaim: string,
    counterSource: string
  }],
  backgroundContext: string,
  whatWeDoNotKnow: string[]
}

Source tier definitions:
Tier 1 = peer-reviewed, government official, major wire service (Reuters, AP, AFP)
Tier 2 = established news outlet, hospital, university
Tier 3 = blog, social media, opinion"

- If research returns insufficient_data, skip this topic entirely. Log the reason.
- If keyFacts.length < 3, skip topic.
- Move to next topic.

──────────────────────────────────────
STEP 4 — CONFIDENCE GRADING (CODE, NOT AI)
──────────────────────────────────────
Before writing, grade the research brief:

GRADING LOGIC:
- Count Tier 1 sources in sources[]
- Check corroboration (2+ sources confirm same fact)
- Check conflictingClaims[]

Grade assignment:
A → Tier 1 present + corroboration → publish normally
B → Tier 1 present only, no corroboration → publish with note: "Based on single primary source"
C → No Tier 1, but has 3+ claims with sources → publish with badge: "DEVELOPING STORY"
D → keyFacts < 3 → DO NOT publish
HOLD → conflictingClaims has unresolved entries → DO NOT publish, flag

Log: "Article grade: [A/B/C/D/HOLD] for [topic]"
Only proceed with grades A, B, and C.

──────────────────────────────────────
STEP 5 — WRITE ARTICLE
──────────────────────────────────────
Pass research JSON + grade to Claude writer.

(Writer prompt unchanged from your spec; keep all hard rules, banned phrases, H2 headers every 3 paragraphs, inline citations [Source Name], minimum 650 words, prose only, use ONLY the brief.)

──────────────────────────────────────
STEP 6 — FACT CHECK
──────────────────────────────────────
Pass finished article back to Claude for final guardrail check.

(Fact-check prompt unchanged from your spec; one rewrite max; never publish if critical fails twice.)

──────────────────────────────────────
STEP 7 — STORE AND PUBLISH
──────────────────────────────────────
Store article with full metadata (unchanged from your spec), including gradeBadge rules:
A → "Grade A · Verified & Corroborated" (green)
B → "Grade B · Primary Source" (yellow)
C → "Grade C · Developing Story" (orange)

Log full pipeline summary:
"Pipeline complete: [X] topics ingested, [X] scored above 60, [X] researched, [X] graded A/B/C, [X] published, [X] rejected"

════════════════════════════════════════
PIPELINE STATUS FEED (UPDATED FOR DAILY VIRLO)
════════════════════════════════════════
Update the live pipeline feed at each step:
- "Fetching daily trends from Virlo..." (only on first run of the UTC day)
- "Using cached Virlo daily snapshot..."
- "Fetching topics from NewsData..."
- "Scoring 15 topics..."
- "Topic '[name]' scored 78/100 → researching"
- "Topic '[name]' scored 44/100 → skipped"
- "Researching: [topic name]..."
- "Grade [A/B/C] assigned to [topic]"
- "Writing article: [headline]..."
- "Fact-checking: [headline]..."
- "Published: [headline] · [wordCount] words · Grade [X]"
- "Rejected: [topic] · Reason: [reason]"

════════════════════════════════════════
DO NOT CHANGE
════════════════════════════════════════
- Frontend components (except pipeline feed text updates)
- Article reader page UI
- API route signatures
- Authentication or environment variables
- Anything outside the pipeline module, Virlo client module, NewsData module, prompts module, and the generate endpoint implementation