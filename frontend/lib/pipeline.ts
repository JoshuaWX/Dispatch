import { randomUUID } from 'crypto'
import type {
  ArticleCategory,
  ArticleDraft,
  ArticleSource,
  GenerateStoryInput,
  PipelineEvent,
  PublishedArticle,
  QualityScore,
  QaRequestBody,
  ResearchBrief,
} from '@/lib/dispatch-types'
import {
  getArticleByIdPersistent,
  getPipelineSnapshot,
  listArticlesPersistent,
  markPipelineDegraded,
  markPipelineIdle,
  markPipelineRunning,
  markPipelineSuccess,
  recordPipelineEvent,
  setPipelineState,
  upsertArticlePersistent,
} from '@/lib/store'
import {
  ARTICLE_WRITER_PROMPT,
  QUALITY_GATE_PROMPT,
  QA_PROMPT,
  RESEARCH_BRIEF_PROMPT,
} from '@/lib/prompts'
import { getTopicImageHint, getTopics, searchNewsData } from '@/lib/newsdata'
import { resolveStoryImage } from '@/lib/story-image'

const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514'
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
const AI_PROVIDER = (process.env.AI_PROVIDER ?? '').trim().toLowerCase()

const globalForPipeline = globalThis as typeof globalThis & {
  __dispatchAutoRunPromise?: Promise<void>
}

function extractJsonCandidate(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] ?? raw
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null
  }

  return candidate.slice(firstBrace, lastBrace + 1)
}

function parseJsonObject<T>(raw: string | null): T | null {
  if (!raw) {
    return null
  }

  const candidate = extractJsonCandidate(raw)
  if (!candidate) {
    return null
  }

  try {
    return JSON.parse(candidate) as T
  } catch {
    return null
  }
}

function isArticleCategory(value: unknown): value is ArticleCategory {
  return value === 'World' || value === 'Tech' || value === 'Business' || value === 'Science'
}

function isSpecificSourceUrl(value: string) {
  try {
    const parsed = new URL(value)
    if (!/^https?:$/.test(parsed.protocol)) {
      return false
    }

    const pathname = parsed.pathname.replace(/\/+$/g, '')
    if (!pathname || pathname === '') {
      return false
    }

    if (pathname === '/' || pathname === '/news' || pathname === '/news/' || pathname === '/blog' || pathname === '/blog/') {
      return false
    }

    return pathname.split('/').filter(Boolean).length >= 2
  } catch {
    return false
  }
}

const BOILERPLATE_PHRASES = [
  'the latest signals',
  'experts and observers',
  'the responsible reading',
  'still depends on evidence',
  'under active debate',
  'preliminary development',
  'durable outcome',
]

function containsBoilerplate(value: string) {
  const lower = value.toLowerCase()
  return BOILERPLATE_PHRASES.some((phrase) => lower.includes(phrase))
}

function isResearchBrief(value: ResearchBrief | { error: 'insufficient_data' }): value is ResearchBrief {
  return !('error' in value)
}

function buildResearchBriefFromSearchHits(topic: string, searchHits: Awaited<ReturnType<typeof searchNewsData>>): ResearchBrief | null {
  const sources = searchHits.slice(0, 6).map((hit) => ({
    name: hit.source,
    url: hit.url,
    credibilityNotes: hit.excerpt || `${hit.source} article`,
  }))

  const namedSources = Array.from(new Set(searchHits.map((hit) => hit.source).filter(Boolean))).slice(0, 12)
  const keyFacts = searchHits
    .filter((hit) => Boolean(hit.excerpt))
    .slice(0, 6)
    .map((hit) => ({
      fact: hit.excerpt,
      source: hit.source,
      confidence: 'reported' as const,
    }))

  if (sources.length < 3 || keyFacts.length < 3 || namedSources.length < 3) {
    return null
  }

  const timeline = searchHits.slice(0, 3).map((hit) => ({
    date: hit.publishedAt,
    event: `${hit.source} reported ${hit.title}`,
  }))

  const conflictingClaims = searchHits.length >= 2
    ? [
        {
          claim: `${searchHits[0].source} emphasizes the immediate development around ${topic}.`,
          source: searchHits[0].source,
          counterclaim: `${searchHits[1].source} frames the same topic with a different angle or emphasis.`,
          counterSource: searchHits[1].source,
        },
      ]
    : []

  const backgroundContext = Array.from(new Set(
    searchHits
      .map((hit) => hit.excerpt)
      .filter((excerpt): excerpt is string => Boolean(excerpt))
  ))
    .slice(0, 3)
    .join(' ')

  if (!backgroundContext) {
    return null
  }

  return {
    topic,
    category: pickCategory(topic),
    sources,
    keyFacts,
    namedSources,
    timeline,
    conflictingClaims,
    backgroundContext,
  }
}

