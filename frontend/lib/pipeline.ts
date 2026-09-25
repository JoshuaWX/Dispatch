import { createHash } from 'node:crypto'
import { z } from 'zod'
import { getDomain } from 'tldts'
import type {
  ArticleDraft,
  ArticleSource,
  ModelUsage,
  PipelineReason,
  PipelineRunInput,
  PipelineRunResult,
  PublishedArticle,
  StoryKind,
  TrendTopic,
  VerificationResult,
} from '@/lib/dispatch-types'
import { isLikelyArticleUrl } from '@/lib/news-provider-utils'
import { GEMINI_DRAFT_LIMITS, GEMINI_VERIFICATION_LIMITS, maximumModelCostUsd } from '@/lib/gemini-pricing'

const MIN_DEVELOPING_SOURCES = 2
const MAX_SOURCE_AGE_MS = 72 * 60 * 60 * 1000
const MAX_PUBLISHES_PER_DAY = 4
const DRAFT_RESERVATION_USD = maximumModelCostUsd(GEMINI_DRAFT_LIMITS)
const VERIFICATION_RESERVATION_USD = maximumModelCostUsd(GEMINI_VERIFICATION_LIMITS)

export class ModelContentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelContentError'
  }
}

export class RetryableModelError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RetryableModelError'
  }
}
const BANNED_PHRASES = [
  'you won\'t believe', 'shocking', 'game changer', 'game-changing', 'breaks the internet',
  'unprecedented breakthrough', 'guaranteed', 'definitely proves', 'the truth they hide',
]

export const articleDraftSchema = z.object({
  headline: z.string().trim().min(12).max(180),
  subheadline: z.string().trim().min(12).max(280),
  lede: z.string().trim().min(20).max(600),
  body: z.string().trim().min(100).max(18_000),
  category: z.enum(['World', 'Tech', 'Business', 'Science']),
  tags: z.array(z.string().trim().min(2).max(40)).min(1).max(8),
  claims: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    text: z.string().trim().min(10).max(600),
    sourceIds: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
  })).min(3).max(20),
  whatWeDoNotKnow: z.string().trim().min(10).max(1_200),
  whatHappensNext: z.string().trim().min(10).max(1_200),
})

export const verificationSchema = z.object({
  sourceDiversity: z.number().min(0).max(10),
  factualConfidence: z.number().min(0).max(10),
  overallScore: z.number().min(0).max(10),
  flags: z.array(z.string().trim().min(1).max(400)).max(30),
  unsupportedClaims: z.array(z.string().trim().min(1).max(600)).max(30),
  overstatement: z.boolean(),
  conflicts: z.boolean(),
})

type ModelResponse<T> = T | { value: T; usage: ModelUsage }

export interface PipelineDependencies {
  clock: { now(): Date }
  ids: { create(): string }
  topics: { next(topicOverride?: string): Promise<TrendTopic | null> }
  research: { collect(topic: TrendTopic): Promise<ArticleSource[]> }
  model: {
    draft(topic: TrendTopic, sources: ArticleSource[]): Promise<ModelResponse<ArticleDraft>>
    verify(topic: TrendTopic, sources: ArticleSource[], draft: ArticleDraft): Promise<ModelResponse<VerificationResult>>
  }
  repository: {
    claimRun(input: PipelineRunInput & { runId: string }): Promise<{
      acquired: boolean
      runId: string
      existingResult?: PipelineRunResult
    }>
    getControl(): Promise<{ publishingEnabled: boolean }>
    reserveBudget(input: { runId: string; amountUsd: number; monthKey: string; dayKey: string }): Promise<{
      reserved: boolean
      reservationId?: string
    }>
    settleBudget(input: {
      reservationId: string
      actualUsd: number
      inputTokens: number
      outputTokens: number
    }): Promise<void>
    countPublishedToday(dayKey: string): Promise<number>
    publishAndFinish(input: {
      article: PublishedArticle
      idempotencyKey: string
      topicFingerprint: string
      dayKey: string
      result: PipelineRunResult
    }): Promise<{ articleId: string }>
    finishRun(input: { runId: string; result: PipelineRunResult }): Promise<void>
  }
}

