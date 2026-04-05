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
  markPipelineRunning,
  markPipelineSuccess,
  recordPipelineEvent,
  setPipelineState,
  upsertArticlePersistent,
} from '@/lib/store'
import {
  ARTICLE_WRITER_PROMPT,
  FACT_CHECK_PROMPT,
  QA_PROMPT,
  RESEARCH_BRIEF_PROMPT,
  TOPIC_SCORING_PROMPT,
} from '@/lib/prompts'
import { getTopicImageHint, getTopics, searchNewsData, type NewsSearchHit } from '@/lib/newsdata'
import { getDailyVirloSnapshot } from '@/lib/virlo'
import { resolveStoryImage } from '@/lib/story-image'

const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514'
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
const AI_PROVIDER = (process.env.AI_PROVIDER ?? '').trim().toLowerCase()

const RAW_TOPIC_LIMIT = 15
const MIN_TOPIC_SCORE = 60
const MAX_RESEARCH_TOPICS = 5
const MIN_KEY_FACTS = 3
const MIN_ARTICLE_WORDS = 650
const STRICT_DEDUPE_SIMILARITY = 0.86
const SUBSTRING_DEDUPE_SIMILARITY = 0.92
const MIN_TOKEN_OVERLAP_COUNT = 3
const FACT_CORROBORATION_OVERLAP = 0.6
const MATERIAL_CONFLICT_OVERLAP = 0.55

const SEED_TOPICS = [
  'AI regulation',
  'climate summit',
  'global markets',
  'tech layoffs',
  'space exploration',
  'cybersecurity breach',
  'election updates',
  'energy transition',
  'healthcare innovation',
  'geopolitical tensions',
]

const BANNED_PHRASES = [
  'the latest signals suggest',
  'experts and observers',
  'the responsible reading',
  'still depends on evidence',
  'under active debate',
  'preliminary development',
  'durable outcome',
  'momentum is building',
  'multiple sources point to',
  'the situation is evolving',
  'remains to be seen',
  'sources indicate',
  'analysts say',
  'observers note',
]

const OVERSTATEMENT_TERMS = ['proven', 'cure', 'definitely', 'always', 'never', 'guaranteed']
const TOKEN_STOPWORDS = new Set([
  'about',
  'after',
  'against',
  'before',
  'between',
  'during',
  'from',
  'into',
  'over',
  'under',
  'with',
  'without',
  'this',
  'that',
  'these',
  'those',
  'their',
  'there',
  'where',
  'which',
  'when',
  'while',
  'today',
  'latest',
  'breaking',
  'report',
  'reported',
  'reporting',
  'news',
  'story',
  'stories',
  'says',
  'said',
  'saying',
  'update',
  'updates',
  'global',
])

const RESOLUTION_HINTS = [
  'resolved',
  'clarified',
  'settled',
  'confirmed by both',
  'joint statement',
  'agreement reached',
  'aligned on',
]

const CONFLICT_TERM_PAIRS: Array<[string, string]> = [
  ['increase', 'decrease'],
  ['up', 'down'],
  ['approved', 'rejected'],
  ['confirmed', 'denied'],
  ['expanding', 'shrinking'],
  ['gain', 'loss'],
  ['surplus', 'deficit'],
]

type SourceTier = 1 | 2 | 3
type Grade = 'A' | 'B' | 'C' | 'D' | 'HOLD'

type ResearchFailure = {
  error: 'insufficient_data'
  reason?: string
}

type TopicScoreCard = {
  topic: string
  freshness: number
  sourceAvailability: number
  publicInterest: number
  verifiability: number
  totalScore: number
  skipReason: string | null
}

type ExtendedResearchSource = {
  name: string
  url: string
  tier: SourceTier
  credibilityNotes: string
}

type ExtendedResearchBrief = Omit<ResearchBrief, 'sources'> & {
  sources: ExtendedResearchSource[]
  whatWeDoNotKnow: string[]
}

type WriterDraft = ArticleDraft & {
  wordCount: number
  whatWeDoNotKnow: string
  whatHappensNext: string
  grade: string
}

type FactCheckResult = {
  pass: boolean
  warnings: string[]
  violations: string[]
  severity?: string
}

type IngestResult = {
  rawTopics: string[]
  source: 'manual' | 'newsdata' | 'virlo' | 'seed'
}

type GradeDecision = {
  grade: Grade
  note?: string
  reason?: string
  tierOneCount: number
  hasCorroboration: boolean
  unresolvedConflicts: boolean
}

type PipelineSummary = {
  topicsIngested: number
  scoredAbove60: number
  researched: number
  gradedABC: number
  published: number
  rejected: number
}

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

function normalizeTopic(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeForCompare(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeForSimilarity(value: string, minLength = 3) {
  return new Set(
    normalizeForCompare(value)
      .split(' ')
      .filter((token) => token.length >= minLength && !TOKEN_STOPWORDS.has(token))
  )
}

function tokenizeTopic(value: string) {
  return tokenizeForSimilarity(value, 4)
}

function setIntersectionCount(left: Set<string>, right: Set<string>) {
  let count = 0
  for (const token of left) {
    if (right.has(token)) {
      count += 1
    }
  }

  return count
}

function overlapCoefficient(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) {
    return 0
  }

  return setIntersectionCount(left, right) / Math.max(1, Math.min(left.size, right.size))
}

function topicSimilarity(left: string, right: string) {
  const leftTokens = tokenizeTopic(left)
  const rightTokens = tokenizeTopic(right)
  return overlapCoefficient(leftTokens, rightTokens)
}

function isSameStory(left: string, right: string) {
  const normalizedLeft = normalizeForCompare(left)
  const normalizedRight = normalizeForCompare(right)

  if (!normalizedLeft || !normalizedRight) {
    return false
  }

  if (normalizedLeft === normalizedRight) {
    return true
  }

  const leftTokens = tokenizeTopic(left)
  const rightTokens = tokenizeTopic(right)
  const overlap = overlapCoefficient(leftTokens, rightTokens)
  const overlapCount = setIntersectionCount(leftTokens, rightTokens)

  if (overlapCount < MIN_TOKEN_OVERLAP_COUNT) {
    return false
  }

  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return overlap >= SUBSTRING_DEDUPE_SIMILARITY
  }

  return overlap >= STRICT_DEDUPE_SIMILARITY
}