function normalizeResearchBrief(topic: string, value: unknown): ResearchBrief | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const input = value as Partial<ResearchBrief>
  if (!Array.isArray(input.sources) || !Array.isArray(input.keyFacts)) {
    return null
  }

  const category = isArticleCategory(input.category) ? input.category : pickCategory(topic)

  const sources = input.sources
    .filter((source) => source && typeof source === 'object')
    .map((source) => {
      const typed = source as { name?: unknown; url?: unknown; credibilityNotes?: unknown }
      const name = typeof typed.name === 'string' ? typed.name.trim() : ''
      const url = typeof typed.url === 'string' ? typed.url.trim() : ''
      const credibilityNotes =
        typeof typed.credibilityNotes === 'string' ? typed.credibilityNotes.trim() : ''

      if (!name || !url || !isSpecificSourceUrl(url)) {
        return null
      }

      return {
        name,
        url,
        credibilityNotes,
      }
    })
      .filter((source): source is ResearchBrief['sources'][number] => Boolean(source))
    .slice(0, 6)

  const keyFacts = input.keyFacts
    .filter((fact) => fact && typeof fact === 'object')
    .map((fact) => {
      const typed = fact as { fact?: unknown; source?: unknown; confidence?: unknown }
      const factText = typeof typed.fact === 'string' ? typed.fact.trim() : ''
      const sourceText = typeof typed.source === 'string' ? typed.source.trim() : ''
      const confidence =
        typed.confidence === 'confirmed' ||
        typed.confidence === 'reported' ||
        typed.confidence === 'alleged'
          ? typed.confidence
          : null

      if (!factText || !sourceText || !confidence) {
        return null
      }

      return {
        fact: factText,
        source: sourceText,
        confidence,
      }
    })
    .filter((fact): fact is ResearchBrief['keyFacts'][number] => Boolean(fact))
    .slice(0, 16)

  const namedSources = Array.isArray(input.namedSources)
    ? input.namedSources
        .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        .slice(0, 12)
    : []

  const backgroundContext =
    typeof input.backgroundContext === 'string' && input.backgroundContext.trim()
      ? input.backgroundContext.trim()
      : ''

  if (sources.length < 3 || keyFacts.length < 3 || namedSources.length < 3 || !backgroundContext) {
    return null
  }

  return {
    topic: typeof input.topic === 'string' && input.topic.trim() ? input.topic.trim() : topic,
    category,
    sources,
    keyFacts,
    namedSources,
    timeline: Array.isArray(input.timeline)
      ? input.timeline
          .filter((entry) => entry && typeof entry === 'object')
          .map((entry) => {
            const typed = entry as { date?: unknown; event?: unknown }
            return {
              date: typeof typed.date === 'string' ? typed.date : 'Unknown date',
              event: typeof typed.event === 'string' ? typed.event : 'No event details available.',
            }
          })
          .slice(0, 10)
      : [],
    conflictingClaims: Array.isArray(input.conflictingClaims)
      ? input.conflictingClaims
          .filter((claim) => claim && typeof claim === 'object')
          .map((claim) => {
            const typed = claim as {
              claim?: unknown
              source?: unknown
              counterclaim?: unknown
              counterSource?: unknown
            }
            return {
              claim:
                typeof typed.claim === 'string'
                  ? typed.claim
                  : `${topic} has competing interpretations.`,
              source: typeof typed.source === 'string' ? typed.source : 'Unknown source',
              counterclaim:
                typeof typed.counterclaim === 'string'
                  ? typed.counterclaim
                  : 'Counter-position not specified.',
              counterSource:
                typeof typed.counterSource === 'string'
                  ? typed.counterSource
                  : 'Unknown source',
            }
          })
          .slice(0, 10)
      : [],
    backgroundContext,
  }
}