function unwrap<T>(response: ModelResponse<T>): { value: T; usage: ModelUsage } {
  if (response && typeof response === 'object' && 'value' in response && 'usage' in response) {
    return response as { value: T; usage: ModelUsage }
  }
  return { value: response as T, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }
}

function sourceDomain(url: string) {
  try {
    return getDomain(new URL(url).hostname, { allowPrivateDomains: false })?.toLowerCase() ?? ''
  } catch {
    return ''
  }
}

function uniqueValidSources(sources: ArticleSource[]) {
  const seen = new Set<string>()
  return sources.filter((source) => {
    const domain = sourceDomain(source.url)
    if (!domain || source.domain !== domain || !isLikelyArticleUrl(source.url) || !source.excerpt.trim() || !source.contentHash.trim() ||
        !source.organisationId?.trim() || !source.upstreamOriginId?.trim() || !source.licenceId ||
        !source.licenceUrl?.startsWith('https://') || !source.licenceEvidence?.trim() ||
        !source.attribution?.trim() || !source.discoveryUrl?.startsWith('https://')) return false
    const normalized = source.url.replace(/#.*$/, '').replace(/\/$/, '')
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function evidenceFailure(sources: ArticleSource[], now: Date, storyKind: StoryKind): PipelineReason | null {
  if (sources.length < (storyKind === 'official_announcement' ? 1 : MIN_DEVELOPING_SOURCES)) return 'insufficient_sources'
  if (storyKind === 'official_announcement' && !sources.some((source) => source.isPrimary && source.reliability === 'high')) {
    return 'missing_high_reliability_source'
  }
  if (storyKind === 'developing' &&
      (new Set(sources.map((source) => source.organisationId)).size < 2 ||
       new Set(sources.map((source) => source.upstreamOriginId)).size < 2)) return 'insufficient_source_diversity'
  const recent = sources.filter((source) => {
    const timestamp = Date.parse(source.publishedAt)
    return Number.isFinite(timestamp) && now.getTime() - timestamp >= 0 && now.getTime() - timestamp <= MAX_SOURCE_AGE_MS
  })
  if (recent.length < (storyKind === 'official_announcement' ? 1 : 2)) return 'insufficient_recent_sources'
  if (!sources.some((source) => source.reliability === 'high')) return 'missing_high_reliability_source'
  return null
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function draftFailure(draft: ArticleDraft, sources: ArticleSource[], storyKind: StoryKind): PipelineReason | null {
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  if (draft.claims.length < 3) return 'insufficient_material_claims'
  if (draft.claims.some((claim) => claim.sourceIds.length === 0 || claim.sourceIds.some((id) => !sourceById.has(id)))) {
    return 'invalid_claim_sources'
  }
  if (storyKind === 'developing') {
    const corroborated = draft.claims.some((claim) => {
      const organisations = new Set(claim.sourceIds.map((id) => sourceById.get(id)?.organisationId).filter(Boolean))
      const origins = new Set(claim.sourceIds.map((id) => sourceById.get(id)?.upstreamOriginId).filter(Boolean))
      return organisations.size >= 2 && origins.size >= 2
    })
    if (!corroborated) return 'missing_independent_corroboration'
  }

  const fullText = `${draft.headline} ${draft.subheadline} ${draft.lede} ${draft.body}`
  const normalized = normalizeText(fullText)
  if (BANNED_PHRASES.some((phrase) => normalized.includes(normalizeText(phrase)))) return 'banned_language'
  const sentences = fullText.split(/[.!?]+/).map(normalizeText).filter((sentence) => sentence.length >= 45)
  if (new Set(sentences).size !== sentences.length) return 'duplicated_passages'
  const evidenceNumbers = new Set(sources.flatMap((source) => source.excerpt.match(/\b\d+(?:[.,]\d+)*%?\b/g) ?? []))
  const articleNumbers = fullText.match(/\b\d+(?:[.,]\d+)*%?\b/g) ?? []
  if (articleNumbers.some((number) => !evidenceNumbers.has(number))) return 'unsupported_numbers'
  return null
}

function verificationFailure(verification: VerificationResult, storyKind: StoryKind): PipelineReason | null {
  if (verification.flags.length > 0 || verification.unsupportedClaims.length > 0) return 'verification_flags'
  if (verification.overstatement) return 'headline_overstatement'
  if (verification.conflicts) return 'unresolved_conflicts'
  if (verification.overallScore < 7) return 'overall_score_below_threshold'
  if (verification.factualConfidence < 8) return 'factual_confidence_below_threshold'
  if (storyKind === 'developing' && verification.sourceDiversity < 7) return 'source_diversity_below_threshold'
  return null
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function topicFingerprint(topic: string) {
  return createHash('sha256').update(normalizeText(topic), 'utf8').digest('hex')
}

export function createPipeline(dependencies: PipelineDependencies) {
  async function callModelWithBudget<T>(input: {
    runId: string
    amountUsd: number
    monthKey: string
    dayKey: string
    call: () => Promise<ModelResponse<T>>
    validate?: (value: T) => boolean
  }): Promise<
    | { status: 'ok'; response: { value: T; usage: ModelUsage } }
    | { status: 'budget_exhausted' | 'invalid_content' | 'unavailable' }
  > {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reservation = await dependencies.repository.reserveBudget({
        runId: input.runId,
        amountUsd: input.amountUsd,
        monthKey: input.monthKey,
        dayKey: input.dayKey,
      })
      if (!reservation.reserved || !reservation.reservationId) return { status: 'budget_exhausted' }

      try {
        const response = unwrap(await input.call())
        await dependencies.repository.settleBudget({
          reservationId: reservation.reservationId,
          actualUsd: response.usage.costUsd,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        })
        // Gemini is asked for JSON Schema output, but a model response can still
        // fail our stricter editorial schema. Give it one fresh, budget-reserved
        // opportunity to produce valid structure; content still goes through all
        // evidence and independent verification gates below.
        if (input.validate && !input.validate(response.value)) {
          if (attempt === 0) continue
          return { status: 'invalid_content' }
        }
        return { status: 'ok', response }
      } catch (error) {
        // Provider errors may not include usage, so settle the full reservation. This
        // conservatively accounts for a possibly billable failed attempt.
        await dependencies.repository.settleBudget({
          reservationId: reservation.reservationId,
          actualUsd: input.amountUsd,
          inputTokens: 0,
          outputTokens: 0,
        })
        if (error instanceof ModelContentError) {
          if (attempt === 0) continue
          return { status: 'invalid_content' }
        }
        if (!(error instanceof RetryableModelError) || attempt === 1) return { status: 'unavailable' }
      }
    }
    return { status: 'unavailable' }
  }

  async function runPipeline(input: PipelineRunInput): Promise<PipelineRunResult> {
    const runId = dependencies.ids.create()
    const claim = await dependencies.repository.claimRun({ ...input, runId })
    if (!claim.acquired) {
      return claim.existingResult ?? { status: 'skipped', runId: claim.runId, reason: 'duplicate_run' }
    }

    const finish = async (result: PipelineRunResult) => {
      await dependencies.repository.finishRun({ runId: claim.runId, result })
      return result
    }

    try {
      const now = dependencies.clock.now()
      const dayKey = now.toISOString().slice(0, 10)
      const monthKey = dayKey.slice(0, 7)
      const control = await dependencies.repository.getControl()
      if (!control.publishingEnabled) return finish({ status: 'skipped', runId: claim.runId, reason: 'publishing_paused' })
      if (await dependencies.repository.countPublishedToday(dayKey) >= MAX_PUBLISHES_PER_DAY) {
        return finish({ status: 'skipped', runId: claim.runId, reason: 'daily_publication_limit' })
      }

      const topic = await dependencies.topics.next(input.topic)
      if (!topic) return finish({ status: 'skipped', runId: claim.runId, reason: 'no_eligible_topic' })
      const storyKind = topic.storyKind ?? 'developing'
      const sources = uniqueValidSources(await dependencies.research.collect(topic))
      const sourceFailure = evidenceFailure(sources, now, storyKind)
      if (sourceFailure) return finish({ status: 'rejected', runId: claim.runId, topic: topic.topic, reason: sourceFailure })

      const drafted = await callModelWithBudget({
        runId: claim.runId,
        amountUsd: DRAFT_RESERVATION_USD,
        monthKey,
        dayKey,
        call: () => dependencies.model.draft(topic, sources),
        validate: (value) => articleDraftSchema.safeParse(value).success,
      })
      if (drafted.status === 'budget_exhausted') {
        return finish({ status: 'skipped', runId: claim.runId, topic: topic.topic, reason: 'budget_exhausted' })
      }
      if (drafted.status !== 'ok') {
        return finish({
          status: drafted.status === 'invalid_content' ? 'rejected' : 'failed',
          runId: claim.runId,
          topic: topic.topic,
          reason: drafted.status === 'invalid_content' ? 'invalid_model_output' : 'model_unavailable',
        })
      }
      const parsedDraft = articleDraftSchema.safeParse(drafted.response.value)
      if (!parsedDraft.success) return finish({ status: 'rejected', runId: claim.runId, topic: topic.topic, reason: 'invalid_model_output' })
      const draft = parsedDraft.data
      const localFailure = draftFailure(draft, sources, storyKind)
      if (localFailure) return finish({ status: 'rejected', runId: claim.runId, topic: topic.topic, reason: localFailure })

      const verified = await callModelWithBudget({
        runId: claim.runId,
        amountUsd: VERIFICATION_RESERVATION_USD,
        monthKey,
        dayKey,
        call: () => dependencies.model.verify(topic, sources, draft),
        validate: (value) => verificationSchema.safeParse(value).success,
      })
      if (verified.status === 'budget_exhausted') {
        return finish({ status: 'skipped', runId: claim.runId, topic: topic.topic, reason: 'budget_exhausted' })
      }
      if (verified.status !== 'ok') {
        return finish({
          status: verified.status === 'invalid_content' ? 'rejected' : 'failed',
          runId: claim.runId,
          topic: topic.topic,
          reason: verified.status === 'invalid_content' ? 'invalid_verification_output' : 'model_unavailable',
        })
      }
      const parsedVerification = verificationSchema.safeParse(verified.response.value)
      if (!parsedVerification.success) return finish({ status: 'rejected', runId: claim.runId, topic: topic.topic, reason: 'invalid_verification_output' })
      const verification = parsedVerification.data
      const gateFailure = verificationFailure(verification, storyKind)
      if (gateFailure) return finish({ status: 'rejected', runId: claim.runId, topic: topic.topic, reason: gateFailure })

      const wordCount = countWords(draft.body)
      const article: PublishedArticle = {
        id: dependencies.ids.create(), topic: topic.topic, storyKind, ...draft, sources,
        readingTime: Math.max(1, Math.ceil(wordCount / 220)), publishedAt: now.toISOString(),
        qualityScore: {
          sourceDiversity: verification.sourceDiversity, factualConfidence: verification.factualConfidence,
          overallScore: verification.overallScore, flaggedClaims: [], publishRecommendation: true,
        },
        publicationStatus: 'published', verificationStatus: 'passed', format: wordCount < 700 ? 'brief' : 'article',
        grade: 'A', wordCount, pipelineRunId: claim.runId, factCheckWarnings: [],
        trendScore: evidenceVelocity(sources, now, verification.overallScore), viewCount: 0,
      }
      try {
        const result: PipelineRunResult = {
          status: 'published', runId: claim.runId, articleId: article.id, topic: topic.topic,
        }
        const published = await dependencies.repository.publishAndFinish({
          article, idempotencyKey: input.idempotencyKey,
          topicFingerprint: topicFingerprint(topic.topic), dayKey, result,
        })
        return { ...result, articleId: published.articleId }
      } catch {
        return finish({ status: 'failed', runId: claim.runId, topic: topic.topic, reason: 'persistence_failed' })
      }
    } catch {
      return finish({ status: 'failed', runId: claim.runId, reason: 'pipeline_error' })
    }
  }

  return { runPipeline }
}

export async function runPipeline(input: PipelineRunInput) {
  const { createProductionDependencies } = await import('@/lib/pipeline-production')
  return createPipeline(createProductionDependencies()).runPipeline(input)
}

function evidenceVelocity(sources: ArticleSource[], now: Date, verificationScore: number) {
  const recent = sources.filter((source) => {
    const timestamp = Date.parse(source.publishedAt)
    return Number.isFinite(timestamp) && now.getTime() - timestamp >= 0 && now.getTime() - timestamp <= MAX_SOURCE_AGE_MS
  }).length
  const domains = new Set(sources.map((source) => sourceDomain(source.url)).filter(Boolean)).size
  return recent * 10 + domains * 5 + verificationScore * 3
}