function dedupeSimilarTopics(topics: string[]) {
  const deduped: string[] = []

  for (const topic of topics) {
    const normalized = normalizeTopic(topic)
    if (!normalized) {
      continue
    }

    const duplicate = deduped.some((existing) => isSameStory(existing, normalized))
    if (!duplicate) {
      deduped.push(normalized)
    }
  }

  return deduped
}

function isArticleCategory(value: unknown): value is ArticleCategory {
  return value === 'World' || value === 'Tech' || value === 'Business' || value === 'Science'
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
    lower.includes('rate') ||
    lower.includes('earnings')
  ) {
    return 'Business'
  }

  if (
    lower.includes('science') ||
    lower.includes('research') ||
    lower.includes('quantum') ||
    lower.includes('climate') ||
    lower.includes('health')
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

function clampScore(value: unknown, min: number, max: number, fallback = min) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }

  return Math.max(min, Math.min(max, Number(value)))
}

function isSpecificSourceUrl(value: string) {
  try {
    const parsed = new URL(value)
    if (!/^https?:$/.test(parsed.protocol)) {
      return false
    }

    const pathname = parsed.pathname.replace(/\/+$/g, '')
    if (!pathname || pathname === '/') {
      return false
    }

    if (pathname === '/news' || pathname === '/blog') {
      return false
    }

    return pathname.split('/').filter(Boolean).length >= 2
  } catch {
    return false
  }
}

function normalizeSourceTier(value: unknown): SourceTier | null {
  if (value === 1 || value === 2 || value === 3) {
    return value
  }

  if (value === '1' || value === '2' || value === '3') {
    return Number(value) as SourceTier
  }

  return null
}

function inferSourceTier(name: string, url: string): SourceTier {
  const lowerName = name.toLowerCase()
  const lowerUrl = url.toLowerCase()

  if (
    lowerName.includes('reuters') ||
    lowerName.includes('associated press') ||
    lowerName.includes('ap ') ||
    lowerName.includes('afp') ||
    lowerName.includes('government') ||
    lowerUrl.includes('.gov/') ||
    lowerUrl.includes('who.int/')
  ) {
    return 1
  }

  if (
    lowerName.includes('university') ||
    lowerName.includes('hospital') ||
    lowerName.includes('bbc') ||
    lowerName.includes('financial times') ||
    lowerName.includes('bloomberg') ||
    lowerName.includes('wsj') ||
    lowerName.includes('the verge')
  ) {
    return 2
  }

  return 3
}

function isResearchFailure(
  value: ExtendedResearchBrief | ResearchFailure
): value is ResearchFailure {
  return 'error' in value
}

function normalizeTopicScore(topic: string, value: unknown): TopicScoreCard | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const input = value as Partial<TopicScoreCard>

  const freshness = clampScore(input.freshness, 0, 25, 10)
  const sourceAvailability = clampScore(input.sourceAvailability, 0, 25, 10)
  const publicInterest = clampScore(input.publicInterest, 0, 25, 10)
  const verifiability = clampScore(input.verifiability, 0, 25, 10)
  const totalFallback = freshness + sourceAvailability + publicInterest + verifiability
  const totalScore = clampScore(input.totalScore, 0, 100, totalFallback)

  return {
    topic: typeof input.topic === 'string' && input.topic.trim() ? input.topic.trim() : topic,
    freshness,
    sourceAvailability,
    publicInterest,
    verifiability,
    totalScore,
    skipReason:
      typeof input.skipReason === 'string' && input.skipReason.trim()
        ? input.skipReason.trim()
        : totalScore < MIN_TOPIC_SCORE
          ? 'Scored below publication threshold'
          : null,
  }
}

function fallbackTopicScore(topic: string): TopicScoreCard {
  const lower = topic.toLowerCase()

  const freshness =
    /(breaking|today|just in|live|update|urgent)/.test(lower)
      ? 22
      : /(this week|latest|new)/.test(lower)
        ? 17
        : 12

  const sourceAvailability =
    /(market|election|policy|regulation|ceasefire|security|health|company|government)/.test(lower)
      ? 20
      : 14

  const publicInterest =
    /(global|world|market|ai|health|election|climate|security|energy)/.test(lower)
      ? 21
      : 14

  const verifiability =
    /(report|study|data|official|announced|court|ministry|agency|percent|\d)/.test(lower)
      ? 19
      : 13

  const totalScore = freshness + sourceAvailability + publicInterest + verifiability

  return {
    topic,
    freshness,
    sourceAvailability,
    publicInterest,
    verifiability,
    totalScore,
    skipReason: totalScore < MIN_TOPIC_SCORE ? 'Scored below publication threshold' : null,
  }
}

