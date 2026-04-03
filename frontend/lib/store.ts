import { randomUUID } from 'crypto'
import type { PipelineEvent, PipelineSnapshot, PublishedArticle } from '@/lib/dispatch-types'

type DispatchStore = {
  articles: PublishedArticle[]
  events: PipelineEvent[]
  pipeline: PipelineSnapshot
}

const createInitialState = (): DispatchStore => ({
  articles: [],
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
    return merged
  }

  store.articles.unshift(article)
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
