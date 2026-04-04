import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PipelineEvent, PipelineSnapshot, PublishedArticle } from '@/lib/dispatch-types'

type DispatchStore = {
  articles: PublishedArticle[]
  events: PipelineEvent[]
  pipeline: PipelineSnapshot
}

type ArticleRow = {
  id: string
  topic: string
  headline: string
  subheadline: string
  lede: string
  body: string
  image_url: string | null
  image_credit: string | null
  category: PublishedArticle['category']
  tags: PublishedArticle['tags']
  sources: PublishedArticle['sources']
  reading_time: number
  published_at: string
  quality_score: PublishedArticle['qualityScore']
  verification_status: PublishedArticle['verificationStatus']
  created_at?: string
}

const PERSISTENCE_DIR = path.join(process.cwd(), '.dispatch-data')
const PERSISTENCE_FILE = path.join(PERSISTENCE_DIR, 'articles.json')
const SUPABASE_ARTICLES_TABLE = 'dispatch_articles'

const globalForSupabase = globalThis as typeof globalThis & {
  __dispatchSupabaseClient?: SupabaseClient
}

function hasSupabaseConfig() {
  return Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  )
}

function getSupabaseClient() {
  if (!hasSupabaseConfig()) {
    return null
  }

  if (!globalForSupabase.__dispatchSupabaseClient) {
    globalForSupabase.__dispatchSupabaseClient = createClient(
      process.env.SUPABASE_URL!.trim(),
      process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )
  }

  return globalForSupabase.__dispatchSupabaseClient
}

function articleToRow(article: PublishedArticle): ArticleRow {
  return {
    id: article.id,
    topic: article.topic,
    headline: article.headline,
    subheadline: article.subheadline,
    lede: article.lede,
    body: article.body,
    image_url: article.imageUrl ?? null,
    image_credit: article.imageCredit ?? null,
    category: article.category,
    tags: article.tags,
    sources: article.sources,
    reading_time: article.readingTime,
    published_at: article.publishedAt,
    quality_score: article.qualityScore,
    verification_status: article.verificationStatus,
  }
}

function rowToArticle(row: ArticleRow): PublishedArticle {
  return {
    id: row.id,
    topic: row.topic,
    headline: row.headline,
    subheadline: row.subheadline,
    lede: row.lede,
    body: row.body,
    imageUrl: row.image_url ?? undefined,
    imageCredit: row.image_credit ?? undefined,
    category: row.category,
    tags: Array.isArray(row.tags) ? row.tags : [],
    sources: Array.isArray(row.sources) ? row.sources : [],
    readingTime: row.reading_time,
    publishedAt: row.published_at,
    qualityScore: row.quality_score,
    verificationStatus: row.verification_status,
  }
}

function isPublishedArticle(value: unknown): value is PublishedArticle {
  if (!value || typeof value !== 'object') {
    return false
  }

  const article = value as Partial<PublishedArticle>
  return (
    typeof article.id === 'string' &&
    typeof article.topic === 'string' &&
    typeof article.headline === 'string' &&
    typeof article.body === 'string' &&
    typeof article.publishedAt === 'string'
  )
}

function loadPersistedArticles(): PublishedArticle[] {
  try {
    const raw = readFileSync(PERSISTENCE_FILE, 'utf8')
    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(isPublishedArticle)
  } catch {
    return []
  }
}

function persistArticles(articles: PublishedArticle[]) {
  try {
    mkdirSync(PERSISTENCE_DIR, { recursive: true })
    writeFileSync(PERSISTENCE_FILE, JSON.stringify(articles, null, 2), 'utf8')
  } catch (error) {
    console.warn('Unable to persist articles to disk:', error)
  }
}

const createInitialState = (): DispatchStore => ({
  articles: loadPersistedArticles(),
  events: [],
  pipeline: {
    status: 'idle',
    stage: 'idle',
    activeTopic: null,
    progress: 0,
    lastRunAt: null,
    lastSuccessAt: null,
    message: 'Ready to process the next trending story.',
    recentEvents: [],
  },
})

const globalForDispatch = globalThis as typeof globalThis & {
  __dispatchStore?: DispatchStore
}

const store = globalForDispatch.__dispatchStore ?? createInitialState()

if (!globalForDispatch.__dispatchStore) {
  globalForDispatch.__dispatchStore = store
}

const trimEvents = (events: PipelineEvent[]) => events.slice(-25)
const DUPLICATE_WINDOW_MS = 12 * 60 * 60 * 1000