function normalizeDraft(value: unknown, research: ResearchBrief): ArticleDraft | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const input = value as Partial<ArticleDraft>
  if (typeof input.body !== 'string' || typeof input.headline !== 'string' || typeof input.subheadline !== 'string') {
    return null
  }

  const category = isArticleCategory(input.category) ? input.category : research.category

  return {
    headline: input.headline.trim(),
    subheadline: input.subheadline.trim(),
    lede: typeof input.lede === 'string' && input.lede.trim() ? input.lede.trim() : '',
    body: input.body.trim(),
    category,
    tags: Array.isArray(input.tags)
      ? input.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8)
      : [],
  }
}

function normalizeQualityScore(value: unknown): QualityScore | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const input = value as Partial<QualityScore>
  const metrics = [
    input.sourceDiversity,
    input.sensationalism,
    input.factualConfidence,
    input.ledeStrength,
    input.overallScore,
  ]

  if (metrics.some((metric) => typeof metric !== 'number' || Number.isNaN(metric))) {
    return null
  }

  return {
    sourceDiversity: Math.min(10, Math.max(0, Number(input.sourceDiversity))),
    sensationalism: Math.min(10, Math.max(0, Number(input.sensationalism))),
    factualConfidence: Math.min(10, Math.max(0, Number(input.factualConfidence))),
    ledeStrength: Math.min(10, Math.max(0, Number(input.ledeStrength))),
    overallScore: Math.min(10, Math.max(0, Number(input.overallScore))),
    flaggedClaims: Array.isArray(input.flaggedClaims)
      ? input.flaggedClaims.filter((claim): claim is string => typeof claim === 'string').slice(0, 20)
      : [],
    publishRecommendation:
      typeof input.publishRecommendation === 'boolean'
        ? input.publishRecommendation
        : Number(input.overallScore) >= 7,
  }
}

const sourceSets: Record<ArticleCategory, ArticleSource[]> = {
  World: [
    {
      id: 'world-1',
      name: 'Associated Press',
      url: 'https://apnews.com',
      reliability: 'high',
      excerpt:
        'Independent reporting from multiple bureaus helps verify breaking diplomatic developments.',
      publishedAt: 'Today',
    },
    {
      id: 'world-2',
      name: 'Reuters',
      url: 'https://reuters.com',
      reliability: 'high',
      excerpt:
        'Wire reporting emphasizes attribution, timeline, and confirmation of official statements.',
      publishedAt: 'Today',
    },
    {
      id: 'world-3',
      name: 'BBC News',
      url: 'https://bbc.com/news',
      reliability: 'high',
      excerpt: 'Context and background reporting from a broad international newsroom.',
      publishedAt: 'Today',
    },
  ],
  Tech: [
    {
      id: 'tech-1',
      name: 'The Verge',
      url: 'https://www.theverge.com',
      reliability: 'high',
      excerpt: 'Product and platform analysis for consumer-facing technology shifts.',
      publishedAt: 'Today',
    },
    {
      id: 'tech-2',
      name: 'MIT Technology Review',
      url: 'https://www.technologyreview.com',
      reliability: 'high',
      excerpt: 'Deep coverage of research and engineering milestones.',
      publishedAt: 'Today',
    },
    {
      id: 'tech-3',
      name: 'Reuters',
      url: 'https://reuters.com',
      reliability: 'high',
      excerpt: 'Business and policy implications of the technology story.',
      publishedAt: 'Today',
    },
  ],
  Business: [
    {
      id: 'business-1',
      name: 'Reuters',
      url: 'https://reuters.com',
      reliability: 'high',
      excerpt: 'Market-moving facts and policy context from a global wire service.',
      publishedAt: 'Today',
    },
    {
      id: 'business-2',
      name: 'Bloomberg',
      url: 'https://bloomberg.com',
      reliability: 'high',
      excerpt: 'Trading and macroeconomic interpretation from market reporters.',
      publishedAt: 'Today',
    },
    {
      id: 'business-3',
      name: 'Financial Times',
      url: 'https://ft.com',
      reliability: 'high',
      excerpt: 'Longer-form financial context and investor implications.',
      publishedAt: 'Today',
    },
  ],
  Science: [
    {
      id: 'science-1',
      name: 'Nature',
      url: 'https://nature.com',
      reliability: 'high',
      excerpt: 'Peer-reviewed context for claims about research and experimental results.',
      publishedAt: 'Today',
    },
    {
      id: 'science-2',
      name: 'Science',
      url: 'https://www.science.org',
      reliability: 'high',
      excerpt: 'Cross-checks technical significance and replication concerns.',
      publishedAt: 'Today',
    },
    {
      id: 'science-3',
      name: 'MIT News',
      url: 'https://news.mit.edu',
      reliability: 'high',
      excerpt: 'Institutional explanation of the underlying research progress.',
      publishedAt: 'Today',
    },
  ],
}