function buildFallbackResearchBrief(
  topic: string,
  searchHits: NewsSearchHit[]
): ExtendedResearchBrief | null {
  const sourceMap = new Map<string, ExtendedResearchSource>()

  for (const hit of searchHits) {
    if (!hit.url || !isSpecificSourceUrl(hit.url)) {
      continue
    }

    const key = `${normalizeForCompare(hit.source)}|${normalizeForCompare(hit.url)}`
    if (sourceMap.has(key)) {
      continue
    }

    sourceMap.set(key, {
      name: hit.source,
      url: hit.url,
      tier: inferSourceTier(hit.source, hit.url),
      credibilityNotes: hit.excerpt || `${hit.source} coverage related to ${topic}`,
    })
  }

  const sources = Array.from(sourceMap.values()).slice(0, 5)
  if (sources.length < MIN_KEY_FACTS) {
    return null
  }

  const seenFacts = new Set<string>()
  const keyFacts = searchHits
    .map((hit) => {
      const factCandidate = hit.excerpt?.trim() || `${hit.source} reported ${hit.title}.`
      return {
        fact: factCandidate,
        source: hit.source,
        confidence: 'reported' as const,
      }
    })
    .filter((fact) => {
      const normalized = normalizeForCompare(fact.fact)
      if (!normalized || seenFacts.has(normalized)) {
        return false
      }

      seenFacts.add(normalized)
      return true
    })
    .slice(0, 8)

  if (keyFacts.length < MIN_KEY_FACTS) {
    return null
  }

  const namedSources = Array.from(
    new Set([...sources.map((source) => source.name), ...keyFacts.map((fact) => fact.source)])
  ).slice(0, 12)

  const timeline = searchHits.slice(0, 5).map((hit) => ({
    date: hit.publishedAt,
    event: `${hit.source} reported ${hit.title}`,
  }))

  const backgroundContext = Array.from(
    new Set(searchHits.map((hit) => hit.excerpt).filter((excerpt): excerpt is string => Boolean(excerpt)))
  )
    .slice(0, 3)
    .join(' ')

  return {
    topic,
    category: pickCategory(topic),
    sources,
    keyFacts,
    namedSources,
    timeline,
    conflictingClaims: [],
    backgroundContext: backgroundContext || `${topic} remains a developing story with active reporting.`,
    whatWeDoNotKnow: [
      'Officials have not released a complete timeline for all key decisions.',
      'Additional independent corroboration may clarify disputed details in upcoming coverage.',
    ],
  }
}

function normalizeResearchBrief(
  topic: string,
  value: unknown,
  searchHits: NewsSearchHit[]
): ExtendedResearchBrief | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const input = value as Partial<ExtendedResearchBrief>
  if (!Array.isArray(input.sources) || !Array.isArray(input.keyFacts)) {
    return null
  }

  const category = isArticleCategory(input.category) ? input.category : pickCategory(topic)

  const sources = input.sources
    .filter((source) => source && typeof source === 'object')
    .map((source) => {
      const typed = source as {
        name?: unknown
        url?: unknown
        tier?: unknown
        credibilityNotes?: unknown
      }

      const name = typeof typed.name === 'string' ? typed.name.trim() : ''
      const url = typeof typed.url === 'string' ? typed.url.trim() : ''

      if (!name || !url || !isSpecificSourceUrl(url)) {
        return null
      }

      const tier = normalizeSourceTier(typed.tier) ?? inferSourceTier(name, url)

      return {
        name,
        url,
        tier,
        credibilityNotes:
          typeof typed.credibilityNotes === 'string' && typed.credibilityNotes.trim()
            ? typed.credibilityNotes.trim()
            : `${name} coverage related to ${topic}`,
      }
    })
    .filter((source): source is ExtendedResearchSource => Boolean(source))
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
    .filter((fact): fact is ExtendedResearchBrief['keyFacts'][number] => Boolean(fact))
    .slice(0, 16)

  const namedSources = Array.isArray(input.namedSources)
    ? input.namedSources
        .filter((source): source is string => typeof source === 'string' && Boolean(source.trim()))
        .map((source) => source.trim())
        .slice(0, 12)
    : []

  const timeline = Array.isArray(input.timeline)
    ? input.timeline
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => {
          const typed = entry as { date?: unknown; event?: unknown }
          return {
            date: typeof typed.date === 'string' ? typed.date : 'Unknown date',
            event:
              typeof typed.event === 'string' && typed.event.trim()
                ? typed.event
                : 'Timeline event unavailable.',
          }
        })
        .slice(0, 10)
    : []

  const conflictingClaims = Array.isArray(input.conflictingClaims)
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
            claim: typeof typed.claim === 'string' ? typed.claim.trim() : '',
            source: typeof typed.source === 'string' ? typed.source.trim() : '',
            counterclaim: typeof typed.counterclaim === 'string' ? typed.counterclaim.trim() : '',
            counterSource:
              typeof typed.counterSource === 'string' ? typed.counterSource.trim() : '',
          }
        })
        .filter((claim) => claim.claim && claim.counterclaim)
        .slice(0, 10)
    : []

  const backgroundContext =
    typeof input.backgroundContext === 'string' && input.backgroundContext.trim()
      ? input.backgroundContext.trim()
      : ''

  const whatWeDoNotKnow = Array.isArray(input.whatWeDoNotKnow)
    ? input.whatWeDoNotKnow
        .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
        .map((entry) => entry.trim())
        .slice(0, 8)
    : []

  if (sources.length < MIN_KEY_FACTS || keyFacts.length < MIN_KEY_FACTS || !backgroundContext) {
    return null
  }

  const namedSourcesFallback = Array.from(new Set(sources.map((source) => source.name))).slice(0, 12)

  const normalized: ExtendedResearchBrief = {
    topic: typeof input.topic === 'string' && input.topic.trim() ? input.topic.trim() : topic,
    category,
    sources,
    keyFacts,
    namedSources: namedSources.length > 0 ? namedSources : namedSourcesFallback,
    timeline,
    conflictingClaims,
    backgroundContext,
    whatWeDoNotKnow,
  }

  if (normalized.namedSources.length < MIN_KEY_FACTS) {
    const fallback = buildFallbackResearchBrief(topic, searchHits)
    return fallback
  }

  if (normalized.whatWeDoNotKnow.length === 0) {
    normalized.whatWeDoNotKnow = [
      'Officials have not released full details on unresolved questions.',
      'Further reporting is required to confirm all downstream implications.',
    ]
  }

  return normalized
}

function toPublicResearchBrief(research: ExtendedResearchBrief): ResearchBrief {
  return {
    topic: research.topic,
    category: research.category,
    sources: research.sources.map((source) => ({
      name: source.name,
      url: source.url,
      credibilityNotes: source.credibilityNotes,
    })),
    keyFacts: research.keyFacts,
    namedSources: research.namedSources,
    timeline: research.timeline,
    conflictingClaims: research.conflictingClaims,
    backgroundContext: research.backgroundContext,
  }
}

