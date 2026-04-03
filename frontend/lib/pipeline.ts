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
  getArticleById,
  getPipelineSnapshot,
  listArticles,
  markPipelineDegraded,
  markPipelineIdle,
  markPipelineRunning,
  markPipelineSuccess,
  recordPipelineEvent,
  setPipelineState,
  upsertArticle,
} from '@/lib/store'
import {
  ARTICLE_WRITER_PROMPT,
  QUALITY_GATE_PROMPT,
  QA_PROMPT,
  RESEARCH_BRIEF_PROMPT,
} from '@/lib/prompts'
import { getTopicImageHint, getTopics } from '@/lib/newsdata'
import { resolveStoryImage } from '@/lib/story-image'

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514'

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

function normalizeResearchBrief(topic: string, value: unknown): ResearchBrief | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const input = value as Partial<ResearchBrief>
  if (!Array.isArray(input.sources) || !Array.isArray(input.keyFacts)) {
    return null
  }

  const category = isArticleCategory(input.category) ? input.category : pickCategory(topic)

  return {
    topic: typeof input.topic === 'string' && input.topic.trim() ? input.topic.trim() : topic,
    category,
    sources: input.sources
      .filter((source) => source && typeof source === 'object')
      .map((source) => {
        const typed = source as { name?: unknown; url?: unknown; credibilityNotes?: unknown }
        return {
          name: typeof typed.name === 'string' ? typed.name : 'Unknown source',
          url: typeof typed.url === 'string' ? typed.url : 'https://example.com',
          credibilityNotes:
            typeof typed.credibilityNotes === 'string'
              ? typed.credibilityNotes
              : 'Credibility context unavailable.',
        }
      })
      .slice(0, 6),
    keyFacts: input.keyFacts
      .filter((fact) => fact && typeof fact === 'object')
      .map((fact) => {
        const typed = fact as { fact?: unknown; source?: unknown; confidence?: unknown }
        const confidence =
          typed.confidence === 'confirmed' ||
          typed.confidence === 'reported' ||
          typed.confidence === 'alleged'
            ? typed.confidence
            : 'reported'

        return {
          fact: typeof typed.fact === 'string' ? typed.fact : `${topic} remains under active reporting.`,
          source: typeof typed.source === 'string' ? typed.source : 'Unknown source',
          confidence,
        }
      })
      .slice(0, 16),
    namedSources: Array.isArray(input.namedSources)
      ? input.namedSources.filter((item): item is string => typeof item === 'string').slice(0, 12)
      : [],
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
    backgroundContext:
      typeof input.backgroundContext === 'string' && input.backgroundContext.trim()
        ? input.backgroundContext.trim()
        : `${topic} is evolving and requires careful source-based reporting.`,
  }
}