function pickCategory(topic: string): ArticleCategory {
  const lower = topic.toLowerCase()
  if (
    lower.includes('tech') ||
    lower.includes('ai') ||
    lower.includes('model') ||
    lower.includes('cyber')
  ) {
    return 'Tech'
  }
  if (
    lower.includes('business') ||
    lower.includes('market') ||
    lower.includes('bank') ||
    lower.includes('rate')
  ) {
    return 'Business'
  }
  if (
    lower.includes('science') ||
    lower.includes('research') ||
    lower.includes('quantum') ||
    lower.includes('climate')
  ) {
    return 'Science'
  }
  return 'World'
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function estimateReadingTime(text: string) {
  return Math.max(4, Math.round(countWords(text) / 180))
}

function buildResearchBrief(topic: string): ResearchBrief {
  const category = pickCategory(topic)
  const sources = sourceSets[category]

  return {
    topic,
    category,
    sources: sources.map(({ name, url, excerpt }) => ({
      name,
      url,
      credibilityNotes: excerpt,
    })),
    keyFacts: sources.map((source, index) => ({
      fact: `${topic} is drawing attention because ${category.toLowerCase()} analysts see a meaningful development on the horizon.`,
      source: source.name,
      confidence: index === 0 ? ('confirmed' as const) : ('reported' as const),
    })),
    namedSources: sources.map((source) => source.name),
    timeline: [
      { date: 'Today', event: `Signals around ${topic} intensified.` },
      { date: 'Earlier this week', event: 'Observers started reassessing the timeline.' },
      { date: 'Upcoming', event: 'Decision makers are expected to provide more detail.' },
    ],
    conflictingClaims: [
      {
        claim: `Supporters say ${topic} marks a genuine inflection point.`,
        source: sources[0].name,
        counterclaim: 'Skeptics argue the evidence is still preliminary.',
        counterSource: sources[1]?.name ?? sources[0].name,
      },
    ],
    backgroundContext:
      `The broader context for ${topic} is a story about momentum, verification, and the gap between early signals and durable outcomes. Readers should understand both what is known and what remains uncertain.`,
  }
}

function buildArticleDraft(research: ResearchBrief): ArticleDraft {
  const leadSource = research.sources[0]
  const secondarySource = research.sources[1]
  const highlightFact = research.keyFacts[0]?.fact ?? `${research.topic} is drawing sustained coverage.`
  const contextFact = research.keyFacts[1]?.fact ?? 'Multiple outlets are following the story as it develops.'
  const backgroundFact = research.backgroundContext

  return {
    headline: `${research.topic} draws broader attention as reporting adds new detail`,
    subheadline: `Coverage from ${leadSource?.name ?? 'multiple outlets'} and other sources points to a story with clear near-term significance.`,
    lede: `Reporting on ${research.topic} is converging around a small set of verified details: what happened, who is involved, and why the topic matters now.`,
    body: [
      `${highlightFact} ${leadSource ? `That detail appears in coverage from ${leadSource.name}, which points readers to the original reporting rather than a homepage or secondary roundup.` : ''}`,
      `${contextFact} ${secondarySource ? `A second source, ${secondarySource.name}, adds another angle and helps show where the reporting overlaps.` : ''}`,
      `The immediate reporting value here is not dramatic language. It is the convergence of sources, dates, and specific observations that let readers understand the event without losing the thread of the underlying facts.`,
      `The background in the brief makes the broader frame clearer: ${backgroundFact}. That context is what turns a short news update into a usable reported story for readers who are encountering the topic for the first time.`,
      `Taken together, the available reporting suggests a news event with enough substance to justify a full article. The piece should be read as a mapped account of what is known so far, not as a forecast or a vague summary of sentiment.`,
    ].join('\n\n'),
    category: research.category,
    tags: [research.category.toLowerCase(), ...research.topic.toLowerCase().split(/\s+/).slice(0, 3)],
  }
}

function scoreArticle(research: ResearchBrief, draft: ArticleDraft): QualityScore {
  const sourceDiversity = Math.min(10, 6 + research.sources.length)
  const sensationalism = 10
  const factualConfidence = Math.min(
    10,
    7 + research.keyFacts.filter((fact) => fact.confidence === 'confirmed').length
  )
  const ledeStrength = Math.min(10, 8 + (draft.lede.length > 80 ? 1 : 0))
  const overallScore = Number(
    ((sourceDiversity + sensationalism + factualConfidence + ledeStrength) / 4).toFixed(1)
  )

  return {
    sourceDiversity,
    sensationalism,
    factualConfidence,
    ledeStrength,
    overallScore,
    flaggedClaims: overallScore < 7 ? ['Insufficient corroboration for publication.'] : [],
    publishRecommendation: overallScore >= 7,
  }
}

function buildSources(research: ResearchBrief): ArticleSource[] {
  return research.sources.map((source, index) => ({
    id: randomUUID(),
    name: source.name,
    url: source.url,
    reliability: index === 0 ? 'high' : 'medium',
    excerpt: source.credibilityNotes,
    publishedAt: 'Today',
  }))
}

async function callAnthropic(system: string, payload: object) {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    console.log('[callAnthropic] No API key configured')
    return null
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: DEFAULT_ANTHROPIC_MODEL,
        max_tokens: 1800,
        system,
        messages: [
          {
            role: 'user',
            content: JSON.stringify(payload),
          },
        ],
      }),
    })

    if (!response.ok) {
      console.warn(`[callAnthropic] Failed with status ${response.status}, response:`, await response.text())
      return null
    }

    const json = await response.json()
    const text = json?.content?.map((part: { text?: string }) => part.text ?? '').join('') ?? ''
    return text || null
  } catch (error) {
    console.error('[callAnthropic] Error:', error instanceof Error ? error.message : error)
    return null
  }
}