function normalizeWriterDraft(
  value: unknown,
  research: ExtendedResearchBrief,
  grade: Grade
): WriterDraft | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const input = value as Partial<WriterDraft>

  if (
    typeof input.headline !== 'string' ||
    typeof input.subheadline !== 'string' ||
    typeof input.body !== 'string'
  ) {
    return null
  }

  const body = input.body.trim()
  if (!body) {
    return null
  }

  const category = isArticleCategory(input.category) ? input.category : research.category
  const wordCount =
    typeof input.wordCount === 'number' && Number.isFinite(input.wordCount)
      ? Math.round(input.wordCount)
      : countWords(body)

  return {
    headline: input.headline.trim(),
    subheadline: input.subheadline.trim(),
    lede:
      typeof input.lede === 'string' && input.lede.trim()
        ? input.lede.trim()
        : body.split(/\n+/)[0]?.trim() || '',
    body,
    category,
    tags: Array.isArray(input.tags)
      ? input.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8)
      : [],
    wordCount,
    whatWeDoNotKnow:
      typeof input.whatWeDoNotKnow === 'string' && input.whatWeDoNotKnow.trim()
        ? input.whatWeDoNotKnow.trim()
        : research.whatWeDoNotKnow.join(' '),
    whatHappensNext:
      typeof input.whatHappensNext === 'string' && input.whatHappensNext.trim()
        ? input.whatHappensNext.trim()
        : '',
    grade:
      typeof input.grade === 'string' && input.grade.trim() ? input.grade.trim() : grade,
  }
}

function findBannedPhrases(value: string) {
  const lower = value.toLowerCase()
  return BANNED_PHRASES.filter((phrase) => lower.includes(phrase))
}

function usesBulletPoints(value: string) {
  return /(^|\n)\s*[-*]\s+/.test(value)
}

function hasCorroboration(research: ExtendedResearchBrief) {
  for (let i = 0; i < research.keyFacts.length; i += 1) {
    const left = research.keyFacts[i]
    const leftSource = normalizeForCompare(left.source)
    const leftTokens = tokenizeForSimilarity(left.fact, 3)

    if (leftTokens.size < MIN_TOKEN_OVERLAP_COUNT) {
      continue
    }

    for (let j = i + 1; j < research.keyFacts.length; j += 1) {
      const right = research.keyFacts[j]
      const rightSource = normalizeForCompare(right.source)

      if (!leftSource || !rightSource || leftSource === rightSource) {
        continue
      }

      const rightTokens = tokenizeForSimilarity(right.fact, 3)
      const overlap = overlapCoefficient(leftTokens, rightTokens)
      const overlapCount = setIntersectionCount(leftTokens, rightTokens)

      if (overlap >= FACT_CORROBORATION_OVERLAP && overlapCount >= MIN_TOKEN_OVERLAP_COUNT) {
        return true
      }
    }
  }

  return false
}

function extractNumericTokens(value: string) {
  const matches = value.match(/\b\d[\d,.-]*\b/g) ?? []
  return new Set(matches.map((token) => token.replace(/,/g, '')))
}

function hasDirectionalConflict(left: string, right: string) {
  const lowerLeft = left.toLowerCase()
  const lowerRight = right.toLowerCase()

  return CONFLICT_TERM_PAIRS.some(([a, b]) =>
    (lowerLeft.includes(a) && lowerRight.includes(b)) ||
    (lowerLeft.includes(b) && lowerRight.includes(a))
  )
}

function hasNegationConflict(left: string, right: string) {
  const negationPattern = /\b(no|not|never|denied?|reject(?:ed|s|ion)?|false)\b/i
  const leftHasNegation = negationPattern.test(left)
  const rightHasNegation = negationPattern.test(right)

  if (leftHasNegation === rightHasNegation) {
    return false
  }

  const overlap = overlapCoefficient(tokenizeForSimilarity(left, 3), tokenizeForSimilarity(right, 3))
  return overlap >= MATERIAL_CONFLICT_OVERLAP
}

function isMaterialConflict(claim: string, counterclaim: string) {
  const claimTokens = tokenizeForSimilarity(claim, 3)
  const counterTokens = tokenizeForSimilarity(counterclaim, 3)
  const overlap = overlapCoefficient(claimTokens, counterTokens)

  if (overlap < MATERIAL_CONFLICT_OVERLAP) {
    return false
  }

  const claimNumbers = extractNumericTokens(claim)
  const counterNumbers = extractNumericTokens(counterclaim)
  const sharedNumbers = setIntersectionCount(claimNumbers, counterNumbers)

  if (claimNumbers.size > 0 && counterNumbers.size > 0 && sharedNumbers === 0) {
    return true
  }

  if (hasDirectionalConflict(claim, counterclaim)) {
    return true
  }

  return hasNegationConflict(claim, counterclaim)
}

function hasUnresolvedConflicts(research: ExtendedResearchBrief) {
  return research.conflictingClaims.some((entry) => {
    const claim = entry.claim?.trim()
    const counterclaim = entry.counterclaim?.trim()

    if (!claim || !counterclaim) {
      return false
    }

    const combined = `${claim} ${counterclaim}`.toLowerCase()
    const hasResolutionHint = RESOLUTION_HINTS.some((hint) => combined.includes(hint))
    if (hasResolutionHint) {
      return false
    }

    return isMaterialConflict(claim, counterclaim)
  })
}

function assignResearchGrade(research: ExtendedResearchBrief): GradeDecision {
  if (research.keyFacts.length < MIN_KEY_FACTS) {
    return {
      grade: 'D',
      reason: 'No claims of substance (fewer than 3 key facts)',
      tierOneCount: 0,
      hasCorroboration: false,
      unresolvedConflicts: false,
    }
  }

  const tierOneCount = research.sources.filter((source) => source.tier === 1).length
  const corroborated = hasCorroboration(research)
  const unresolvedConflicts = hasUnresolvedConflicts(research)

  if (unresolvedConflicts) {
    return {
      grade: 'HOLD',
      reason: 'Conflicting claims remain unresolved',
      tierOneCount,
      hasCorroboration: corroborated,
      unresolvedConflicts,
    }
  }

  if (tierOneCount > 0 && corroborated) {
    return {
      grade: 'A',
      tierOneCount,
      hasCorroboration: true,
      unresolvedConflicts,
    }
  }

  if (tierOneCount > 0) {
    return {
      grade: 'B',
      note: 'Based on single primary source',
      tierOneCount,
      hasCorroboration: false,
      unresolvedConflicts,
    }
  }

  return {
    grade: 'C',
    note: 'DEVELOPING STORY',
    tierOneCount,
    hasCorroboration: false,
    unresolvedConflicts,
  }
}

