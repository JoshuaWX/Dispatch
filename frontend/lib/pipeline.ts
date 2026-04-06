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
  QUALITY_GATE_PROMPT,
  QA_PROMPT,
  RESEARCH_BRIEF_PROMPT,
  TOPIC_SCORING_PROMPT,
} from '@/lib/prompts'
import {
  getNewsApiTopicImageHint,
  getNewsApiTopics,
  searchNewsApi,
  type NewsSearchHit,
} from '@/lib/newsapi'
import { getGNewsTopics } from '@/lib/gnews'
import { searchTheNewsApi } from '@/lib/thenewsapi'
import { getDailyVirloSnapshot } from '@/lib/virlo'
import { resolveStoryImage } from '@/lib/story-image'

const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514'
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? 'google/gemma-3-27b-it:free'
const AI_PROVIDER = (process.env.AI_PROVIDER ?? '').trim().toLowerCase()
const GROQ_RATE_LIMIT_COOLDOWN_MS = 30_000

const RAW_TOPIC_LIMIT = 15
const SCHEDULED_RAW_TOPIC_LIMIT = 4
const MIN_TOPIC_SCORE = 60
const MAX_RESEARCH_TOPICS = 5
const SCHEDULED_MAX_RESEARCH_TOPICS = 4
const SCHEDULED_SEED_FALLBACK_TOPICS = 2
const MAX_RESEARCH_QUERY_VARIANTS = 4
const MIN_KEY_FACTS = 2
const MIN_RESEARCH_KEY_FACTS = 2
const MIN_GRADE_CLAIMS = 2
const MIN_RESEARCH_SOURCES = 2
const MAX_RESEARCH_SOURCES = 8
const MIN_DISTINCT_SOURCE_DOMAINS = 2
const MIN_CREDIBLE_SOURCES = 2
const MAX_TIER_THREE_SOURCE_RATIO = 1
const MAX_SOURCES_PER_DOMAIN = 2
const MIN_ARTICLE_WORDS = 750
const MAX_WRITER_RETRIES = 2
const FACT_CHECK_REWRITE_RETRIES = 2
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
  'satan worshipping',
  'child sacrificing',
  'traitor globalists',
  'global currency reset',
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

const TOPIC_ATTRIBUTION_HINTS = [
  'reuters',
  'associated press',
  'ap',
  'bbc',
  'cnn',
  'nbc',
  'abc',
  'cbs',
  'fox',
  'deadline',
  'bloomberg',
  'forbes',
  'politico',
  'axios',
  'guardian',
  'new york times',
  'nyt',
  'washington post',
  'wall street journal',
  'wsj',
  'al jazeera',
  'npr',
]