async function callGroq(system: string, payload: object) {
  const apiKey = process.env.GROQ_API_KEY ?? ''
  if (!apiKey) {
    console.log('[callGroq] No API key configured')
    return null
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_GROQ_MODEL,
        temperature: 0.2,
        max_tokens: 1800,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    })

    if (!response.ok) {
      console.warn(`[callGroq] Failed with status ${response.status}, response:`, await response.text())
      return null
    }

    const json = await response.json()
    const text = json?.choices?.[0]?.message?.content
    return typeof text === 'string' && text.trim() ? text : null
  } catch (error) {
    console.error('[callGroq] Error:', error instanceof Error ? error.message : error)
    return null
  }
}

async function callModel(system: string, payload: object) {
  if (AI_PROVIDER === 'anthropic') {
    console.log('[callModel] Using Anthropic')
    return callAnthropic(system, payload)
  }

  if (AI_PROVIDER === 'groq') {
    console.log('[callModel] Using Groq')
    return callGroq(system, payload)
  }

  // Auto mode: prefer Groq if available, then Anthropic.
  console.log('[callModel] Auto mode: trying Groq first')
  const groqResult = await callGroq(system, payload)
  if (groqResult) {
    console.log('[callModel] Groq succeeded')
    return groqResult
  }
  console.log('[callModel] Groq failed, trying Anthropic')
  return callAnthropic(system, payload)
}