function normalizeForCompare(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function listArticles() {
  return [...store.articles].sort(
    (left, right) =>
      new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()
  )
}

export function getArticleById(id: string) {
  return store.articles.find((article) => article.id === id) ?? null
}

export function upsertArticle(article: PublishedArticle) {
  const index = store.articles.findIndex((existing) => existing.id === article.id)
  if (index >= 0) {
    store.articles[index] = article
    persistArticles(store.articles)
    return article
  }

  const topicKey = normalizeForCompare(article.topic)
  const headlineKey = normalizeForCompare(article.headline)
  const now = new Date(article.publishedAt).getTime()

  const duplicateIndex = store.articles.findIndex((existing) => {
    const existingTime = new Date(existing.publishedAt).getTime()
    if (!Number.isFinite(existingTime) || now - existingTime > DUPLICATE_WINDOW_MS) {
      return false
    }

    const sameTopic = normalizeForCompare(existing.topic) === topicKey
    const sameHeadline = normalizeForCompare(existing.headline) === headlineKey
    return sameTopic || sameHeadline
  })

  if (duplicateIndex >= 0) {
    const existing = store.articles[duplicateIndex]
    const merged = {
      ...article,
      id: existing.id,
    }
    store.articles[duplicateIndex] = merged
    persistArticles(store.articles)
    return merged
  }

  store.articles.unshift(article)
  persistArticles(store.articles)
  return article
}

export function listRecentEvents() {
  return [...store.events].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  )
}

export function recordPipelineEvent(event: Omit<PipelineEvent, 'id' | 'timestamp'>) {
  const nextEvent: PipelineEvent = {
    ...event,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  }

  store.events = trimEvents([...store.events, nextEvent])
  store.pipeline.recentEvents = store.events
  return nextEvent
}

export function setPipelineState(update: Partial<PipelineSnapshot>) {
  store.pipeline = {
    ...store.pipeline,
    ...update,
    recentEvents: store.events,
  }
  return store.pipeline
}

export function getPipelineSnapshot() {
  return {
    ...store.pipeline,
    recentEvents: listRecentEvents(),
  }
}

export function markPipelineRunning(topic: string) {
  const now = new Date().toISOString()
  store.pipeline = {
    ...store.pipeline,
    status: 'running',
    stage: 'trend-intake',
    activeTopic: topic,
    progress: 5,
    lastRunAt: now,
    message: `Processing ${topic}`,
    recentEvents: store.events,
  }
}

export function markPipelineIdle(message = 'Ready to process the next trending story.') {
  store.pipeline = {
    ...store.pipeline,
    status: 'idle',
    stage: 'idle',
    activeTopic: null,
    progress: 0,
    message,
    recentEvents: store.events,
  }
}

export function markPipelineDegraded(message: string) {
  store.pipeline = {
    ...store.pipeline,
    status: 'degraded',
    message,
    recentEvents: store.events,
  }
}

export function markPipelineSuccess(topic: string) {
  store.pipeline = {
    ...store.pipeline,
    status: 'idle',
    stage: 'idle',
    activeTopic: null,
    progress: 100,
    lastSuccessAt: new Date().toISOString(),
    message: `Published ${topic}`,
    recentEvents: store.events,
  }
}

export async function listArticlesPersistent() {
  const client = getSupabaseClient()
  if (!client) {
    return listArticles()
  }

  const { data, error } = await client
    .from(SUPABASE_ARTICLES_TABLE)
    .select('*')
    .order('published_at', { ascending: false })

  if (error || !Array.isArray(data)) {
    console.warn('Supabase list articles failed, falling back to local store:', error?.message)
    return listArticles()
  }

  const articles = data.map((row) => rowToArticle(row as ArticleRow))
  store.articles = articles
  persistArticles(store.articles)
  return articles
}

export async function getArticleByIdPersistent(id: string) {
  const client = getSupabaseClient()
  if (!client) {
    return getArticleById(id)
  }

  const { data, error } = await client
    .from(SUPABASE_ARTICLES_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.warn('Supabase get article failed, falling back to local store:', error.message)
    return getArticleById(id)
  }

  if (!data) {
    return null
  }

  const article = rowToArticle(data as ArticleRow)
  upsertArticle(article)
  return article
}

export async function upsertArticlePersistent(article: PublishedArticle) {
  const localArticle = upsertArticle(article)
  const client = getSupabaseClient()

  if (!client) {
    return localArticle
  }

  const { data, error } = await client
    .from(SUPABASE_ARTICLES_TABLE)
    .upsert(articleToRow(localArticle), { onConflict: 'id' })
    .select('*')
    .single()

  if (error || !data) {
    console.warn('Supabase upsert failed, using local article store:', error?.message)
    return localArticle
  }

  const persistedArticle = rowToArticle(data as ArticleRow)
  upsertArticle(persistedArticle)
  return persistedArticle
}