function getGradeBadge(grade: Grade) {
  if (grade === 'A') {
    return 'Grade A · Verified & Corroborated'
  }

  if (grade === 'B') {
    return 'Grade B · Primary Source'
  }

  return 'Grade C · Developing Story'
}

function buildSources(research: ExtendedResearchBrief): ArticleSource[] {
  return research.sources.map((source) => {
    const reliability = source.tier === 1 ? 'high' : source.tier === 2 ? 'medium' : 'low'
    return {
      id: randomUUID(),
      name: source.name,
      url: source.url,
      reliability,
      excerpt: source.credibilityNotes,
      publishedAt: 'Today',
    }
  })
}

function buildQualityScore(
  research: ExtendedResearchBrief,
  draft: WriterDraft,
  topicScore: TopicScoreCard,
  grade: Grade,
  factCheck: FactCheckResult
): QualityScore {
  const sourceDiversity = Number(Math.min(10, Math.max(4, research.sources.length * 1.8)).toFixed(1))
  const sensationalism = factCheck.violations.length > 0 ? 4 : factCheck.warnings.length > 0 ? 8 : 9.5
  const factualConfidence = grade === 'A' ? 9.5 : grade === 'B' ? 8.2 : 7.2
  const ledeStrength = countWords(draft.lede) >= 18 ? 8.8 : 7.4
  const topicalStrength = Number((topicScore.totalScore / 10).toFixed(1))
  const overallScore = Number(
    (
      (sourceDiversity + sensationalism + factualConfidence + ledeStrength + topicalStrength) /
      5
    ).toFixed(1)
  )

  return {
    sourceDiversity,
    sensationalism,
    factualConfidence,
    ledeStrength,
    overallScore,
    flaggedClaims: factCheck.violations.slice(0, 20),
    publishRecommendation: factCheck.pass && overallScore >= 7,
  }
}

async function callAnthropic(system: string, payload: object) {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
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
        max_tokens: 2600,
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
      console.warn(`[callAnthropic] failed with status ${response.status}`)
      return null
    }

    const json = await response.json()
    const text = json?.content?.map((part: { text?: string }) => part.text ?? '').join('') ?? ''
    return text || null
  } catch (error) {
    console.error('[callAnthropic] error:', error instanceof Error ? error.message : error)
    return null
  }
}

async function callGroq(system: string, payload: object) {
  const apiKey = process.env.GROQ_API_KEY ?? ''
  if (!apiKey) {
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
        temperature: 0.15,
        max_tokens: 2600,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    })

    if (!response.ok) {
      console.warn(`[callGroq] failed with status ${response.status}`)
      return null
    }

    const json = await response.json()
    const text = json?.choices?.[0]?.message?.content
    return typeof text === 'string' && text.trim() ? text : null
  } catch (error) {
    console.error('[callGroq] error:', error instanceof Error ? error.message : error)
    return null
  }
}

async function callModel(system: string, payload: object) {
  if (AI_PROVIDER === 'anthropic') {
    return callAnthropic(system, payload)
  }

  if (AI_PROVIDER === 'groq') {
    return callGroq(system, payload)
  }

  return (await callGroq(system, payload)) ?? callAnthropic(system, payload)
}

function setProgress(
  stage: PipelineEvent['stage'],
  progress: number,
  message: string,
  activeTopic?: string | null
) {
  const snapshot = getPipelineSnapshot()
  setPipelineState({
    status: 'running',
    stage,
    progress,
    message,
    activeTopic: activeTopic ?? snapshot.activeTopic,
  })
}

function logPipelineEvent(
  stage: PipelineEvent['stage'],
  status: PipelineEvent['status'],
  articleTitle: string,
  details: string,
  progress?: number
) {
  recordPipelineEvent({
    stage,
    status,
    articleTitle,
    details,
  })

  if (typeof progress === 'number') {
    setProgress(stage, progress, details, articleTitle)
  }
}

async function ingestTopics(topicOverride?: string): Promise<IngestResult> {
  if (topicOverride?.trim()) {
    return {
      rawTopics: dedupeSimilarTopics([topicOverride.trim()]).slice(0, RAW_TOPIC_LIMIT),
      source: 'manual',
    }
  }

  const virloSnapshot = await getDailyVirloSnapshot()

  if (virloSnapshot.calledApi) {
    logPipelineEvent(
      'trend-intake',
      virloSnapshot.success ? 'completed' : 'failed',
      'Trend intake',
      virloSnapshot.success
        ? 'Fetching daily trends from Virlo...'
        : `Virlo daily fetch failed: ${virloSnapshot.error ?? 'unknown error'}`,
      8
    )
  } else if (virloSnapshot.fromCache) {
    logPipelineEvent(
      'trend-intake',
      'completed',
      'Trend intake',
      'Using cached Virlo daily snapshot...',
      8
    )
  }

  logPipelineEvent('trend-intake', 'processing', 'Trend intake', 'Fetching topics from NewsData...', 12)
  const newsTopics = await getTopics()

  let selected = newsTopics
  let source: IngestResult['source'] = 'newsdata'

  if (selected.length === 0 && virloSnapshot.topics.length > 0) {
    selected = virloSnapshot.topics
    source = 'virlo'
  }

  if (selected.length === 0) {
    selected = SEED_TOPICS
    source = 'seed'
  }

  const rawTopics = dedupeSimilarTopics(selected).slice(0, RAW_TOPIC_LIMIT)
  return {
    rawTopics,
    source,
  }
}