const QUERY_NOISE_TOKENS = new Set([
  ...Array.from(TOKEN_STOPWORDS),
  'call',
  'calls',
  'called',
  'amid',
  'against',
  'after',
  'before',
  'over',
  'under',
  'from',
  'with',
  'without',
  'video',
  'watch',
  'live',
  'update',
  'updates',
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

const LOW_CREDIBILITY_SOURCE_HINTS = [
  'reddit.com',
  'x.com',
  'twitter.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'rumble.com',
  'blogspot.com',
  'medium.com',
  'substack.com',
  'wordpress.com',
  'quora.com',
  'pinterest.com',
  'discord.com',
  'telegram.me',
  '4chan.org',
  'hoax',
  'rumor',
]

const TIER_ONE_SOURCE_HINTS = [
  'reuters',
  'associated press',
  'apnews.com',
  'afp',
  '.gov',
  '.mil',
  'europa.eu',
  'un.org',
  'who.int',
  'oecd.org',
  'imf.org',
  'worldbank.org',
  'federalreserve.gov',
  'sec.gov',
  'cdc.gov',
  'nih.gov',
  'nasa.gov',
  'noaa.gov',
]

const TIER_TWO_SOURCE_HINTS = [
  'bbc',
  'financial times',
  'ft.com',
  'bloomberg',
  'wsj',
  'theguardian',
  'nytimes',
  'washingtonpost',
  'economist',
  'npr',
  'cnbc',
  'aljazeera',
  'nature.com',
  'science.org',
  'lancet.com',
  'jamanetwork.com',
  'nejm.org',
  '.edu',
  'university',
  'hospital',
  'ministry',
  'centralbank',
]

type SourceTier = 1 | 2 | 3
type Grade = 'A' | 'B' | 'C' | 'D' | 'HOLD'

type ResearchFailure = {
  error: 'insufficient_data'
  reason?: string
}

type ResearchNormalizationDiagnostics = {
  failures: string[]
  metrics: Record<string, unknown>
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
  source: 'manual' | 'newsapi' | 'gnews' | 'virlo' | 'seed'
}

type GradeDecision = {
  grade: Grade
  note?: string
  reason?: string
  tierOneCount: number
  hasCorroboration: boolean
  unresolvedConflicts: boolean
  limitedSources?: boolean
}

type PipelineRuntimeConfig = {
  strictFactCheck: boolean
}

type ArticleRecordOptions = {
  gradeBadgeOverride?: string
  verificationStatusOverride?: PublishedArticle['verificationStatus']
}

const TESTING_UNVERIFIED_BADGE = '⚠ Unverified Draft'
const LIMITED_SOURCES_BADGE = 'Grade C · Limited Sources'

type PipelineSummary = {
  topicsIngested: number
  scoredAbove60: number
  researched: number
  gradedABC: number
  published: number
  rejected: number
}

type ModelProvider = 'groq' | 'openrouter' | 'anthropic' | 'deterministic'

type ModelCallResult = {
  output: string | null
  provider: Exclude<ModelProvider, 'deterministic'> | null
}

type WriterFailureReason = 'no_model_output' | 'invalid_draft_json' | 'hard_constraints'

type WriterFailure = {
  reason: WriterFailureReason
  provider: ModelProvider | null
  failedChecks: string[]
  attempts: number
}

type WriterResult = {
  draft: WriterDraft | null
  provider: ModelProvider | null
  failure?: WriterFailure
  usedDeterministicFallback?: boolean
}

type QualityGateOutcome = {
  qualityScore: QualityScore | null
  reason?: string
}

const globalForPipeline = globalThis as typeof globalThis & {
  __dispatchAutoRunPromise?: Promise<void>
  __dispatchGroqRateLimitUntilByKey?: Map<string, number>
}

function getGroqRateLimitMap() {
  if (!globalForPipeline.__dispatchGroqRateLimitUntilByKey) {
    globalForPipeline.__dispatchGroqRateLimitUntilByKey = new Map<string, number>()
  }

  return globalForPipeline.__dispatchGroqRateLimitUntilByKey
}

function getRetryAfterMs(response: Response) {
  const header = response.headers.get('retry-after')?.trim()
  if (!header) {
    return GROQ_RATE_LIMIT_COOLDOWN_MS
  }

  const asSeconds = Number(header)
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.max(1_000, Math.round(asSeconds * 1_000))
  }

  const asDate = Date.parse(header)
  if (!Number.isNaN(asDate)) {
    const delta = asDate - Date.now()
    return Math.max(1_000, delta)
  }

  return GROQ_RATE_LIMIT_COOLDOWN_MS
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

function stripTopicAttributionSuffix(topic: string) {
  const match = topic.match(/^(.*?)(?:\s*[|–—-]\s*)([^|–—-]{2,48})$/)
  if (!match) {
    return topic
  }

  const lead = normalizeTopic(match[1] ?? '')
  const tail = normalizeTopic(match[2] ?? '')
  if (!lead || !tail) {
    return topic
  }

  const tailLower = tail.toLowerCase()
  const tailTokens = tailLower.split(' ').filter(Boolean)
  const looksLikeAttribution =
    TOPIC_ATTRIBUTION_HINTS.some((hint) => tailLower.includes(hint)) || tailTokens.length <= 3

  if (!looksLikeAttribution || lead.split(' ').length < 3) {
    return topic
  }

  return lead
}

function sanitizeTopicCandidate(value: string) {
  let topic = normalizeTopic(value)
  if (!topic) {
    return ''
  }

  topic = stripTopicAttributionSuffix(topic)
  topic = topic.replace(/\s*\((video|photos?|watch live|live updates?)\)\s*$/i, '')
  topic = topic.replace(/\s*\[[^\]]+\]\s*$/g, '')
  topic = topic.replace(/[“”]/g, '"')
  topic = topic.replace(/[‘’]/g, "'")

  return normalizeTopic(topic)
}

function buildResearchQueries(topic: string) {
  const normalized = sanitizeTopicCandidate(topic)
  if (!normalized) {
    return []
  }

  const colonIndex = normalized.indexOf(':')
  const preColon =
    colonIndex > 0
      ? sanitizeTopicCandidate(normalized.slice(0, colonIndex))
      : ''

  const compactTokenQuery = normalizeForCompare(normalized)
    .split(' ')
    .filter((token) => token.length >= 4 && !QUERY_NOISE_TOKENS.has(token))
    .slice(0, 7)
    .join(' ')

  return Array.from(
    new Set(
      [
        normalized,
        preColon,
        normalized.replace(/["']/g, ''),
        compactTokenQuery,
      ]
        .map((query) => normalizeTopic(query))
        .filter(Boolean)
    )
  ).slice(0, MAX_RESEARCH_QUERY_VARIANTS)
}

function mergeSearchHits(existing: NewsSearchHit[], incoming: NewsSearchHit[]) {
  const merged = [...existing]
  const seen = new Set<string>()

  for (const hit of merged) {
    const key = `${normalizeSourceUrl(hit.url)}|${normalizeForCompare(hit.title)}`
    seen.add(key)
  }

  for (const hit of incoming) {
    const key = `${normalizeSourceUrl(hit.url)}|${normalizeForCompare(hit.title)}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    merged.push(hit)
  }

  return merged
}

function normalizeForCompare(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSourceDomain(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

function normalizeSourceUrl(value: string) {
  try {
    const parsed = new URL(value)
    parsed.hash = ''

    const keysToDrop: string[] = []
    for (const key of parsed.searchParams.keys()) {
      if (/^utm_/i.test(key)) {
        keysToDrop.push(key)
      }
    }

    for (const key of keysToDrop) {
      parsed.searchParams.delete(key)
    }

    const pathname = parsed.pathname.replace(/\/+$/g, '') || '/'
    const query = parsed.searchParams.toString()
    const normalized = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${pathname}${
      query ? `?${query}` : ''
    }`

    return normalized
  } catch {
    return value.trim()
  }
}

function collapsedSourceAlias(value: string) {
  return normalizeForCompare(value).replace(/\s+/g, '')
}

function sourceNamesLikelyMatch(left: string, right: string) {
  const normalizedLeft = normalizeForCompare(left)
  const normalizedRight = normalizeForCompare(right)
  const aliasLeft = collapsedSourceAlias(left)
  const aliasRight = collapsedSourceAlias(right)

  if (!normalizedLeft || !normalizedRight) {
    return false
  }

  if (
    aliasLeft &&
    aliasRight &&
    (aliasLeft === aliasRight || aliasLeft.includes(aliasRight) || aliasRight.includes(aliasLeft))
  ) {
    return true
  }

  if (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    return true
  }

  const leftTokens = sourceNameTokens(normalizedLeft)
  const rightTokens = sourceNameTokens(normalizedRight)
  return setIntersectionCount(leftTokens, rightTokens) >= 1
}

function isEligibleSearchHitSource(hit: NewsSearchHit) {
  return Boolean(
    hit.url && isSpecificSourceUrl(hit.url) && !isLowCredibilitySource(hit.source, hit.url)
  )
}

function findBestSearchHitForSource(
  sourceName: string,
  sourceUrl: string,
  searchHits: NewsSearchHit[]
) {
  const targetName = sourceName.trim()
  const targetDomain = getSourceDomain(sourceUrl)
  const normalizedTargetUrl = normalizeSourceUrl(sourceUrl)

  let bestMatch: { hit: NewsSearchHit; score: number } | null = null

  for (const hit of searchHits) {
    if (!isEligibleSearchHitSource(hit)) {
      continue
    }

    const normalizedHitUrl = normalizeSourceUrl(hit.url)
    const hitDomain = getSourceDomain(hit.url)
    let score = 0

    if (targetName && sourceNamesLikelyMatch(targetName, hit.source)) {
      score += 5
    }

    if (targetDomain && hitDomain && targetDomain === hitDomain) {
      score += 4
    }

    if (normalizedTargetUrl && normalizedTargetUrl === normalizedHitUrl) {
      score += 6
    }

    if (hit.excerpt.trim().length >= 80) {
      score += 1
    }

    if (score < 4) {
      continue
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { hit, score }
    }
  }

  return bestMatch?.hit ?? null
}

function isLowCredibilitySource(name: string, url: string) {
  const lowerName = name.toLowerCase()
  const lowerUrl = `${url.toLowerCase()} ${getSourceDomain(url)}`

  return LOW_CREDIBILITY_SOURCE_HINTS.some(
    (hint) => lowerName.includes(hint) || lowerUrl.includes(hint)
  )
}

function dedupeAndBalanceSources(sources: ExtendedResearchSource[]) {
  const unique = new Map<string, ExtendedResearchSource>()

  for (const source of sources) {
    const normalizedName = normalizeForCompare(source.name)
    const normalizedUrl = normalizeSourceUrl(source.url)
    if (!normalizedName || !normalizedUrl) {
      continue
    }

    const key = `${normalizedName}|${normalizedUrl}`
    if (!unique.has(key)) {
      unique.set(key, source)
    }
  }

  const sorted = Array.from(unique.values()).sort((left, right) => {
    if (left.tier !== right.tier) {
      return left.tier - right.tier
    }

    return right.credibilityNotes.length - left.credibilityNotes.length
  })

  const domainUsage = new Map<string, number>()
  const balanced: ExtendedResearchSource[] = []

  for (const source of sorted) {
    const domain = getSourceDomain(source.url)
    const usage = domainUsage.get(domain) ?? 0

    if (domain && usage >= MAX_SOURCES_PER_DOMAIN) {
      continue
    }

    balanced.push(source)

    if (domain) {
      domainUsage.set(domain, usage + 1)
    }

    if (balanced.length >= MAX_RESEARCH_SOURCES) {
      break
    }
  }

  return balanced
}

function hasMinimumSourceQuality(sources: ExtendedResearchSource[]) {
  if (sources.length < MIN_RESEARCH_SOURCES) {
    return false
  }

  const domains = new Set(
    sources.map((source) => getSourceDomain(source.url)).filter(Boolean)
  )

  if (domains.size < MIN_DISTINCT_SOURCE_DOMAINS) {
    return false
  }

  const credibleCount = sources.filter((source) => source.tier <= 2).length
  if (credibleCount < MIN_CREDIBLE_SOURCES) {
    return false
  }

  const tierThreeCount = sources.filter((source) => source.tier === 3).length
  if (tierThreeCount / Math.max(1, sources.length) > MAX_TIER_THREE_SOURCE_RATIO) {
    return false
  }

  return true
}

function sourceNameTokens(value: string) {
  return new Set(
    normalizeForCompare(value)
      .split(' ')
      .filter((token) => token.length >= 4)
  )
}

function sourceMatchesFactSourceName(
  factSourceName: string,
  sources: ExtendedResearchSource[]
) {
  const normalizedFactSource = normalizeForCompare(factSourceName)
  const factAlias = collapsedSourceAlias(factSourceName)
  if (!normalizedFactSource) {
    return false
  }

  const factTokens = sourceNameTokens(normalizedFactSource)

  return sources.some((source) => {
    const normalizedSourceName = normalizeForCompare(source.name)
    const sourceAlias = collapsedSourceAlias(source.name)
    if (!normalizedSourceName) {
      return false
    }

    if (
      factAlias &&
      sourceAlias &&
      (factAlias === sourceAlias || factAlias.includes(sourceAlias) || sourceAlias.includes(factAlias))
    ) {
      return true
    }

    if (
      normalizedFactSource === normalizedSourceName ||
      normalizedFactSource.includes(normalizedSourceName) ||
      normalizedSourceName.includes(normalizedFactSource)
    ) {
      return true
    }

    const domain = getSourceDomain(source.url)
    if (domain && normalizedFactSource.includes(domain)) {
      return true
    }

    const sourceTokens = sourceNameTokens(normalizedSourceName)
    const sharedTokens = setIntersectionCount(factTokens, sourceTokens)
    return sharedTokens >= 1
  })
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildSourceReferencePatterns(sources: ExtendedResearchSource[]) {
  const seen = new Set<string>()
  const patterns: RegExp[] = []

  const addPattern = (value: string) => {
    const normalized = value.trim().toLowerCase()
    if (!normalized || normalized.length < 3 || seen.has(normalized)) {
      return
    }

    seen.add(normalized)
    patterns.push(new RegExp(`\\b${escapeRegex(normalized).replace(/\\\s+/g, '\\s+')}\\b`, 'i'))
  }

  for (const source of sources) {
    addPattern(source.name)

    const domain = getSourceDomain(source.url)
    if (!domain) {
      continue
    }

    addPattern(domain)

    const domainTokens = domain
      .split('.')
      .filter(
        (token) =>
          token.length >= 4 &&
          !['com', 'org', 'net', 'gov', 'edu', 'co', 'uk', 'us', 'io', 'int'].includes(token)
      )

    for (const token of domainTokens) {
      addPattern(token)
    }
  }

  return patterns
}

function hasNamedSourceAttribution(text: string, sourcePatterns: RegExp[]) {
  if (!text.trim()) {
    return false
  }

  return sourcePatterns.some((pattern) => pattern.test(text))
}

function countAttributedSentences(text: string, sourcePatterns: RegExp[]) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  let count = 0
  for (const sentence of sentences) {
    if (hasNamedSourceAttribution(sentence, sourcePatterns)) {
      count += 1
    }
  }

  return count
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

    const segments = pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => segment.toLowerCase())

    if (segments.length === 0) {
      return false
    }

    if (segments.length > 1) {
      return true
    }

    const singleSegment = segments[0]
    const genericSections = new Set([
      'news',
      'world',
      'business',
      'markets',
      'economy',
      'science',
      'technology',
      'tech',
      'health',
      'politics',
      'sports',
      'entertainment',
      'weather',
      'opinion',
      'videos',
      'video',
      'live',
      'latest',
      'latest-news',
      'tag',
      'tags',
      'topic',
      'topics',
      'category',
      'categories',
      'section',
      'sections',
      'author',
      'authors',
      'about',
      'contact',
      'privacy',
      'terms',
      'home',
      'blog',
    ])

    if (genericSections.has(singleSegment)) {
      return false
    }

    return true
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
  const domain = getSourceDomain(url)
  const lowerUrl = `${url.toLowerCase()} ${domain}`

  if (
    TIER_ONE_SOURCE_HINTS.some(
      (hint) => lowerName.includes(hint) || lowerUrl.includes(hint)
    )
  ) {
    return 1
  }

  if (
    TIER_TWO_SOURCE_HINTS.some(
      (hint) => lowerName.includes(hint) || lowerUrl.includes(hint)
    )
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

    if (isLowCredibilitySource(hit.source, hit.url)) {
      continue
    }

    const key = `${normalizeForCompare(hit.source)}|${normalizeSourceUrl(hit.url)}`
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

  const sources = dedupeAndBalanceSources(Array.from(sourceMap.values()))
  if (!hasMinimumSourceQuality(sources)) {
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

  if (keyFacts.length < MIN_RESEARCH_KEY_FACTS) {
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
  searchHits: NewsSearchHit[],
  diagnostics?: ResearchNormalizationDiagnostics
): ExtendedResearchBrief | null {
  const recordFailure = (failure: string) => {
    diagnostics?.failures.push(failure)
  }

  const setMetric = (key: string, metricValue: unknown) => {
    if (!diagnostics) {
      return
    }

    diagnostics.metrics[key] = metricValue
  }

  if (!value || typeof value !== 'object') {
    recordFailure('invalid_value: not an object')
    return null
  }

  const input = value as Partial<ExtendedResearchBrief>
  if (!Array.isArray(input.sources) || !Array.isArray(input.keyFacts)) {
    recordFailure('invalid_shape: sources/keyFacts missing')
    setMetric('hasSourcesArray', Array.isArray(input.sources))
    setMetric('hasKeyFactsArray', Array.isArray(input.keyFacts))
    return null
  }

  setMetric('inputSources', input.sources.length)
  setMetric('inputKeyFacts', input.keyFacts.length)

  const category = isArticleCategory(input.category) ? input.category : pickCategory(topic)
  const eligibleSearchHits = searchHits.filter(isEligibleSearchHitSource)

  setMetric('searchHits', searchHits.length)
  setMetric('eligibleSearchHits', eligibleSearchHits.length)

  if (eligibleSearchHits.length === 0) {
    recordFailure('no_eligible_search_hits')
  }

  const searchHitByUrl = new Map<string, NewsSearchHit>()
  for (const hit of eligibleSearchHits) {
    searchHitByUrl.set(normalizeSourceUrl(hit.url), hit)
  }

  const sourceDropCounts = {
    notObject: 0,
    missingNameAndUrl: 0,
    noMatchingSearchHit: 0,
    invalidResolvedUrl: 0,
    lowCredibility: 0,
  }

  const sources: ExtendedResearchSource[] = []

  for (const source of input.sources) {
    if (!source || typeof source !== 'object') {
      sourceDropCounts.notObject += 1
      continue
    }

    const typed = source as {
      name?: unknown
      url?: unknown
      tier?: unknown
      credibilityNotes?: unknown
    }

    const name = typeof typed.name === 'string' ? typed.name.trim() : ''
    const url = typeof typed.url === 'string' ? typed.url.trim() : ''

    if (!name && !url) {
      sourceDropCounts.missingNameAndUrl += 1
      continue
    }

    const normalizedUrl = normalizeSourceUrl(url)
    const exactHit = normalizedUrl ? searchHitByUrl.get(normalizedUrl) ?? null : null

    const matchedHit = exactHit ?? findBestSearchHitForSource(name, url, eligibleSearchHits)

    if (!matchedHit) {
      sourceDropCounts.noMatchingSearchHit += 1
      continue
    }

    const resolvedUrl = matchedHit.url
    const resolvedNameCandidate = typeof typed.name === 'string' ? typed.name.trim() : ''
    const resolvedName =
      resolvedNameCandidate && sourceNamesLikelyMatch(resolvedNameCandidate, matchedHit.source)
        ? resolvedNameCandidate
        : matchedHit.source

    if (!resolvedName || !resolvedUrl || !isSpecificSourceUrl(resolvedUrl)) {
      sourceDropCounts.invalidResolvedUrl += 1
      continue
    }

    if (isLowCredibilitySource(resolvedName, resolvedUrl)) {
      sourceDropCounts.lowCredibility += 1
      continue
    }

    const tier = normalizeSourceTier(typed.tier) ?? inferSourceTier(resolvedName, resolvedUrl)

    sources.push({
      name: resolvedName,
      url: resolvedUrl,
      tier,
      credibilityNotes:
        typeof typed.credibilityNotes === 'string' && typed.credibilityNotes.trim()
          ? typed.credibilityNotes.trim()
          : matchedHit.excerpt || `${resolvedName} coverage related to ${topic}`,
    })
  }

  setMetric('sourcesAfterRepair', sources.length)
  setMetric('sourceDropCounts', sourceDropCounts)
  
  const balancedSources = dedupeAndBalanceSources(sources)

  const balancedDomains = new Set(
    balancedSources.map((source) => getSourceDomain(source.url)).filter(Boolean)
  )
  const balancedCredibleCount = balancedSources.filter((source) => source.tier <= 2).length
  const balancedTierThreeCount = balancedSources.filter((source) => source.tier === 3).length

  setMetric('balancedSources', balancedSources.length)
  setMetric('balancedDomains', balancedDomains.size)
  setMetric('balancedCredibleSources', balancedCredibleCount)
  setMetric('balancedTierThreeSources', balancedTierThreeCount)

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

  const keyFactCounts = {
    parsed: keyFacts.length,
    kept: 0,
    droppedSourceMismatch: 0,
  }

  const filteredKeyFacts = keyFacts
    .filter((fact) => {
      const matches = sourceMatchesFactSourceName(fact.source, balancedSources)
      if (!matches) {
        keyFactCounts.droppedSourceMismatch += 1
      }

      return matches
    })
    .slice(0, 16)

  keyFactCounts.kept = filteredKeyFacts.length
  setMetric('keyFactsParsed', keyFactCounts.parsed)
  setMetric('keyFactsKept', keyFactCounts.kept)
  setMetric('keyFactsDroppedSourceMismatch', keyFactCounts.droppedSourceMismatch)

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
        .filter((claim) => {
          if (!claim.claim || !claim.counterclaim) {
            return false
          }

          if (!claim.source || !claim.counterSource) {
            return false
          }

          if (
            !sourceMatchesFactSourceName(claim.source, balancedSources) ||
            !sourceMatchesFactSourceName(claim.counterSource, balancedSources)
          ) {
            return false
          }

          return normalizeForCompare(claim.source) !== normalizeForCompare(claim.counterSource)
        })
        .slice(0, 10)
    : []

  const backgroundContext =
    typeof input.backgroundContext === 'string' && input.backgroundContext.trim()
      ? input.backgroundContext.trim()
      : ''

  setMetric('backgroundContextPresent', Boolean(backgroundContext))

  const whatWeDoNotKnow = Array.isArray(input.whatWeDoNotKnow)
    ? input.whatWeDoNotKnow
        .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
        .map((entry) => entry.trim())
        .slice(0, 8)
    : []

  if (!hasMinimumSourceQuality(balancedSources)) {
    recordFailure(
      `failed_source_quality: sources=${balancedSources.length} domains=${balancedDomains.size} credible=${balancedCredibleCount} tier3=${balancedTierThreeCount}`
    )
    return null
  }

  const allowsLimitedSourceFallback =
    filteredKeyFacts.length < MIN_RESEARCH_KEY_FACTS &&
    balancedSources.length > 0 &&
    Boolean(backgroundContext)

  if (filteredKeyFacts.length < MIN_RESEARCH_KEY_FACTS && !allowsLimitedSourceFallback) {
    recordFailure(
      `failed_keyFacts: kept=${filteredKeyFacts.length} (min ${MIN_RESEARCH_KEY_FACTS}), droppedSourceMismatch=${keyFactCounts.droppedSourceMismatch}`
    )
    return null
  }

  if (!backgroundContext && !allowsLimitedSourceFallback) {
    recordFailure('failed_backgroundContext: missing/empty')
    return null
  }

  const minimumNamedSources = allowsLimitedSourceFallback ? 1 : MIN_RESEARCH_KEY_FACTS

  const namedSourcesFallback = Array.from(new Set(balancedSources.map((source) => source.name))).slice(0, 12)

  const normalized: ExtendedResearchBrief = {
    topic: typeof input.topic === 'string' && input.topic.trim() ? input.topic.trim() : topic,
    category,
    sources: balancedSources,
    keyFacts: filteredKeyFacts,
    namedSources: namedSources.length >= minimumNamedSources ? namedSources : namedSourcesFallback,
    timeline,
    conflictingClaims,
    backgroundContext,
    whatWeDoNotKnow,
  }

  if (normalized.namedSources.length < minimumNamedSources) {
    const fallback = buildFallbackResearchBrief(topic, searchHits)
    if (!fallback) {
      recordFailure('failed_namedSources_fallback')
    }
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
  const claimsWithSources = research.keyFacts.filter((fact) => Boolean(fact.source?.trim())).length
  const tierOneCount = research.sources.filter((source) => source.tier === 1).length
  const tierTwoCount = research.sources.filter((source) => source.tier === 2).length
  const credibleCount = tierOneCount + tierTwoCount
  const distinctDomains = new Set(
    research.sources.map((source) => getSourceDomain(source.url)).filter(Boolean)
  ).size
  const tierThreeCount = research.sources.filter((source) => source.tier === 3).length
  const corroborated = hasCorroboration(research)
  const unresolvedConflicts = hasUnresolvedConflicts(research)
  const hasBackgroundContext = Boolean(research.backgroundContext?.trim())

  if (unresolvedConflicts) {
    return {
      grade: 'HOLD',
      reason: 'Conflicting claims remain unresolved',
      tierOneCount,
      hasCorroboration: corroborated,
      unresolvedConflicts,
    }
  }

  if (claimsWithSources < MIN_GRADE_CLAIMS && research.sources.length > 0 && hasBackgroundContext) {
    return {
      grade: 'C',
      note: 'Limited source detail; publishing with available context for testing',
      reason: 'limited_sources',
      tierOneCount,
      hasCorroboration: corroborated,
      unresolvedConflicts,
      limitedSources: true,
    }
  }

  if (claimsWithSources < MIN_GRADE_CLAIMS) {
    return {
      grade: 'D',
      reason: `No claims of substance (fewer than ${MIN_GRADE_CLAIMS} key facts)`,
      tierOneCount,
      hasCorroboration: corroborated,
      unresolvedConflicts,
    }
  }

  if (
    research.sources.length < MIN_RESEARCH_SOURCES ||
    distinctDomains < MIN_DISTINCT_SOURCE_DOMAINS ||
    credibleCount < MIN_CREDIBLE_SOURCES
  ) {
    return {
      grade: 'D',
      reason: 'Source quality threshold not met (need diverse and credible sourcing)',
      tierOneCount,
      hasCorroboration: corroborated,
      unresolvedConflicts,
    }
  }

  if (tierThreeCount / Math.max(1, research.sources.length) > MAX_TIER_THREE_SOURCE_RATIO) {
    return {
      grade: 'D',
      reason: 'Too many low-confidence sources compared with primary/established reporting',
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

  if (claimsWithSources >= MIN_GRADE_CLAIMS) {
    return {
      grade: 'C',
      note: corroborated
        ? 'No primary source, but corroborated across established reporting'
        : 'No primary source; established reporting available (not yet corroborated)',
      tierOneCount,
      hasCorroboration: corroborated,
      unresolvedConflicts,
    }
  }

  return {
    grade: 'D',
    reason: 'Insufficient primary or corroborated established sourcing',
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

function normalizeQualityScore(value: unknown): QualityScore | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const input = value as {
    sourceDiversity?: unknown
    sensationalism?: unknown
    factualConfidence?: unknown
    ledeStrength?: unknown
    overallScore?: unknown
    flaggedClaims?: unknown
    publishRecommendation?: unknown
  }

  const sourceDiversity = clampScore(input.sourceDiversity, 0, 10, 0)
  const sensationalism = clampScore(input.sensationalism, 0, 10, 0)
  const factualConfidence = clampScore(input.factualConfidence, 0, 10, 0)
  const ledeStrength = clampScore(input.ledeStrength, 0, 10, 0)
  const averageScore = Number(
    ((sourceDiversity + sensationalism + factualConfidence + ledeStrength) / 4).toFixed(1)
  )
  const overallScore = clampScore(input.overallScore, 0, 10, averageScore)
  const flaggedClaims = Array.isArray(input.flaggedClaims)
    ? input.flaggedClaims
        .filter((claim): claim is string => typeof claim === 'string' && Boolean(claim.trim()))
        .map((claim) => claim.trim())
        .slice(0, 20)
    : []

  const publishRecommendation =
    typeof input.publishRecommendation === 'boolean'
      ? input.publishRecommendation
      : overallScore >= 7 && flaggedClaims.length === 0

  return {
    sourceDiversity,
    sensationalism,
    factualConfidence,
    ledeStrength,
    overallScore,
    flaggedClaims,
    publishRecommendation,
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

function getGroqApiKeys() {
  const primaryKey = (process.env.GROQ_API_KEY ?? '').trim()
  const fallbackKey = (process.env.GROQ_API_KEY_FALLBACK ?? '').trim()
  const fallbackKeyTwo = (process.env.GROQ_API_KEY_FALLBACK_2 ?? '').trim()

  const keysFromList = (process.env.GROQ_API_KEYS ?? '')
    .split(/[\n,]/g)
    .map((value) => value.trim())
    .filter(Boolean)

  const candidates = [primaryKey, fallbackKey, fallbackKeyTwo, ...keysFromList]
    .map((value) => value.trim())
    .filter(Boolean)

  return Array.from(new Set(candidates))
}

function shouldTryNextGroqKey(status: number) {
  return status === 401 || status === 403 || status === 429 || status >= 500
}

async function callGroq(system: string, payload: object) {
  const apiKeys = getGroqApiKeys()
  if (apiKeys.length === 0) {
    return null
  }

  const rateLimitUntilByKey = getGroqRateLimitMap()
  const now = Date.now()
  let attemptedRequest = false

  try {
    for (let index = 0; index < apiKeys.length; index += 1) {
      const apiKey = apiKeys[index]
      const rateLimitUntil = rateLimitUntilByKey.get(apiKey) ?? 0

      if (rateLimitUntil > now) {
        continue
      }

      attemptedRequest = true
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
        let errorMessage: string | null = null
        try {
          const responseText = await response.text()
          if (responseText.trim()) {
            try {
              const parsed = JSON.parse(responseText) as { error?: { message?: unknown } }
              const message = parsed?.error?.message
              errorMessage = typeof message === 'string' ? message.trim() : null
            } catch {
              errorMessage = null
            }
          }
        } catch {
          errorMessage = null
        }

        const messagePart = errorMessage ? `: ${errorMessage}` : ''
        console.warn(`[callGroq] failed with status ${response.status}${messagePart}`)

        if (response.status === 429) {
          const retryAfterMs = getRetryAfterMs(response)
          rateLimitUntilByKey.set(apiKey, Date.now() + retryAfterMs)
        }

        const isLastKey = index >= apiKeys.length - 1
        if (isLastKey || !shouldTryNextGroqKey(response.status)) {
          return null
        }

        console.warn(`[callGroq] retrying with next Groq API key (${index + 2}/${apiKeys.length})`)
        continue
      }

      const json = await response.json()
      const text = json?.choices?.[0]?.message?.content
      if (typeof text === 'string' && text.trim()) {
        return text
      }

      console.warn('[callGroq] response returned no usable message content')

      const isLastKey = index >= apiKeys.length - 1
      if (isLastKey) {
        return null
      }
    }

    if (!attemptedRequest) {
      console.warn('[callGroq] all configured Groq keys are cooling down after rate limits')
    }

    return null
  } catch (error) {
    console.error('[callGroq] error:', error instanceof Error ? error.message : error)
    return null
  }
}

async function callOpenRouter(system: string, payload: object) {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  if (!apiKey) {
    return null
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'http-referer': 'https://dispatch.local',
        'x-title': 'DISPATCH',
      },
      body: JSON.stringify({
        model: DEFAULT_OPENROUTER_MODEL,
        temperature: 0.15,
        max_tokens: 2600,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    })

    const responseText = await response.text()
    let responseJson: unknown = null

    if (responseText.trim()) {
      try {
        responseJson = JSON.parse(responseText)
      } catch {
        responseJson = null
      }
    }

    if (!response.ok) {
      const errorMessage =
        responseJson && typeof responseJson === 'object'
          ? (() => {
              const typed = responseJson as {
                error?: { message?: unknown; code?: unknown }
              }
              const message = typed.error?.message
              const code = typed.error?.code

              const messagePart = typeof message === 'string' ? message.trim() : ''
              const codePart = typeof code === 'string' ? code.trim() : ''

              if (messagePart && codePart) {
                return `${codePart}: ${messagePart}`
              }

              if (messagePart) {
                return messagePart
              }

              if (codePart) {
                return codePart
              }

              return null
            })()
          : null

      if (errorMessage) {
        console.warn(`[callOpenRouter] failed with status ${response.status}: ${errorMessage}`)
      } else {
        console.warn(`[callOpenRouter] failed with status ${response.status}`)
      }

      return null
    }

    const json = responseJson as {
      choices?: Array<{
        message?: {
          content?: unknown
        }
        text?: unknown
      }>
    } | null

    const firstChoice = json?.choices?.[0]
    const content = firstChoice?.message?.content

    if (typeof content === 'string') {
      const trimmed = content.trim()
      return trimmed ? trimmed : null
    }

    if (Array.isArray(content)) {
      const text = content
        .map((item) => (item && typeof item === 'object' ? (item as { text?: unknown }).text : null))
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .join('')
        .trim()
      return text || null
    }

    const choiceText = firstChoice?.text
    if (typeof choiceText === 'string') {
      const trimmed = choiceText.trim()
      return trimmed || null
    }

    console.warn('[callOpenRouter] response returned no usable message content')

    return null
  } catch (error) {
    console.error('[callOpenRouter] error:', error instanceof Error ? error.message : error)
    return null
  }
}

async function callModelWithProvider(system: string, payload: object): Promise<ModelCallResult> {
  if (AI_PROVIDER === 'anthropic') {
    const output = await callAnthropic(system, payload)
    return {
      output,
      provider: output ? 'anthropic' : null,
    }
  }

  if (AI_PROVIDER === 'groq') {
    const groqOutput = await callGroq(system, payload)
    if (groqOutput) {
      return {
        output: groqOutput,
        provider: 'groq',
      }
    }

    console.warn('[callModel] Groq returned no output, trying OpenRouter fallback')
    const openRouterOutput = await callOpenRouter(system, payload)

    if (openRouterOutput) {
      console.info('[callModel] OpenRouter fallback produced output')
      return {
        output: openRouterOutput,
        provider: 'openrouter',
      }
    }

    console.warn('[callModel] OpenRouter fallback returned no output, trying Anthropic fallback')
    const anthropicOutput = await callAnthropic(system, payload)

    if (anthropicOutput) {
      console.info('[callModel] Anthropic tertiary fallback produced output')
      return {
        output: anthropicOutput,
        provider: 'anthropic',
      }
    }

    console.warn('[callModel] Anthropic tertiary fallback returned no output')
    return {
      output: null,
      provider: null,
    }
  }

  if (AI_PROVIDER === 'openrouter') {
    const output = await callOpenRouter(system, payload)
    return {
      output,
      provider: output ? 'openrouter' : null,
    }
  }

  const groqOutput = await callGroq(system, payload)
  if (groqOutput) {
    return {
      output: groqOutput,
      provider: 'groq',
    }
  }

  const openRouterOutput = await callOpenRouter(system, payload)
  if (openRouterOutput) {
    return {
      output: openRouterOutput,
      provider: 'openrouter',
    }
  }

  const anthropicOutput = await callAnthropic(system, payload)
  return {
    output: anthropicOutput,
    provider: anthropicOutput ? 'anthropic' : null,
  }
}

async function callModel(system: string, payload: object) {
  const result = await callModelWithProvider(system, payload)
  return result.output
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
    const manualTopic = sanitizeTopicCandidate(topicOverride.trim()) || normalizeTopic(topicOverride)
    return {
      rawTopics: dedupeSimilarTopics([manualTopic]).slice(0, RAW_TOPIC_LIMIT),
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

  logPipelineEvent(
    'trend-intake',
    'processing',
    'Trend intake',
    'Fetching trending topics from NewsAPI...',
    12
  )
  const newsApiTopics = await getNewsApiTopics()

  logPipelineEvent(
    'trend-intake',
    newsApiTopics.length > 0 ? 'completed' : 'failed',
    'Trend intake',
    `NewsAPI returned ${newsApiTopics.length} topics`
  )

  let selected = newsApiTopics
  let source: IngestResult['source'] = 'newsapi'

  if (selected.length === 0) {
    logPipelineEvent(
      'trend-intake',
      'processing',
      'Trend intake',
      'Fetching topics from GNews (fallback)...',
      14
    )

    const gNewsTopics = await getGNewsTopics()
    selected = gNewsTopics
    source = 'gnews'
  }

  if (selected.length === 0 && virloSnapshot.topics.length > 0) {
    logPipelineEvent(
      'trend-intake',
      'completed',
      'Trend intake',
      'Using Virlo snapshot topics (fallback)...',
      16
    )
    selected = virloSnapshot.topics
    source = 'virlo'
  }

  if (selected.length === 0) {
    logPipelineEvent(
      'trend-intake',
      'completed',
      'Trend intake',
      'Using seed topics (last resort)',
      16
    )
    selected = SEED_TOPICS
    source = 'seed'
  }

  const rawTopics = dedupeSimilarTopics(selected.map((topic) => sanitizeTopicCandidate(topic)).filter(Boolean)).slice(
    0,
    RAW_TOPIC_LIMIT
  )
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

async function scoreTopics(rawTopics: string[], useModelScoring = true) {
  logPipelineEvent(
    'trend-intake',
    'processing',
    'Topic scoring',
    useModelScoring
      ? `Scoring ${rawTopics.length} topics...`
      : `Scoring ${rawTopics.length} topics with deterministic fallback mode...`,
    20
  )

  const scores: TopicScoreCard[] = []

  for (const topic of rawTopics) {
    const score = useModelScoring ? await scoreTopic(topic) : fallbackTopicScore(topic)
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
  const canonicalTopic = sanitizeTopicCandidate(topic) || normalizeTopic(topic)
  const researchQueries = buildResearchQueries(canonicalTopic)
  let searchHits: NewsSearchHit[] = []

  for (const query of researchQueries) {
    logPipelineEvent(
      'research',
      'processing',
      canonicalTopic,
      `Researching '${canonicalTopic}' via TheNewsAPI (query='${query}')...`,
      45
    )

    const theNewsHits = await searchTheNewsApi(query)
    searchHits = mergeSearchHits(searchHits, theNewsHits)

    if (searchHits.length >= MIN_RESEARCH_KEY_FACTS) {
      logPipelineEvent(
        'research',
        'completed',
        canonicalTopic,
        `Research found ${searchHits.length} articles for '${canonicalTopic}' (query='${query}')`
      )
      break
    }

    logPipelineEvent(
      'research',
      'processing',
      canonicalTopic,
      `Research fallback: trying NewsAPI (query='${query}')...`,
      46
    )

    const newsApiHits = await searchNewsApi(query)
    searchHits = mergeSearchHits(searchHits, newsApiHits)

    if (searchHits.length >= MIN_RESEARCH_KEY_FACTS) {
      logPipelineEvent(
        'research',
        'completed',
        canonicalTopic,
        `Research found ${searchHits.length} articles for '${canonicalTopic}' (query='${query}')`
      )
      break
    }
  }

  if (searchHits.length < MIN_RESEARCH_KEY_FACTS) {
    logPipelineEvent(
      'research',
      'failed',
      canonicalTopic,
      `Insufficient research data for '${canonicalTopic}' — skipping`
    )

    return {
      error: 'insufficient_data',
      reason: `TheNewsAPI and NewsAPI returned fewer than ${MIN_RESEARCH_KEY_FACTS} candidate sources across query variants`,
    }
  }

  const modelResult = await callModelWithProvider(RESEARCH_BRIEF_PROMPT, {
    topic: canonicalTopic,
    searchResults: searchHits,
  })
  const modelOutput = modelResult.output
  const modelProvider = modelResult.provider ?? 'none'

  const parsed = parseJsonObject<ExtendedResearchBrief | ResearchFailure>(modelOutput)
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    console.warn(
      `[research] model returned insufficient_data (provider=${modelProvider}): ${
        typeof parsed.reason === 'string' ? parsed.reason : 'no reason provided'
      }`
    )

    return {
      error: 'insufficient_data',
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'Research model reported insufficient data',
    }
  }

  const diagnostics: ResearchNormalizationDiagnostics = { failures: [], metrics: {} }
  const research = normalizeResearchBrief(canonicalTopic, parsed, searchHits, diagnostics)

  if (!research) {
    const rawOutputLength = modelOutput?.length ?? 0
    const outputPreview =
      typeof modelOutput === 'string'
        ? modelOutput.replace(/\s+/g, ' ').trim().slice(0, 1200)
        : 'no model output'

    const parseState = parsed ? 'parsed-json-but-failed-validation' : 'invalid-json'

    console.warn(
      `[research] rejected model output (${parseState}, provider=${modelProvider}, chars=${rawOutputLength})`
    )
    console.warn(`[research] output preview: ${outputPreview}`)

    const normalizeFailures = diagnostics.failures.length
      ? diagnostics.failures.join(' | ')
      : 'unknown_validation_failure'

    if (diagnostics.failures.length > 0) {
      console.warn(`[research] normalize failures: ${normalizeFailures}`)
    }

    if (Object.keys(diagnostics.metrics).length > 0) {
      console.warn(`[research] normalize metrics: ${JSON.stringify(diagnostics.metrics)}`)
    }

    return {
      error: 'insufficient_data',
      reason: `Unable to validate research brief: ${normalizeFailures}`,
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

function runLocalFactCheck(
  draft: WriterDraft,
  research: ExtendedResearchBrief
): FactCheckResult {
  const criticalViolations: string[] = []
  const warnings: string[] = []
  const sourcePatterns = buildSourceReferencePatterns(research.sources)

  const text = `${draft.headline}\n${draft.subheadline}\n${draft.lede}\n${draft.body}`
  const bannedMatches = findBannedPhrases(text)
  if (bannedMatches.length > 0) {
    warnings.push(...bannedMatches.map((phrase) => `Banned phrase present: ${phrase}`))
  }

  const overstatementPattern = new RegExp(`\\b(${OVERSTATEMENT_TERMS.join('|')})\\b`, 'i')
  if (overstatementPattern.test(text)) {
    criticalViolations.push('Overstatement language detected')
  }

  const numericSentencePattern = /[^.\n]*\b\d[\d,.-]*\b[^.\n]*/g
  const missingNumericAttributions: string[] = []

  for (const match of text.matchAll(numericSentencePattern)) {
    const sentence = match[0]
    const startIndex = match.index ?? 0

    if (hasNamedSourceAttribution(sentence, sourcePatterns)) {
      continue
    }

    const trailingWindow = text.slice(startIndex, Math.min(text.length, startIndex + sentence.length + 160))
    if (hasNamedSourceAttribution(trailingWindow, sourcePatterns)) {
      continue
    }

    missingNumericAttributions.push(sentence.trim())
  }

  if (missingNumericAttributions.length > 0) {
    warnings.push('Numeric claims without inline citation')
  }

  if (usesBulletPoints(draft.body)) {
    warnings.push('Article body includes bullet formatting instead of full prose')
  }

  if (draft.wordCount < MIN_ARTICLE_WORDS) {
    warnings.push(`Article below minimum length (${draft.wordCount}/${MIN_ARTICLE_WORDS} words)`)
  }

  const attributionText = `${draft.lede}\n\n${draft.body}`
  const attributedSentences = countAttributedSentences(attributionText, sourcePatterns)
  const minimumAttributedSentences = Math.min(4, Math.max(MIN_KEY_FACTS, research.sources.length - 1))
  if (attributedSentences < minimumAttributedSentences) {
    warnings.push(
      `Insufficient named-source attribution in prose (${attributedSentences}/${minimumAttributedSentences} sentences)`
    )
  }

  if (/\b(health|medical|scientific|clinical|study|vaccine|disease|trial|research)\b/i.test(text)) {
    if (!hasNamedSourceAttribution(text, sourcePatterns)) {
      warnings.push('Health or scientific claim without named source attribution')
    }
  }

  if (criticalViolations.length > 0) {
    return {
      pass: false,
      warnings,
      violations: criticalViolations,
      severity: 'critical',
    }
  }

  return {
    pass: true,
    warnings,
    violations: [],
  }
}

function splitCriticalFactCheckViolations(violations: string[]) {
  const critical: string[] = []
  const warnings: string[] = []
  const overstatementPattern = new RegExp(`\\b(${OVERSTATEMENT_TERMS.join('|')})\\b`, 'i')

  for (const violation of violations) {
    if (/overstatement/i.test(violation) || overstatementPattern.test(violation)) {
      critical.push(violation)
    } else {
      warnings.push(violation)
    }
  }

  return {
    critical,
    warnings,
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
  const localResult = runLocalFactCheck(draft, research)

  if (!localResult.pass) {
    return localResult
  }

  if (!modelResult) {
    return {
      pass: true,
      warnings: Array.from(
        new Set([...localResult.warnings, 'Fact-check model output unavailable or invalid JSON'])
      ),
      violations: [],
    }
  }

  if (!modelResult.pass) {
    const split = splitCriticalFactCheckViolations(modelResult.violations ?? [])

    if (split.critical.length > 0) {
      return {
        pass: false,
        warnings: Array.from(new Set([...(modelResult.warnings ?? []), ...localResult.warnings, ...split.warnings])),
        violations: split.critical,
        severity: 'critical',
      }
    }

    return {
      pass: true,
      warnings: Array.from(new Set([...(modelResult.warnings ?? []), ...localResult.warnings, ...split.warnings])),
      violations: [],
      severity: modelResult.severity,
    }
  }

  return {
    pass: true,
    warnings: Array.from(new Set([...(modelResult.warnings ?? []), ...localResult.warnings])),
    violations: [],
    severity: modelResult.severity,
  }
}

async function runQualityGate(
  draft: WriterDraft,
  research: ExtendedResearchBrief,
  topicScore: TopicScoreCard,
  grade: Grade,
  factCheck: FactCheckResult
): Promise<QualityGateOutcome> {
  const modelOutput = await callModel(QUALITY_GATE_PROMPT, {
    article: draft,
    research,
    topicScore,
    grade,
    factCheck,
  })

  const modelScore = normalizeQualityScore(parseJsonObject<QualityScore>(modelOutput))
  if (!modelScore) {
    return {
      qualityScore: null,
      reason: 'Quality gate model output unavailable or invalid JSON',
    }
  }

  const flaggedClaims = Array.from(
    new Set([...(modelScore.flaggedClaims ?? []), ...(factCheck.violations ?? [])])
  ).slice(0, 20)

  const qualityScore: QualityScore = {
    ...modelScore,
    flaggedClaims,
    publishRecommendation:
      modelScore.publishRecommendation && modelScore.overallScore >= 7 && flaggedClaims.length === 0,
  }

  if (!qualityScore.publishRecommendation) {
    return {
      qualityScore,
      reason: `Quality gate rejected article (overallScore=${qualityScore.overallScore})`,
    }
  }

  return {
    qualityScore,
  }
}

function formatQualityGateFailure(outcome: QualityGateOutcome) {
  if (outcome.reason) {
    return outcome.reason
  }

  if (!outcome.qualityScore) {
    return 'Quality gate unavailable'
  }

  const flaggedClaims = outcome.qualityScore.flaggedClaims.join('; ')
  const claimsPart = flaggedClaims ? `flaggedClaims=${flaggedClaims}` : 'flaggedClaims=none'
  const recommendationPart = `publishRecommendation=${outcome.qualityScore.publishRecommendation}`

  return `Quality gate rejected article (overallScore=${outcome.qualityScore.overallScore}; ${recommendationPart}; ${claimsPart})`
}

function buildTestingQualityScore(): QualityScore {
  return {
    sourceDiversity: 0,
    sensationalism: 0,
    factualConfidence: 0,
    ledeStrength: 0,
    overallScore: 0,
    flaggedClaims: ['Fact-check bypassed (strict=false testing mode)'],
    publishRecommendation: true,
  }
}

function sanitizeSentence(value: string) {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed) {
    return ''
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function buildDeterministicWriterDraft(
  research: ExtendedResearchBrief,
  gradeDecision: GradeDecision,
  topicScore: TopicScoreCard
): WriterDraft {
  const primarySource = research.sources[0]?.name ?? research.namedSources[0] ?? 'Primary reporting'
  const secondarySource = research.sources[1]?.name ?? primarySource
  const supportingSource = research.sources[2]?.name ?? secondarySource
  const keyFacts = research.keyFacts.slice(0, Math.max(6, Math.min(10, research.keyFacts.length)))

  const timelineSummary =
    research.timeline.length > 0
      ? research.timeline
          .slice(0, 4)
          .map((entry) => sanitizeSentence(`${entry.date}: ${entry.event} (reported by ${secondarySource})`))
          .filter(Boolean)
          .join(' ')
      : `Reporting on ${research.topic} is still unfolding with additional updates expected.`

  const whatWeDoNotKnow =
    research.whatWeDoNotKnow.length > 0
      ? research.whatWeDoNotKnow.map((item) => sanitizeSentence(item)).join(' ')
      : `Officials have not released full detail for every open question tied to ${research.topic}.`

  const whatHappensNext =
    research.timeline.length > 0
      ? `The next checkpoints are tied to the most recent timeline events and official follow-up statements as they are published by named outlets.`
      : `The next checkpoint is additional sourced reporting that confirms timeline, scope, and policy impact.`

  const paragraphs: string[] = []

  paragraphs.push(
    `Coverage of ${research.topic} currently centers on verifiable developments documented by ${primarySource}. ${sanitizeSentence(
      keyFacts[0]?.fact ?? `${research.topic} is drawing sustained reporting attention.`
    )} This detail is attributed to ${keyFacts[0]?.source ?? primarySource}.`
  )

  paragraphs.push(
    `This story matters because the available record combines policy, market, and public-interest signals that can be checked in named reporting. The topic scored ${topicScore.totalScore}/100 on the editorial intake gate and moved forward for full verification work, based on reporting from ${primarySource}.`
  )

  for (const fact of keyFacts.slice(1, 6)) {
    paragraphs.push(
      `${sanitizeSentence(fact.fact)} This detail is attributed to ${fact.source} and is treated as ${fact.confidence} pending further corroboration in subsequent reporting passes.`
    )
  }

  paragraphs.push(
    `The reporting timeline currently reads as follows: ${timelineSummary} These entries help separate what happened first, what changed, and what still needs confirmation before stronger conclusions are justified, according to ${secondarySource}.`
  )

  if (research.conflictingClaims.length > 0) {
    const conflict = research.conflictingClaims[0]
    paragraphs.push(
      `${sanitizeSentence(conflict.claim)} ${sanitizeSentence(
        `A competing framing says: ${conflict.counterclaim}`
      )} Both interpretations are tracked until additional records resolve the gap, with competing attributions to ${conflict.source} and ${conflict.counterSource}.`
    )
  }

  paragraphs.push(
    `${sanitizeSentence(research.backgroundContext)} This context clarifies the stakeholders, sequence, and practical stakes without relying on unsupported assumptions, and is grounded in reporting from ${supportingSource}.`
  )

  paragraphs.push(
    `${whatWeDoNotKnow} This uncertainty section remains explicit so readers can separate confirmed facts from open questions, based on the current record from ${primarySource}.`
  )

  paragraphs.push(
    `${whatHappensNext} Future updates will be incorporated only when sourced evidence is published and attributable to named outlets such as ${secondarySource}.`
  )

  const expansionSentence = `Editors will continue comparing statements, timelines, and documented evidence across ${primarySource} and ${secondarySource} to preserve accuracy while new reporting arrives.`

  while (countWords(paragraphs.join('\n\n')) < MIN_ARTICLE_WORDS) {
    paragraphs.push(expansionSentence)
  }

  const body = paragraphs.join('\n\n')
  const wordCount = countWords(body)
  const topicTokens = research.topic
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2)

  return {
    headline: `${research.topic}: What The Verified Reporting Shows`,
    subheadline: `Current coverage from ${primarySource} and ${secondarySource} mapped against verifiable facts and open questions.`,
    lede: `${sanitizeSentence(
      keyFacts[0]?.fact ?? `${research.topic} remains under active reporting review.`
    )} According to ${keyFacts[0]?.source ?? primarySource}.`,
    body,
    category: research.category,
    tags: Array.from(new Set([research.category.toLowerCase(), ...topicTokens])).slice(0, 8),
    wordCount,
    whatWeDoNotKnow,
    whatHappensNext,
    grade: gradeDecision.grade,
  }
}

function formatWriterFailure(failure?: WriterFailure) {
  if (!failure) {
    return 'Writer failed hard constraints'
  }

  const providerPart = failure.provider ? `provider=${failure.provider}` : 'provider=none'
  const checksPart =
    failure.failedChecks.length > 0
      ? `checks=${failure.failedChecks.join(' | ')}`
      : 'checks=none'

  return `${failure.reason} (${providerPart}; ${checksPart}; attempts=${failure.attempts})`
}

async function writeArticleFromResearch(
  research: ExtendedResearchBrief,
  gradeDecision: GradeDecision,
  topicScore: TopicScoreCard,
  attempt = 0,
  rewriteNotes: string[] = []
): Promise<WriterResult> {
  const allowedSourceNames = research.sources
    .map((source) => source.name)
    .filter((name): name is string => typeof name === 'string' && Boolean(name.trim()))
  const minimumAttributedSentences = Math.min(4, Math.max(MIN_KEY_FACTS, research.sources.length - 1))

  const modelResult = await callModelWithProvider(ARTICLE_WRITER_PROMPT, {
    topic: research.topic,
    grade: gradeDecision.grade,
    gradeNote: gradeDecision.note ?? null,
    topicScore,
    research,
    rewriteNotes,
    allowedSourceNames,
    sourceAttributionMinimum: minimumAttributedSentences,
  })

  const attemptCount = attempt + 1
  const modelProvider = modelResult.provider

  if (!modelResult.output) {
    const failedChecks = ['Model returned no output']

    if (attempt >= MAX_WRITER_RETRIES) {
      const fallbackDraft = buildDeterministicWriterDraft(research, gradeDecision, topicScore)
      console.warn(
        `[writer] no model output after ${attemptCount} attempts; using deterministic fallback draft`
      )
      return {
        draft: fallbackDraft,
        provider: 'deterministic',
        usedDeterministicFallback: true,
        failure: {
          reason: 'no_model_output',
          provider: modelProvider,
          failedChecks,
          attempts: attemptCount,
        },
      }
    }

    console.warn(
      `[writer] attempt ${attemptCount} returned no output (provider=${modelProvider ?? 'none'}), retrying`
    )

    return writeArticleFromResearch(
      research,
      gradeDecision,
      topicScore,
      attempt + 1,
      [...rewriteNotes, 'Return strict JSON only with all required fields.']
    )
  }

  const parsed = normalizeWriterDraft(
    parseJsonObject<WriterDraft>(modelResult.output),
    research,
    gradeDecision.grade
  )

  if (!parsed) {
    const failedChecks = ['Model output was not valid WriterDraft JSON']

    if (attempt >= MAX_WRITER_RETRIES) {
      const fallbackDraft = buildDeterministicWriterDraft(research, gradeDecision, topicScore)
      console.warn(
        `[writer] invalid draft JSON after ${attemptCount} attempts; using deterministic fallback draft`
      )
      return {
        draft: fallbackDraft,
        provider: 'deterministic',
        usedDeterministicFallback: true,
        failure: {
          reason: 'invalid_draft_json',
          provider: modelProvider,
          failedChecks,
          attempts: attemptCount,
        },
      }
    }

    console.warn(
      `[writer] attempt ${attemptCount} returned invalid JSON (provider=${modelProvider ?? 'none'}), retrying`
    )

    return writeArticleFromResearch(
      research,
      gradeDecision,
      topicScore,
      attempt + 1,
      [...rewriteNotes, ...failedChecks]
    )
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
    for (const phrase of bannedPhraseMatches) {
      console.warn(
        `[writer] warning: banned phrase present (attempt=${attemptCount}, provider=${modelProvider ?? 'none'}): ${phrase}`
      )
    }
  }

  if (bannedPhraseMatches.length > 2) {
    failedChecks.push(
      `Too many banned phrases detected (${bannedPhraseMatches.length}): ${bannedPhraseMatches.join(', ')}`
    )
  }

  const sourcePatterns = buildSourceReferencePatterns(research.sources)
  const attributionText = `${parsed.lede}\n\n${parsed.body}`
  const attributedSentences = countAttributedSentences(attributionText, sourcePatterns)

  if (attributedSentences < minimumAttributedSentences) {
    failedChecks.push(
      `Add stronger named-source attribution in prose (${attributedSentences}/${minimumAttributedSentences} attributed sentences)`
    )

    if (allowedSourceNames.length > 0) {
      failedChecks.push(
        `Use exact source names from allowedSourceNames (examples: ${allowedSourceNames.slice(0, 6).join(', ')})`
      )
    }
  }

  if (failedChecks.length > 0) {
    if (attempt >= MAX_WRITER_RETRIES) {
      const fallbackDraft = buildDeterministicWriterDraft(research, gradeDecision, topicScore)
      console.warn(
        `[writer] hard constraints failed after ${attemptCount} attempts; using deterministic fallback draft: ${failedChecks.join('; ')}`
      )
      return {
        draft: fallbackDraft,
        provider: 'deterministic',
        usedDeterministicFallback: true,
        failure: {
          reason: 'hard_constraints',
          provider: modelProvider,
          failedChecks,
          attempts: attemptCount,
        },
      }
    }

    console.warn(
      `[writer] attempt ${attemptCount} failed checks (provider=${modelProvider ?? 'none'}): ${failedChecks.join('; ')}`
    )

    return writeArticleFromResearch(
      research,
      gradeDecision,
      topicScore,
      attempt + 1,
      [...rewriteNotes, ...failedChecks]
    )
  }

  return {
    draft: parsed,
    provider: modelProvider,
  }
}

async function createArticleRecord(
  topic: string,
  research: ExtendedResearchBrief,
  draft: WriterDraft,
  qualityScore: QualityScore,
  grade: Grade,
  pipelineRunId: string,
  factCheckWarnings: string[],
  options?: ArticleRecordOptions
): Promise<PublishedArticle> {
  const body = draft.body.trim()
  const hintedImageUrl = await getNewsApiTopicImageHint(topic)
  const visual = await resolveStoryImage(
    topic,
    draft.category,
    hintedImageUrl,
    research.sources.map((source) => source.url)
  )

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
    verificationStatus: options?.verificationStatusOverride ?? (grade === 'A' ? 'verified' : 'pending'),
    grade,
    gradeBadge: options?.gradeBadgeOverride ?? getGradeBadge(grade),
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
  const newsApiTopics = await getNewsApiTopics()
  if (newsApiTopics.length > 0) {
    return newsApiTopics
  }

  const gNewsTopics = await getGNewsTopics()
  if (gNewsTopics.length > 0) {
    return gNewsTopics
  }

  const virloSnapshot = await getDailyVirloSnapshot()
  if (virloSnapshot.topics.length > 0) {
    return virloSnapshot.topics
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

  globalForPipeline.__dispatchAutoRunPromise = runPipeline({ scheduled: true })
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
  const draftResult = await writeArticleFromResearch(research, gradeDecision, topicScore)
  const draft = draftResult.draft
  if (!draft) {
    console.warn(`[generateArticleDraft] writer failed: ${formatWriterFailure(draftResult.failure)}`)
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

  const qualityGate = await runQualityGate(draft, research, topicScore, gradeDecision.grade, factCheck)
  if (!qualityGate.qualityScore || !qualityGate.qualityScore.publishRecommendation) {
    return {
      research: toPublicResearchBrief(research),
      draft: null,
      qualityScore: qualityGate.qualityScore,
    }
  }

  return {
    research: toPublicResearchBrief(research),
    draft,
    qualityScore: qualityGate.qualityScore,
  }
}

export async function runPipeline(input: GenerateStoryInput) {
  const topicOverride = input.topic?.trim()
  const isScheduledRun = input.scheduled === true && !topicOverride

  const runtimeConfig: PipelineRuntimeConfig = {
    strictFactCheck: input.strict !== false,
  }
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
  const rawTopicLimit = isScheduledRun ? SCHEDULED_RAW_TOPIC_LIMIT : RAW_TOPIC_LIMIT
  const maxResearchTopics = isScheduledRun ? SCHEDULED_MAX_RESEARCH_TOPICS : MAX_RESEARCH_TOPICS
  const rawTopics = dedupeSimilarTopics(ingested.rawTopics).slice(0, rawTopicLimit)

  if (isScheduledRun) {
    logPipelineEvent(
      'trend-intake',
      'processing',
      'Scheduled run',
      `Scheduled mode active: scoring up to ${rawTopicLimit} topics and researching up to ${maxResearchTopics}`,
      18
    )
  }

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
    const useModelScoring = !isScheduledRun
    const topicScores = await scoreTopics(rawTopics, useModelScoring)
    const shortlisted = topicScores
      .filter((score) => score.totalScore >= MIN_TOPIC_SCORE)
      .sort((left, right) => right.totalScore - left.totalScore)
      .slice(0, maxResearchTopics)

    const researchQueue = [...shortlisted]

    if (isScheduledRun) {
      const existingTopics = new Set(researchQueue.map((score) => normalizeForCompare(score.topic)))
      let addedSeedFallbacks = 0

      for (const seedTopic of SEED_TOPICS) {
        if (addedSeedFallbacks >= SCHEDULED_SEED_FALLBACK_TOPICS) {
          break
        }

        const normalizedSeed = normalizeForCompare(seedTopic)
        if (!normalizedSeed || existingTopics.has(normalizedSeed)) {
          continue
        }

        researchQueue.push(fallbackTopicScore(seedTopic))
        existingTopics.add(normalizedSeed)
        addedSeedFallbacks += 1
      }

      if (addedSeedFallbacks > 0) {
        logPipelineEvent(
          'trend-intake',
          'processing',
          'Scheduled run',
          `Added ${addedSeedFallbacks} resilient seed-topic fallbacks for scheduled run`,
          24
        )
      }
    }

    summary.scoredAbove60 = topicScores.filter((score) => score.totalScore >= MIN_TOPIC_SCORE).length
    summary.rejected += topicScores.filter((score) => score.totalScore < MIN_TOPIC_SCORE).length

    if (researchQueue.length === 0) {
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

    for (const score of researchQueue) {
      selectedTopic = score.topic

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
      const gradeBadgeOverride = gradeDecision.limitedSources ? LIMITED_SOURCES_BADGE : undefined
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

      const draftResult = await writeArticleFromResearch(research, gradeDecision, score)
      const draft = draftResult.draft

      if (!draft) {
        summary.rejected += 1
        const writerFailure = formatWriterFailure(draftResult.failure)
        logPipelineEvent(
          'writing',
          'failed',
          score.topic,
          `Rejected: ${score.topic} · Reason: ${writerFailure}`,
          68
        )
        continue
      }

      if (draftResult.usedDeterministicFallback) {
        summary.rejected += 1
        logPipelineEvent(
          'writing',
          'failed',
          score.topic,
          `Rejected: ${score.topic} · Reason: deterministic fallback drafts are not publishable (${formatWriterFailure(draftResult.failure)})`,
          68
        )
        continue
      }

      selectedDraft = draft
      const writerProvider = draftResult.provider ?? 'unknown'
      logPipelineEvent(
        'writing',
        'processing',
        draft.headline,
        `Writing article (${writerProvider}): ${draft.headline}...`,
        72
      )

      if (!runtimeConfig.strictFactCheck) {
        const testingQualityScore = buildTestingQualityScore()
        const article = await createArticleRecord(
          score.topic,
          research,
          draft,
          testingQualityScore,
          gradeDecision.grade,
          pipelineRunId,
          ['Fact-check skipped (strict=false testing mode)'],
          {
            gradeBadgeOverride: TESTING_UNVERIFIED_BADGE,
            verificationStatusOverride: 'unverified',
          }
        )

        await upsertArticlePersistent(article)

        selectedDraft = draft
        selectedQualityScore = testingQualityScore
        selectedArticle = article
        selectedResearch = toPublicResearchBrief(research)
        selectedTopic = score.topic
        summary.published += 1

        logPipelineEvent(
          'publish',
          'completed',
          article.headline,
          `Published (strict=false): ${article.headline} · ${draft.wordCount} words · Grade ${gradeDecision.grade}`,
          100
        )

        break
      }

      logPipelineEvent(
        'quality-gate',
        'processing',
        draft.headline,
        `Fact-checking: ${draft.headline}...`,
        84
      )

      let factCheck = await runFactCheck(draft, research)
      let finalDraft = draft
      let factCheckRetries = 0
      let factCheckAborted = false

      while (!factCheck.pass && factCheckRetries < FACT_CHECK_REWRITE_RETRIES) {
        const rewriteResult = await writeArticleFromResearch(
          research,
          gradeDecision,
          score,
          0,
          factCheck.violations
        )

        const rewrite = rewriteResult.draft

        if (!rewrite) {
          summary.rejected += 1
          const rewriteFailure = formatWriterFailure(rewriteResult.failure)
          logPipelineEvent(
            'quality-gate',
            'failed',
            score.topic,
            `Rejected: ${score.topic} · Reason: Fact-check failed and rewrite was invalid (${rewriteFailure})`
          )
          factCheckAborted = true
          break
        }

        if (rewriteResult.usedDeterministicFallback) {
          summary.rejected += 1
          logPipelineEvent(
            'quality-gate',
            'failed',
            score.topic,
            `Rejected: ${score.topic} · Reason: deterministic fallback rewrite is not publishable (${formatWriterFailure(rewriteResult.failure)})`
          )
          factCheckAborted = true
          break
        }

        finalDraft = rewrite
        selectedDraft = finalDraft
        factCheck = await runFactCheck(finalDraft, research)
        factCheckRetries += 1
      }

      if (factCheckAborted) {
        continue
      }

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

      let qualityGate = await runQualityGate(
        finalDraft,
        research,
        score,
        gradeDecision.grade,
        factCheck
      )

      if (!qualityGate.qualityScore || !qualityGate.qualityScore.publishRecommendation) {
        const qualityRewriteNotes = [
          'Quality gate rejected this draft. Raise factual confidence, reduce sensational framing, and remove unsupported claims.',
          ...(qualityGate.qualityScore?.flaggedClaims ?? []),
        ]

        const qualityRewriteResult = await writeArticleFromResearch(
          research,
          gradeDecision,
          score,
          0,
          qualityRewriteNotes
        )

        const qualityRewriteDraft = qualityRewriteResult.draft
        if (!qualityRewriteDraft) {
          summary.rejected += 1
          logPipelineEvent(
            'quality-gate',
            'failed',
            score.topic,
            `Rejected: ${score.topic} · Reason: ${formatQualityGateFailure(qualityGate)} and rewrite failed (${formatWriterFailure(qualityRewriteResult.failure)})`
          )
          continue
        }

        if (qualityRewriteResult.usedDeterministicFallback) {
          summary.rejected += 1
          logPipelineEvent(
            'quality-gate',
            'failed',
            score.topic,
            `Rejected: ${score.topic} · Reason: quality rewrite used deterministic fallback and is not publishable (${formatWriterFailure(qualityRewriteResult.failure)})`
          )
          continue
        }

        let qualityCheckedDraft = qualityRewriteDraft
        let qualityRewriteFactCheck = await runFactCheck(qualityCheckedDraft, research)
        let qualityFactCheckRetries = 0
        let qualityFactCheckAborted = false

        while (!qualityRewriteFactCheck.pass && qualityFactCheckRetries < FACT_CHECK_REWRITE_RETRIES) {
          const retryRewriteResult = await writeArticleFromResearch(
            research,
            gradeDecision,
            score,
            0,
            qualityRewriteFactCheck.violations
          )

          const retryRewriteDraft = retryRewriteResult.draft
          if (!retryRewriteDraft) {
            summary.rejected += 1
            logPipelineEvent(
              'quality-gate',
              'failed',
              score.topic,
              `Rejected: ${score.topic} · Reason: Quality rewrite fact-check failed and retry rewrite was invalid (${formatWriterFailure(retryRewriteResult.failure)})`
            )
            qualityFactCheckAborted = true
            break
          }

          if (retryRewriteResult.usedDeterministicFallback) {
            summary.rejected += 1
            logPipelineEvent(
              'quality-gate',
              'failed',
              score.topic,
              `Rejected: ${score.topic} · Reason: quality rewrite retry used deterministic fallback and is not publishable (${formatWriterFailure(retryRewriteResult.failure)})`
            )
            qualityFactCheckAborted = true
            break
          }

          qualityCheckedDraft = retryRewriteDraft
          selectedDraft = qualityCheckedDraft
          qualityRewriteFactCheck = await runFactCheck(qualityCheckedDraft, research)
          qualityFactCheckRetries += 1
        }

        if (qualityFactCheckAborted) {
          continue
        }

        if (!qualityRewriteFactCheck.pass) {
          summary.rejected += 1
          const reason =
            qualityRewriteFactCheck.violations.join('; ') ||
            'Critical fact-check failure after quality rewrite'
          logPipelineEvent(
            'quality-gate',
            'failed',
            score.topic,
            `Rejected: ${score.topic} · Reason: ${reason}`
          )
          continue
        }

        qualityGate = await runQualityGate(
          qualityCheckedDraft,
          research,
          score,
          gradeDecision.grade,
          qualityRewriteFactCheck
        )

        if (!qualityGate.qualityScore || !qualityGate.qualityScore.publishRecommendation) {
          summary.rejected += 1
          logPipelineEvent(
            'quality-gate',
            'failed',
            score.topic,
            `Rejected: ${score.topic} · Reason: ${formatQualityGateFailure(qualityGate)}`
          )
          continue
        }

        finalDraft = qualityCheckedDraft
        factCheck = qualityRewriteFactCheck
        selectedDraft = finalDraft
      }

      const qualityScore = qualityGate.qualityScore
      if (!qualityScore) {
        summary.rejected += 1
        logPipelineEvent(
          'quality-gate',
          'failed',
          score.topic,
          `Rejected: ${score.topic} · Reason: quality gate unavailable`
        )
        continue
      }

      const article = await createArticleRecord(
        score.topic,
        research,
        finalDraft,
        qualityScore,
        gradeDecision.grade,
        pipelineRunId,
        factCheck.warnings,
        {
          gradeBadgeOverride,
        }
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