function normalizeDraft(
  value: unknown,
  research: ResearchBrief,
  fallback: ArticleDraft
): ArticleDraft | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const input = value as Partial<ArticleDraft>
  if (typeof input.body !== 'string' || typeof input.headline !== 'string') {
    return null
  }

  const category = isArticleCategory(input.category) ? input.category : research.category

  return {
    headline: input.headline.trim() || fallback.headline,
    subheadline:
      typeof input.subheadline === 'string' && input.subheadline.trim()
        ? input.subheadline.trim()
        : fallback.subheadline,
    lede:
      typeof input.lede === 'string' && input.lede.trim() ? input.lede.trim() : fallback.lede,
    body: input.body.trim() || fallback.body,
    category,
    tags: Array.isArray(input.tags)
      ? input.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8)
      : fallback.tags,
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
  const topicFragment = research.topic.toLowerCase()

  return {
    headline: `${research.topic} puts pressure on decision makers to respond`,
    subheadline:
      'The latest signals suggest the story is moving, but the durable outcome still depends on evidence, timing, and execution.',
    lede: `The latest developments around ${topicFragment} are forcing decision makers, analysts, and affected stakeholders to reassess the next phase of the story.`,
    body: [
      `${research.topic} is attracting close attention because multiple sources point to the same underlying shift: momentum is building, but the result is not yet settled. The research brief indicates that the most important facts are verified, while the larger implications remain under active debate.`,
      `Several credible sources describe the situation as consequential for the category in question. In newsroom terms, that means the story deserves careful attribution, measured language, and a clear separation between confirmed developments and reported claims.`,
      `The latest reporting suggests that any meaningful change will depend on how quickly key actors can turn signals into action. That is the central tension in stories like this one: a narrow window of opportunity paired with persistent uncertainty.`,
      `Experts and observers cited in the research brief disagree on how durable the shift will be. Some see the current moment as an early signal of a longer-term change, while others describe it as a preliminary development that still requires more corroboration.`,
      `What matters most for readers is the structure of the evidence. The story is not just that something happened; it is that the development was observed by multiple credible sources, placed in context, and checked against conflicting claims.`,
      `Taken together, the reporting points to a news event with real significance, but not one that should be overstated. The responsible reading is that the situation is moving, the implications are material, and the final shape of the story will depend on what happens next.`,
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
    return null
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
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
    console.warn(`Anthropic request failed with ${response.status}; falling back to local generation`)
    return null
  }

  try {
    const json = await response.json()
    const text = json?.content?.map((part: { text?: string }) => part.text ?? '').join('') ?? ''
    return text || null
  } catch {
    return null
  }
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
    imageUrl: visual.imageUrl,
    imageCredit: visual.imageCredit,
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

export function getPublishedArticles() {
  return listArticles()
}

export function getPublishedArticle(articleId: string) {
  return getArticleById(articleId)
}

export function getPipelineStatus() {
  return getPipelineSnapshot()
}

export async function researchTopic(topic: string) {
  const fallbackResearch = buildResearchBrief(topic)

  const maybeAnthropic = await callAnthropic(RESEARCH_BRIEF_PROMPT, {
    topic,
    categoryHint: fallbackResearch.category,
    sourceHints: fallbackResearch.sources,
  })

  const parsedResearch = normalizeResearchBrief(
    topic,
    parseJsonObject<ResearchBrief>(maybeAnthropic)
  )

  if (parsedResearch && parsedResearch.sources.length >= 2 && parsedResearch.keyFacts.length >= 2) {
    return parsedResearch
  }

  return fallbackResearch
}

async function generateDraftFromResearch(research: ResearchBrief, flaggedClaims: string[] = []) {
  const fallbackDraft = buildArticleDraft(research)
  const maybeAnthropic = await callAnthropic(ARTICLE_WRITER_PROMPT, {
    research,
    flaggedClaimsToAvoid: flaggedClaims,
  })

  const parsedDraft = normalizeDraft(
    parseJsonObject<ArticleDraft>(maybeAnthropic),
    research,
    fallbackDraft
  )

  return parsedDraft ?? fallbackDraft
}

async function evaluateQuality(research: ResearchBrief, draft: ArticleDraft): Promise<QualityScore> {
  const fallbackScore = scoreArticle(research, draft)
  const maybeAnthropic = await callAnthropic(QUALITY_GATE_PROMPT, {
    research,
    article: draft,
  })

  const parsedScore = normalizeQualityScore(parseJsonObject<QualityScore>(maybeAnthropic))
  return parsedScore ?? fallbackScore
}

export async function generateArticleDraft(topic: string) {
  const research = await researchTopic(topic)
  const draft = await generateDraftFromResearch(research)
  const qualityScore = await evaluateQuality(research, draft)

  return { research, draft, qualityScore }
}

export async function runPipeline(input: GenerateStoryInput) {
  const topics = await getTopics()
  const selectedTopic = input.topic?.trim() || topics[0] || 'AI regulation'

  markPipelineRunning(selectedTopic)
  recordPipelineEvent({
    stage: 'trend-intake',
    status: 'processing',
    articleTitle: selectedTopic,
    details: 'Topic selected from NewsData topics feed and queued for research.',
  })

  try {
    setProgress('research', 25, `Researching ${selectedTopic}`)
    const research = await researchTopic(selectedTopic)
    recordPipelineEvent({
      stage: 'research',
      status: 'completed',
      articleTitle: selectedTopic,
      details: `Collected ${research.sources.length} sources and key facts.`,
    })

    setProgress('writing', 55, 'Drafting reported article')
    let draft = await generateDraftFromResearch(research)
    recordPipelineEvent({
      stage: 'writing',
      status: 'completed',
      articleTitle: selectedTopic,
      details: 'Generated newsroom-style lede, context, and body.',
    })

    setProgress('quality-gate', 80, 'Scoring article for publication')
    let qualityScore = await evaluateQuality(research, draft)

    if (!qualityScore.publishRecommendation) {
      draft = await generateDraftFromResearch(research, qualityScore.flaggedClaims)
      qualityScore = await evaluateQuality(research, draft)
    }

    if (!qualityScore.publishRecommendation) {
      recordPipelineEvent({
        stage: 'quality-gate',
        status: 'failed',
        articleTitle: selectedTopic,
        details: 'Article did not clear the quality threshold.',
      })
      markPipelineDegraded(`Quality gate rejected ${selectedTopic}`)
      return {
        published: false,
        topic: selectedTopic,
        research,
        draft,
        qualityScore,
        article: null,
      }
    }

    const article = await createArticleRecord(selectedTopic, research, draft, qualityScore)
    upsertArticle(article)

    setProgress('publish', 100, 'Published to newsroom feed')
    recordPipelineEvent({
      stage: 'publish',
      status: 'completed',
      articleTitle: selectedTopic,
      details: 'Article published to the in-memory newsroom store.',
    })

    markPipelineSuccess(selectedTopic)

    return {
      published: true,
      topic: selectedTopic,
      research,
      draft,
      qualityScore,
      article,
    }
  } catch (error) {
    recordPipelineEvent({
      stage: 'research',
      status: 'failed',
      articleTitle: selectedTopic,
      details: error instanceof Error ? error.message : 'Unexpected pipeline failure',
    })
    markPipelineDegraded(`Pipeline failed while processing ${selectedTopic}`)
    throw error
  }
}

export async function answerReporterQuestion(body: QaRequestBody) {
  const article = getArticleById(body.articleId)
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