async function scoreTopic(topic: string): Promise<TopicScoreCard> {
  const modelOutput = await callModel(TOPIC_SCORING_PROMPT, { topic })
  const parsed = normalizeTopicScore(topic, parseJsonObject<TopicScoreCard>(modelOutput))
  return parsed ?? fallbackTopicScore(topic)
}

async function scoreTopics(rawTopics: string[]) {
  logPipelineEvent(
    'trend-intake',
    'processing',
    'Topic scoring',
    `Scoring ${rawTopics.length} topics...`,
    20
  )

  const scores: TopicScoreCard[] = []

  for (const topic of rawTopics) {
    const score = await scoreTopic(topic)
    scores.push(score)

    const details =
      score.totalScore >= MIN_TOPIC_SCORE
        ? `Topic '${topic}' scored ${score.totalScore}/100 -> researching`
        : `Topic '${topic}' scored ${score.totalScore}/100 -> skipped`

    logPipelineEvent(
      'trend-intake',
      score.totalScore >= MIN_TOPIC_SCORE ? 'completed' : 'failed',
      topic,
      details
    )
    console.log(`Topic ${topic} scored ${score.totalScore}/100`)
  }

  return scores.sort((left, right) => right.totalScore - left.totalScore)
}

async function researchTopicInternal(
  topic: string
): Promise<ExtendedResearchBrief | ResearchFailure> {
  const searchHits = await searchNewsData(topic)
  if (searchHits.length < MIN_KEY_FACTS) {
    return {
      error: 'insufficient_data',
      reason: 'NewsData returned fewer than 3 candidate sources',
    }
  }

  const modelOutput = await callModel(RESEARCH_BRIEF_PROMPT, {
    topic,
    searchResults: searchHits,
  })

  const parsed = parseJsonObject<ExtendedResearchBrief | ResearchFailure>(modelOutput)
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    return {
      error: 'insufficient_data',
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'Research model reported insufficient data',
    }
  }

  const normalized = normalizeResearchBrief(topic, parsed, searchHits)
  const research = normalized ?? buildFallbackResearchBrief(topic, searchHits)

  if (!research || research.keyFacts.length < MIN_KEY_FACTS) {
    return {
      error: 'insufficient_data',
      reason: 'Unable to produce 3 verifiable facts from NewsData results',
    }
  }

  return research
}

function normalizeFactCheckResult(value: unknown): FactCheckResult | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const input = value as {
    pass?: unknown
    warnings?: unknown
    violations?: unknown
    severity?: unknown
  }

  if (typeof input.pass !== 'boolean') {
    return null
  }

  const warnings = Array.isArray(input.warnings)
    ? input.warnings.filter((warning): warning is string => typeof warning === 'string').slice(0, 20)
    : []

  const violations = Array.isArray(input.violations)
    ? input.violations
        .filter((violation): violation is string => typeof violation === 'string')
        .slice(0, 20)
    : []

  return {
    pass: input.pass,
    warnings,
    violations,
    severity: typeof input.severity === 'string' ? input.severity : undefined,
  }
}

function runLocalFactCheck(draft: WriterDraft): FactCheckResult {
  const violations: string[] = []
  const warnings: string[] = []

  const text = `${draft.headline}\n${draft.subheadline}\n${draft.lede}\n${draft.body}`
  const bannedMatches = findBannedPhrases(text)
  if (bannedMatches.length > 0) {
    violations.push(`Banned phrases present: ${bannedMatches.join(', ')}`)
  }

  const overstatementPattern = new RegExp(`\\b(${OVERSTATEMENT_TERMS.join('|')})\\b`, 'i')
  if (overstatementPattern.test(text)) {
    violations.push('Overstatement language detected')
  }

  const numericSentences = text.match(/[^.\n]*\b\d[\d,.-]*\b[^.\n]*/g) ?? []
  const missingNumericCitations = numericSentences.filter(
    (sentence) => !sentence.includes('[') || !sentence.includes(']')
  )
  if (missingNumericCitations.length > 0) {
    violations.push('Numeric claim found without inline citation')
  }

  if (usesBulletPoints(draft.body)) {
    warnings.push('Article body includes bullet formatting instead of full prose')
  }

  if (draft.wordCount < MIN_ARTICLE_WORDS) {
    violations.push(`Article below minimum length (${draft.wordCount}/${MIN_ARTICLE_WORDS} words)`)
  }

  if (/\b(health|medical|scientific|clinical|study|vaccine|disease|trial|research)\b/i.test(text)) {
    if (!/\[[^\]]+\]/.test(text)) {
      violations.push('Health or scientific claim without named inline source')
    }
  }

  if (violations.length > 0) {
    return {
      pass: false,
      warnings,
      violations,
      severity: 'critical',
    }
  }

  return {
    pass: true,
    warnings,
    violations: [],
  }
}

async function runFactCheck(
  draft: WriterDraft,
  research: ExtendedResearchBrief
): Promise<FactCheckResult> {
  const modelOutput = await callModel(FACT_CHECK_PROMPT, {
    article: draft,
    research,
  })

  const modelResult = normalizeFactCheckResult(parseJsonObject<FactCheckResult>(modelOutput))
  const localResult = runLocalFactCheck(draft)

  if (!localResult.pass) {
    return localResult
  }

  if (!modelResult) {
    return localResult
  }

  if (!modelResult.pass) {
    return {
      ...modelResult,
      warnings: modelResult.warnings ?? [],
      violations: modelResult.violations ?? [],
    }
  }

  return {
    pass: true,
    warnings: Array.from(new Set([...(modelResult.warnings ?? []), ...localResult.warnings])),
    violations: [],
    severity: modelResult.severity,
  }
}

