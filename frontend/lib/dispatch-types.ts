export const ARTICLE_CATEGORIES = ['World', 'Tech', 'Business', 'Science'] as const
export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number]
export type PublicationStatus = 'draft' | 'published' | 'quarantined' | 'retracted'
export type VerificationStatus = 'pending' | 'passed' | 'failed'
export type ArticleFormat = 'brief' | 'article'
export type ArticleGrade = 'A' | 'B' | 'C'
export type Reliability = 'high' | 'medium' | 'low'
export type PipelineTrigger = 'scheduled' | 'manual'
export type PipelineStage = 'trend-intake' | 'research' | 'writing' | 'quality-gate' | 'publish'
export type PipelineStatus = 'idle' | 'running' | 'degraded' | 'paused'
export type StoryKind = 'official_announcement' | 'developing'
export type EvidenceLicence = 'OGL-3.0' | 'CC-BY-4.0' | 'US-PD'

export interface TrendTopic {
  topic: string
  category: ArticleCategory
  score: number
  storyKind?: StoryKind
  sourceUrl?: string
}

export interface ArticleSource {
  id: string
  name: string
  url: string
  domain: string
  reliability: Reliability
  excerpt: string
  publishedAt: string
  contentHash: string
  organisationId?: string
  upstreamOriginId?: string
  isPrimary?: boolean
  licenceId?: EvidenceLicence
  licenceUrl?: string
  licenceEvidence?: string
  attribution?: string
  discoveryUrl?: string
  retrievedAt?: string
  rightsCheckedAt?: string
  updatedAt?: string
}

export interface MaterialClaim {
  id: string
  text: string
  sourceIds: string[]
}

export interface ArticleDraft {
  headline: string
  subheadline: string
  lede: string
  body: string
  category: ArticleCategory
  tags: string[]
  claims: MaterialClaim[]
  whatWeDoNotKnow: string
  whatHappensNext: string
}

export interface VerificationResult {
  sourceDiversity: number
  factualConfidence: number
  overallScore: number
  flags: string[]
  unsupportedClaims: string[]
  overstatement: boolean
  conflicts: boolean
}

export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export interface QualityScore {
  sourceDiversity: number
  factualConfidence: number
  overallScore: number
  flaggedClaims: string[]
  publishRecommendation: boolean
}

export interface PublishedArticle {
  id: string
  topic: string
  storyKind?: StoryKind
  headline: string
  subheadline: string
  lede: string
  body: string
  imageUrl?: string
  imageCredit?: string
  category: ArticleCategory
  tags: string[]
  sources: ArticleSource[]
  claims: MaterialClaim[]
  readingTime: number
  publishedAt: string
  qualityScore: QualityScore
  publicationStatus: PublicationStatus
  verificationStatus: VerificationStatus
  format: ArticleFormat
  grade: ArticleGrade
  wordCount: number
  whatWeDoNotKnow: string
  whatHappensNext: string
  pipelineRunId: string
  factCheckWarnings: string[]
  trendScore: number
  viewCount: number
}

export interface ArticleSummary {
  id: string
  topic: string
  headline: string
  subheadline: string
  lede: string
  category: ArticleCategory
  tags: string[]
  readingTime: number
  publishedAt: string
  qualityScore: QualityScore
  format: ArticleFormat
  grade: ArticleGrade
  trendScore: number
  viewCount: number
  evidenceCount: number
}

export interface ArticlePage {
  articles: ArticleSummary[]
  count: number
  nextCursor: string | null
  facets: Array<{ category: ArticleCategory; count: number }>
}

export interface PipelineRunInput {
  trigger: PipelineTrigger
  topic?: string
  idempotencyKey: string
  requestId?: string
}

export type PipelineReason =
  | 'banned_language'
  | 'budget_exhausted'
  | 'concurrent_run'
  | 'daily_publication_limit'
  | 'duplicate_run'
  | 'duplicated_passages'
  | 'factual_confidence_below_threshold'
  | 'headline_overstatement'
  | 'insufficient_material_claims'
  | 'insufficient_recent_sources'
  | 'insufficient_source_diversity'
  | 'insufficient_sources'
  | 'invalid_claim_sources'
  | 'invalid_model_output'
  | 'invalid_verification_output'
  | 'missing_high_reliability_source'
  | 'missing_independent_corroboration'
  | 'model_unavailable'
  | 'no_eligible_topic'
  | 'overall_score_below_threshold'
  | 'persistence_failed'
  | 'pipeline_error'
  | 'publishing_paused'
  | 'source_diversity_below_threshold'
  | 'unresolved_conflicts'
  | 'unsupported_numbers'
  | 'verification_flags'

export type PipelineRunResult = {
  status: 'published' | 'rejected' | 'skipped' | 'failed'
  runId: string
  articleId?: string
  topic?: string
  reason?: PipelineReason
}

export interface PipelineEvent {
  id: string
  timestamp: string
  stage: PipelineStage
  status: 'pending' | 'processing' | 'completed' | 'failed'
  articleTitle: string
  details: string
}

export interface PipelineSnapshot {
  status: PipelineStatus
  stage: PipelineStage | 'idle'
  activeTopic: string | null
  progress: number
  lastRunAt: string | null
  lastSuccessAt: string | null
  message: string
  updatedAt: string
}