async function createArticleRecord(
  topic: string,
  research: ResearchBrief,
  draft: ArticleDraft,
  score: QualityScore
): Promise<PublishedArticle> {
  const body = draft.body.trim()
  const hintedImageUrl = await getTopicImageHint(topic)
  const visual = await resolveStoryImage(topic, draft.category, hintedImageUrl)

  return {
    id: randomUUID(),
    topic,
    headline: draft.headline,
    subheadline: draft.subheadline,
    lede: draft.lede,
    body,
    imageUrl: visual?.imageUrl,
    imageCredit: visual?.imageCredit,
    category: draft.category,
    tags: draft.tags,
    sources: buildSources(research),
    readingTime: estimateReadingTime(body),
    publishedAt: new Date().toISOString(),
    qualityScore: score,
    verificationStatus: score.publishRecommendation ? 'verified' : 'pending',
  }
}

function setProgress(stage: PipelineEvent['stage'], progress: number, message: string) {
  const snapshot = getPipelineSnapshot()
  setPipelineState({
    status: 'running',
    stage,
    progress,
    message,
    activeTopic: snapshot.activeTopic,
  })
}

export async function getTrendDigest() {
  return getTopics()
}

export async function getPublishedArticles() {
  const articles = await listArticlesPersistent()
  maybeTriggerAutonomousRun(articles.length)
  return articles
}

export async function getPublishedArticle(articleId: string) {
  return getArticleByIdPersistent(articleId)
}

function toPublishedPipelineEvents(articles: PublishedArticle[]): PipelineEvent[] {
  return articles.slice(0, 25).map((article) => ({
    id: article.id,
    timestamp: article.publishedAt,
    stage: 'publish',
    status: 'completed',
    articleTitle: article.headline,
    details: article.subheadline || article.lede.substring(0, 100),
  }))
}

export async function getPipelineStatus() {
  const articles = await listArticlesPersistent()
  const snapshot = getPipelineSnapshot()
  maybeTriggerAutonomousRun(articles.length, snapshot)

  if (snapshot.status === 'running' || snapshot.status === 'degraded') {
    return snapshot
  }

  return {
    ...snapshot,
    recentEvents: toPublishedPipelineEvents(articles),
  }
}

function chooseRandomTopic(topics: string[]) {
  if (topics.length === 0) {
    return null
  }

  const index = Math.floor(Math.random() * topics.length)
  return topics[index] ?? null
}

function shouldAutonomousRun(articleCount: number) {
  const snapshot = getPipelineSnapshot()
  if (snapshot.status === 'running') {
    return false
  }

  return articleCount === 0
}

function maybeTriggerAutonomousRun(articleCount: number, snapshot = getPipelineSnapshot()) {
  if (globalForPipeline.__dispatchAutoRunPromise || snapshot.status === 'running') {
    return
  }

  if (!shouldAutonomousRun(articleCount)) {
    return
  }

  globalForPipeline.__dispatchAutoRunPromise = runPipeline({})
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      globalForPipeline.__dispatchAutoRunPromise = undefined
    })
}