async function writeArticleFromResearch(
  research: ExtendedResearchBrief,
  gradeDecision: GradeDecision,
  topicScore: TopicScoreCard,
  attempt = 0,
  rewriteNotes: string[] = []
): Promise<WriterDraft | null> {
  const modelOutput = await callModel(ARTICLE_WRITER_PROMPT, {
    topic: research.topic,
    grade: gradeDecision.grade,
    gradeNote: gradeDecision.note ?? null,
    topicScore,
    research,
    rewriteNotes,
  })

  const parsed = normalizeWriterDraft(
    parseJsonObject<WriterDraft>(modelOutput),
    research,
    gradeDecision.grade
  )

  if (!parsed) {
    return null
  }

  const failedChecks: string[] = []

  if (parsed.wordCount < MIN_ARTICLE_WORDS) {
    failedChecks.push(`Minimum ${MIN_ARTICLE_WORDS} words required`)
  }

  if (usesBulletPoints(parsed.body)) {
    failedChecks.push('Article must be prose only with no bullet points')
  }

  const bannedPhraseMatches = findBannedPhrases(
    `${parsed.headline}\n${parsed.subheadline}\n${parsed.lede}\n${parsed.body}`
  )
  if (bannedPhraseMatches.length > 0) {
    failedChecks.push(`Banned phrases detected: ${bannedPhraseMatches.join(', ')}`)
  }

  if (!/\[[^\]]+\]/.test(parsed.body)) {
    failedChecks.push('Inline source citations [Source Name] are required')
  }

  if (failedChecks.length > 0) {
    if (attempt >= 1) {
      return null
    }

    return writeArticleFromResearch(
      research,
      gradeDecision,
      topicScore,
      attempt + 1,
      [...rewriteNotes, ...failedChecks]
    )
  }

  return parsed
}

