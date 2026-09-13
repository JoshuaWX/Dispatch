import 'server-only'

import { z } from 'zod'
import type { ArticlePage, ArticleSource, ArticleSummary, MaterialClaim, PublishedArticle } from '@/lib/dispatch-types'
import { ARTICLE_CATEGORIES } from '@/lib/dispatch-types'
import { getServiceSupabase } from '@/lib/supabase-server'

const cursorSchema = z.object({
  publishedAt: z.string().datetime(),
  id: z.string().uuid(),
  score: z.number().finite().optional(),
})

export type ArticleListInput = {
  category?: string | null
  q?: string | null
  sort?: string | null
  cursor?: string | null
  limit?: number
}

function decodeCursor(value?: string | null) {
  if (!value) return null
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')))
  } catch {
    throw new Error('invalid_cursor')
  }
}

function encodeCursor(value: z.infer<typeof cursorSchema>) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function toSummary(row: Record<string, unknown>): ArticleSummary {
  return {
    id: String(row.id),
    topic: String(row.topic),
    headline: String(row.headline),
    subheadline: String(row.subheadline),
    lede: String(row.lede),
    category: row.category as ArticleSummary['category'],
    tags: Array.isArray(row.tags) ? row.tags.filter((item): item is string => typeof item === 'string') : [],
    readingTime: Number(row.reading_time),
    publishedAt: String(row.published_at),
    qualityScore: row.quality_score as ArticleSummary['qualityScore'],
    format: row.article_format as ArticleSummary['format'],
    grade: row.grade as ArticleSummary['grade'],
    trendScore: Number(row.calculated_trending_score ?? row.trend_score ?? 0),
    viewCount: Number(row.view_count ?? 0),
    evidenceCount: Number(row.source_count ?? 0),
  }
}

export async function listPublicArticles(input: ArticleListInput = {}): Promise<ArticlePage> {
  const db = getServiceSupabase()
  const limit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 24)))
  const sort = input.sort === 'trending' ? 'trending' : 'recent'
  const category = ARTICLE_CATEGORIES.find((item) => item.toLowerCase() === input.category?.toLowerCase())
  const queryText = input.q?.trim().slice(0, 200)
  const cursor = decodeCursor(input.cursor)
  const fields = 'id,topic,headline,subheadline,lede,category,tags,reading_time,published_at,quality_score,article_format,grade,trend_score,calculated_trending_score,view_count,source_count'

  let query = db.from('dispatch_public_articles').select(fields, { count: 'exact' })
  if (category) query = query.eq('category', category)
  if (queryText) query = query.textSearch('search_document', queryText, { config: 'english', type: 'websearch' })

  if (sort === 'trending') {
    query = query.order('calculated_trending_score', { ascending: false })
      .order('published_at', { ascending: false }).order('id', { ascending: false })
    if (cursor?.score !== undefined) {
      query = query.or(`calculated_trending_score.lt.${cursor.score},and(calculated_trending_score.eq.${cursor.score},published_at.lt.${cursor.publishedAt}),and(calculated_trending_score.eq.${cursor.score},published_at.eq.${cursor.publishedAt},id.lt.${cursor.id})`)
    }
  } else {
    query = query.order('published_at', { ascending: false }).order('id', { ascending: false })
    if (cursor) query = query.or(`published_at.lt.${cursor.publishedAt},and(published_at.eq.${cursor.publishedAt},id.lt.${cursor.id})`)
  }

  const [{ data, error, count }, facetsResult] = await Promise.all([
    query.limit(limit + 1),
    db.rpc('dispatch_public_article_facets', { p_query: queryText || null }),
  ])
  if (error || facetsResult.error || !Array.isArray(data) || !Array.isArray(facetsResult.data)) {
    throw new Error('articles_unavailable')
  }

  const hasMore = data.length > limit
  const rows = hasMore ? data.slice(0, limit) : data
  const articles = rows.map((row) => toSummary(row as Record<string, unknown>))
  const last = rows.at(-1) as Record<string, unknown> | undefined
  const nextCursor = hasMore && last ? encodeCursor({
    publishedAt: String(last.published_at),
    id: String(last.id),
    ...(sort === 'trending' ? { score: Number(last.calculated_trending_score) } : {}),
  }) : null
  const facetCounts = new Map<string, number>()
  for (const row of facetsResult.data) facetCounts.set(row.category, Number(row.article_count))

  return {
    articles,
    count: count ?? articles.length,
    nextCursor,
    facets: ARTICLE_CATEGORIES.map((item) => ({ category: item, count: facetCounts.get(item) ?? 0 })),
  }
}

export async function getPublicArticle(id: string): Promise<PublishedArticle | null> {
  if (!z.string().uuid().safeParse(id).success) return null
  const db = getServiceSupabase()
  const { data, error } = await db.from('dispatch_articles').select('*').eq('id', id)
    .eq('publication_status', 'published').eq('verification_status', 'passed').maybeSingle()
  if (error) throw new Error('article_unavailable')
  if (!data) return null

  const [{ data: sourceRows, error: sourceError }, { data: claimRows, error: claimError }, { data: mapRows, error: mapError }] = await Promise.all([
    db.from('dispatch_article_sources').select('*').eq('article_id', id).order('source_id'),
    db.from('dispatch_material_claims').select('*').eq('article_id', id).order('claim_id'),
    db.from('dispatch_claim_sources').select('claim_id,source_id').eq('article_id', id),
  ])
  if (sourceError || claimError || mapError) throw new Error('article_evidence_unavailable')
  const sources: ArticleSource[] = (sourceRows ?? []).map((row) => ({
    id: row.source_id, name: row.publisher_name, url: row.source_url,
    domain: row.source_domain,
    reliability: row.reliability, excerpt: row.excerpt,
    contentHash: row.content_hash, publishedAt: row.published_at,
  }))
  const claims: MaterialClaim[] = (claimRows ?? []).map((row) => ({
    id: row.claim_id,
    text: row.claim_text,
    sourceIds: (mapRows ?? []).filter((mapping) => mapping.claim_id === row.claim_id).map((mapping) => mapping.source_id),
  }))

  return {
    id: data.id, topic: data.topic, headline: data.headline, subheadline: data.subheadline,
    lede: data.lede, body: data.body, category: data.category, tags: data.tags ?? [],
    sources, claims, readingTime: data.reading_time, publishedAt: data.published_at,
    qualityScore: data.quality_score, publicationStatus: data.publication_status,
    verificationStatus: data.verification_status, format: data.article_format, grade: data.grade,
    wordCount: data.word_count, whatWeDoNotKnow: data.what_we_do_not_know,
    whatHappensNext: data.what_happens_next, pipelineRunId: data.pipeline_run_id,
    factCheckWarnings: data.fact_check_warnings ?? [], trendScore: Number(data.trend_score),
    viewCount: Number(data.view_count),
  }
}