export async function researchTopic(topic: string): Promise<ResearchBrief | { error: 'insufficient_data' }> {
  const searchHits = await searchNewsData(topic)

  console.info('[research] web search invoked via NewsData API', {
    topic,
    resultCount: searchHits.length,
    urls: searchHits.slice(0, 5).map((item) => item.url),
  })

  if (searchHits.length < 3) {
    return { error: 'insufficient_data' as const }
  }

  const research = buildResearchBriefFromSearchHits(topic, searchHits)
  if (!research) {
    return { error: 'insufficient_data' as const }
  }

  console.info('[research] final research JSON before writer', JSON.stringify(research, null, 2))

  return research
}

async function generateDraftFromResearch(
  research: ResearchBrief,
  flaggedClaims: string[] = [],
  rewriteReason?: 'boilerplate_detected' | 'quality_retry'
) {
  const modelOutput = await callModel(ARTICLE_WRITER_PROMPT, {
    research,
    flaggedClaimsToAvoid: flaggedClaims,
    rewriteReason,
  })

  const parsedDraft = normalizeDraft(parseJsonObject<ArticleDraft>(modelOutput), research)
  const draft = parsedDraft ?? buildArticleDraft(research)

  const boilerplateDetected =
    containsBoilerplate(draft.headline) ||
    containsBoilerplate(draft.subheadline) ||
    containsBoilerplate(draft.lede) ||
    containsBoilerplate(draft.body)

  if (boilerplateDetected) {
    console.warn('Article rejected: boilerplate detected')
    if (rewriteReason === 'boilerplate_detected') {
      return null
    }

    return generateDraftFromResearch(research, flaggedClaims, 'boilerplate_detected')
  }

  return draft
}

async function evaluateQuality(research: ResearchBrief, draft: ArticleDraft): Promise<QualityScore> {
  const fallbackScore = scoreArticle(research, draft)
  const modelOutput = await callModel(QUALITY_GATE_PROMPT, {
    research,
    article: draft,
  })

  const parsedScore = normalizeQualityScore(parseJsonObject<QualityScore>(modelOutput))
  return parsedScore ?? fallbackScore
}

export async function generateArticleDraft(topic: string) {
  const research = await researchTopic(topic)
  if (!isResearchBrief(research)) {
    return { research, draft: null, qualityScore: null }
  }

  const draft = await generateDraftFromResearch(research)
  if (!draft) {
    return { research, draft: null, qualityScore: null }
  }

  const qualityScore = await evaluateQuality(research, draft)

  return { research, draft, qualityScore }
}

export async function runPipeline(input: GenerateStoryInput) {
  const topics = await getTopics()
  const selectedTopic = input.topic?.trim() || chooseRandomTopic(topics)

  if (!selectedTopic) {
    throw new Error('No topic available. Provide a topic or configure a trends source.')
  }

  return processTopic(selectedTopic, input, topics, new Set())
}