async function createArticleRecord(
  topic: string,
  research: ExtendedResearchBrief,
  draft: WriterDraft,
  qualityScore: QualityScore,
  grade: Grade,
  pipelineRunId: string,
  factCheckWarnings: string[]
): Promise<PublishedArticle> {
  const body = draft.body.trim()
  const hintedImageUrl = await getTopicImageHint(topic)
  const visual = await resolveStoryImage(topic, draft.category, hintedImageUrl)

  const article = {
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
    qualityScore,
    verificationStatus: grade === 'A' ? 'verified' : 'pending',
    grade,
    gradeBadge: getGradeBadge(grade),
    wordCount: draft.wordCount,
    whatWeDoNotKnow: draft.whatWeDoNotKnow,
    whatHappensNext: draft.whatHappensNext,
    pipelineRunId,
    factCheckWarnings,
    qualityScoreValue: qualityScore.overallScore,
  } as PublishedArticle

  return article
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

export async function getTrendDigest() {
  const virloSnapshot = await getDailyVirloSnapshot()
  if (virloSnapshot.topics.length > 0) {
    return virloSnapshot.topics
  }

  const newsTopics = await getTopics()
  if (newsTopics.length > 0) {
    return newsTopics
  }

  return [...SEED_TOPICS]
}

export async function getPublishedArticles() {
  const articles = await listArticlesPersistent()
  maybeTriggerAutonomousRun(articles.length)
  return articles
}

export async function getPublishedArticle(articleId: string) {
  return getArticleByIdPersistent(articleId)
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

export async function researchTopic(
  topic: string
): Promise<ResearchBrief | { error: 'insufficient_data'; reason?: string }> {
  const research = await researchTopicInternal(topic)
  if (isResearchFailure(research)) {
    return research
  }

  return toPublicResearchBrief(research)
}

export async function generateArticleDraft(topic: string) {
  const research = await researchTopicInternal(topic)
  if (isResearchFailure(research)) {
    return { research, draft: null, qualityScore: null }
  }

  const gradeDecision = assignResearchGrade(research)
  if (!['A', 'B', 'C'].includes(gradeDecision.grade)) {
    return {
      research: toPublicResearchBrief(research),
      draft: null,
      qualityScore: null,
    }
  }

  const topicScore = await scoreTopic(topic)
  const draft = await writeArticleFromResearch(research, gradeDecision, topicScore)
  if (!draft) {
    return {
      research: toPublicResearchBrief(research),
      draft: null,
      qualityScore: null,
    }
  }

  const factCheck = await runFactCheck(draft, research)
  if (!factCheck.pass) {
    return {
      research: toPublicResearchBrief(research),
      draft: null,
      qualityScore: null,
    }
  }

  const qualityScore = buildQualityScore(research, draft, topicScore, gradeDecision.grade, factCheck)

  return {
    research: toPublicResearchBrief(research),
    draft,
    qualityScore,
  }
}

export async function runPipeline(input: GenerateStoryInput) {
  const topicOverride = input.topic?.trim()
  const summary: PipelineSummary = {
    topicsIngested: 0,
    scoredAbove60: 0,
    researched: 0,
    gradedABC: 0,
    published: 0,
    rejected: 0,
  }

  const pipelineRunId = randomUUID()
  const initialTopic = topicOverride || 'Daily trend intake'
  markPipelineRunning(initialTopic)

  const ingested = await ingestTopics(topicOverride)
  const rawTopics = dedupeSimilarTopics(ingested.rawTopics).slice(0, RAW_TOPIC_LIMIT)
  summary.topicsIngested = rawTopics.length

  if (rawTopics.length === 0) {
    throw new Error('No topic available. Provide a topic or configure at least one source.')
  }

  let selectedTopic = rawTopics[0]
  let selectedResearch: ResearchBrief | ResearchFailure = {
    error: 'insufficient_data',
    reason: 'No topic could be published',
  }
  let selectedDraft: ArticleDraft | null = null
  let selectedQualityScore: QualityScore | null = null
  let selectedArticle: PublishedArticle | null = null

  try {
    const topicScores = await scoreTopics(rawTopics)
    const shortlisted = topicScores
      .filter((score) => score.totalScore >= MIN_TOPIC_SCORE)
      .sort((left, right) => right.totalScore - left.totalScore)
      .slice(0, MAX_RESEARCH_TOPICS)

    summary.scoredAbove60 = topicScores.filter((score) => score.totalScore >= MIN_TOPIC_SCORE).length
    summary.rejected += topicScores.filter((score) => score.totalScore < MIN_TOPIC_SCORE).length

    if (shortlisted.length === 0) {
      const message = 'No topics met the minimum scoring threshold of 60/100'
      logPipelineEvent('quality-gate', 'failed', 'Topic scoring', message, 35)
      markPipelineDegraded(message)

      const summaryMessage = `Pipeline complete: ${summary.topicsIngested} topics ingested, ${summary.scoredAbove60} scored above 60, ${summary.researched} researched, ${summary.gradedABC} graded A/B/C, ${summary.published} published, ${summary.rejected} rejected`

      recordPipelineEvent({
        stage: 'publish',
        status: 'failed',
        articleTitle: 'Pipeline summary',
        details: summaryMessage,
      })

      return {
        published: false,
        topic: selectedTopic,
        research: selectedResearch,
        draft: null,
        qualityScore: null,
        article: null,
        pipelineRunId,
        summary,
      }
    }

    for (const score of shortlisted) {
      selectedTopic = score.topic

      logPipelineEvent('research', 'processing', score.topic, `Researching: ${score.topic}...`, 45)
      const research = await researchTopicInternal(score.topic)
      if (isResearchFailure(research)) {
        summary.rejected += 1
        const reason = research.reason || 'insufficient_data'
        logPipelineEvent(
          'research',
          'failed',
          score.topic,
          `Rejected: ${score.topic} · Reason: ${reason}`
        )
        continue
      }

      summary.researched += 1
      selectedResearch = toPublicResearchBrief(research)

      const gradeDecision = assignResearchGrade(research)
      console.log(`Article grade: ${gradeDecision.grade} for ${score.topic}`)

      if (['A', 'B', 'C'].includes(gradeDecision.grade)) {
        summary.gradedABC += 1
      }

      logPipelineEvent(
        'quality-gate',
        ['A', 'B', 'C'].includes(gradeDecision.grade) ? 'completed' : 'failed',
        score.topic,
        `Grade ${gradeDecision.grade} assigned to ${score.topic}`,
        58
      )

      if (!['A', 'B', 'C'].includes(gradeDecision.grade)) {
        summary.rejected += 1
        const reason = gradeDecision.reason || `Grade ${gradeDecision.grade} is not publishable`
        logPipelineEvent(
          'quality-gate',
          'failed',
          score.topic,
          `Rejected: ${score.topic} · Reason: ${reason}`
        )
        continue
      }

      const draft = await writeArticleFromResearch(research, gradeDecision, score)
      if (!draft) {
        summary.rejected += 1
        logPipelineEvent(
          'writing',
          'failed',
          score.topic,
          `Rejected: ${score.topic} · Reason: Writer failed hard constraints`,
          68
        )
        continue
      }

      selectedDraft = draft
      logPipelineEvent('writing', 'processing', draft.headline, `Writing article: ${draft.headline}...`, 72)

      logPipelineEvent(
        'quality-gate',
        'processing',
        draft.headline,
        `Fact-checking: ${draft.headline}...`,
        84
      )

      let factCheck = await runFactCheck(draft, research)
      let finalDraft = draft

      if (!factCheck.pass) {
        const rewrite = await writeArticleFromResearch(
          research,
          gradeDecision,
          score,
          0,
          factCheck.violations
        )

        if (!rewrite) {
          summary.rejected += 1
          logPipelineEvent(
            'quality-gate',
            'failed',
            score.topic,
            `Rejected: ${score.topic} · Reason: Fact-check failed and rewrite was invalid`
          )
          continue
        }

        finalDraft = rewrite
        selectedDraft = finalDraft
        factCheck = await runFactCheck(finalDraft, research)

        if (!factCheck.pass) {
          summary.rejected += 1
          const reason = factCheck.violations.join('; ') || 'Critical fact-check failure'
          logPipelineEvent(
            'quality-gate',
            'failed',
            score.topic,
            `Rejected: ${score.topic} · Reason: ${reason}`
          )
          continue
        }
      }

      const qualityScore = buildQualityScore(
        research,
        finalDraft,
        score,
        gradeDecision.grade,
        factCheck
      )

      const article = await createArticleRecord(
        score.topic,
        research,
        finalDraft,
        qualityScore,
        gradeDecision.grade,
        pipelineRunId,
        factCheck.warnings
      )

      await upsertArticlePersistent(article)

      selectedQualityScore = qualityScore
      selectedArticle = article
      selectedResearch = toPublicResearchBrief(research)
      selectedTopic = score.topic
      summary.published += 1

      logPipelineEvent(
        'publish',
        'completed',
        article.headline,
        `Published: ${article.headline} · ${finalDraft.wordCount} words · Grade ${gradeDecision.grade}`,
        100
      )

      break
    }

    const summaryMessage = `Pipeline complete: ${summary.topicsIngested} topics ingested, ${summary.scoredAbove60} scored above 60, ${summary.researched} researched, ${summary.gradedABC} graded A/B/C, ${summary.published} published, ${summary.rejected} rejected`

    recordPipelineEvent({
      stage: 'publish',
      status: selectedArticle ? 'completed' : 'failed',
      articleTitle: 'Pipeline summary',
      details: summaryMessage,
    })

    if (selectedArticle) {
      markPipelineSuccess(selectedTopic)
    } else {
      markPipelineDegraded(summaryMessage)
    }

    return {
      published: Boolean(selectedArticle),
      topic: selectedTopic,
      research: selectedResearch,
      draft: selectedDraft,
      qualityScore: selectedQualityScore,
      article: selectedArticle,
      pipelineRunId,
      summary,
    }
  } catch (error) {
    recordPipelineEvent({
      stage: 'publish',
      status: 'failed',
      articleTitle: selectedTopic,
      details: error instanceof Error ? error.message : 'Unexpected pipeline failure',
    })
    markPipelineDegraded(`Pipeline failed while processing ${selectedTopic}`)
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
  const answer = `Based on the published reporting, the strongest current answer is grounded in ${sourceNames}. The article focuses on attributed facts, flags what remains uncertain, and avoids claims that cannot be verified from named sources.`

  return {
    question,
    answer,
    sources: article.sources,
    articleId: article.id,
    systemPrompt: QA_PROMPT,
  }
}
