export type ArticleCategory = 'World' | 'Tech' | 'Business' | 'Science'

export type ConfidenceLevel = 'confirmed' | 'reported' | 'alleged'

export type PipelineStage =
  | 'trend-intake'
  | 'research'
  | 'writing'
  | 'quality-gate'
  | 'publish'

export type PipelineStatus = 'idle' | 'running' | 'degraded'

export interface TrendTopic {
  id: string
  topic: string
  category: ArticleCategory
  score: number
  summary: string
  source: string
  sourceUrl?: string
  publishedAt: string
}

export interface ResearchSource {
  name: string
  url: string
  credibilityNotes: string
}

export interface KeyFact {
  fact: string
  source: string
  confidence: ConfidenceLevel
}

export interface TimelineEntry {
  date: string
  event: string
}

export interface ConflictingClaim {
  claim: string
  source: string
  counterclaim: string
  counterSource: string
}

export interface ResearchBrief {
  topic: string
  category: ArticleCategory
  sources: ResearchSource[]
  keyFacts: KeyFact[]
  namedSources: string[]
  timeline: TimelineEntry[]
  conflictingClaims: ConflictingClaim[]
  backgroundContext: string
}

export interface ArticleDraft {
  headline: string
  subheadline: string
  lede: string
  body: string
  category: ArticleCategory
  tags: string[]
}

export interface QualityScore {
  sourceDiversity: number
  sensationalism: number
  factualConfidence: number
  ledeStrength: number
  overallScore: number
  flaggedClaims: string[]
  publishRecommendation: boolean
}

export interface ArticleSource {
  id: string
  name: string
  url: string
  reliability: 'high' | 'medium' | 'low'
  excerpt: string
  publishedAt: string
}

export type ArticleGrade = 'A' | 'B' | 'C'

export interface PublishedArticle {
  id: string
  topic: string
  headline: string
  subheadline: string
  lede: string
  body: string
  imageUrl?: string
  imageCredit?: string
  category: ArticleCategory
  tags: string[]
  sources: ArticleSource[]
  readingTime: number
  publishedAt: string
  qualityScore: QualityScore
  verificationStatus: 'verified' | 'pending' | 'unverified'
  grade?: ArticleGrade
  gradeBadge?: string
  wordCount?: number
  qualityScoreValue?: number
  whatWeDoNotKnow?: string
  whatHappensNext?: string
  pipelineRunId?: string
  factCheckWarnings?: string[]
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
  recentEvents: PipelineEvent[]
}

export interface GenerateStoryInput {
  topic?: string
  strict?: boolean
}

export interface QaRequestBody {
  articleId: string
  question: string
}