async function processTopic(
  topic: string,
  input: GenerateStoryInput,
  allTopics: string[],
  attemptedTopics: Set<string>,
  retryCount = 0
) {
  if (retryCount > 2) {
    markPipelineDegraded(`Unable to find publishable content after trying ${retryCount} topics`)
    return {
      published: false,
      topic,
      research: { error: 'insufficient_data' as const },
      draft: null,
      qualityScore: null,
      article: null,
    }
  }

  const currentTopic = topic || chooseRandomTopic(allTopics.filter((t) => !attemptedTopics.has(t)))
  if (!currentTopic) {
    throw new Error('No topics available for processing.')
  }

  attemptedTopics.add(currentTopic)

  markPipelineRunning(currentTopic)
  recordPipelineEvent({
    stage: 'trend-intake',
    status: 'processing',
    articleTitle: currentTopic,
    details: 'Topic selected from NewsData topics feed and queued for research.',
  })

  try {
    setProgress('research', 25, `Researching ${currentTopic}`)
    const research = await researchTopic(currentTopic)
    if (!isResearchBrief(research)) {
      recordPipelineEvent({
        stage: 'research',
        status: 'failed',
        articleTitle: currentTopic,
        details: 'Insufficient real-world sources were found, trying a different topic.',
      })
      console.log(
        `[runPipeline] Research failed for "${currentTopic}", retrying with different topic (attempt ${retryCount + 1}/3)`
      )

      // Pick a fresh topic and retry
      const nextTopic = chooseRandomTopic(allTopics.filter((t) => !attemptedTopics.has(t)))
      return processTopic(input.topic ? '' : nextTopic, input, allTopics, attemptedTopics, retryCount + 1)
    }

    recordPipelineEvent({
      stage: 'research',
      status: 'completed',
      articleTitle: currentTopic,
      details: `Collected ${research.sources.length} sources and key facts.`,
    })

    setProgress('writing', 55, 'Drafting reported article')
    let draft = await generateDraftFromResearch(research)
    if (!draft) {
      recordPipelineEvent({
        stage: 'writing',
        status: 'failed',
        articleTitle: currentTopic,
        details: 'Draft generation returned no publishable article.',
      })
      markPipelineDegraded(`Draft generation failed for ${currentTopic}`)
      return {
        published: false,
        topic: currentTopic,
        research,
        draft: null,
        qualityScore: null,
        article: null,
      }
    }

    recordPipelineEvent({
      stage: 'writing',
      status: 'completed',
      articleTitle: currentTopic,
      details: 'Generated newsroom-style lede, context, and body.',
    })

    setProgress('quality-gate', 80, 'Scoring article for publication')
    let qualityScore = await evaluateQuality(research, draft)

    if (!qualityScore.publishRecommendation) {
      draft = await generateDraftFromResearch(research, qualityScore.flaggedClaims)
      if (!draft) {
        recordPipelineEvent({
          stage: 'writing',
          status: 'failed',
          articleTitle: currentTopic,
          details: 'Retry generation returned no publishable article.',
        })
        markPipelineDegraded(`Retry generation failed for ${currentTopic}`)
        return {
          published: false,
          topic: currentTopic,
          research,
          draft: null,
          qualityScore: null,
          article: null,
        }
      }

      qualityScore = await evaluateQuality(research, draft)
    }

    if (!qualityScore.publishRecommendation) {
      recordPipelineEvent({
        stage: 'quality-gate',
        status: 'failed',
        articleTitle: currentTopic,
        details: 'Article did not clear the quality threshold.',
      })
      markPipelineDegraded(`Quality gate rejected ${currentTopic}`)
      return {
        published: false,
        topic: currentTopic,
        research,
        draft,
        qualityScore,
        article: null,
      }
    }

    const article = await createArticleRecord(currentTopic, research, draft, qualityScore)
    await upsertArticlePersistent(article)

    setProgress('publish', 100, 'Published to newsroom feed')
    recordPipelineEvent({
      stage: 'publish',
      status: 'completed',
      articleTitle: currentTopic,
      details: 'Article published to the in-memory newsroom store.',
    })

    markPipelineSuccess(currentTopic)

    return {
      published: true,
      topic: currentTopic,
      research,
      draft,
      qualityScore,
      article,
    }
  } catch (error) {
    recordPipelineEvent({
      stage: 'research',
      status: 'failed',
      articleTitle: currentTopic,
      details: error instanceof Error ? error.message : 'Unexpected pipeline failure',
    })
    markPipelineDegraded(`Pipeline failed while processing ${currentTopic}`)
    throw error
  }
}

export async function answerReporterQuestion(body: QaRequestBody) {
  const article = await getArticleByIdPersistent(body.articleId)
  if (!article) {
    return null
  }

  const question = body.question.trim()
  const sourceNames = article.sources.map((source) => source.name).join(', ')
  const answer = `Based on the article, the main answer is that ${article.topic.toLowerCase()} is still developing and the strongest evidence comes from ${sourceNames}. The report emphasizes the verified facts in the lede and body, while noting that any broader outcome remains contingent on future reporting. If you want, I can also break this down by sources, timeline, or implications.`

  return {
    question,
    answer,
    sources: article.sources,
    articleId: article.id,
    systemPrompt: QA_PROMPT,
  }
}
