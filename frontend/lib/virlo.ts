const VIRLO_TRENDS_DIGEST_URL = 'https://api.virlo.ai/v1/trends/digest'
const MAX_TOPICS = 60

type VirloDailyCache = {
  dayKey: string
  topics: string[]
  fetchedAt: number
  attemptedAt: number
  success: boolean
  error?: string
}

export type VirloDailySnapshot = {
  dayKey: string
  topics: string[]
  fetchedAt: number | null
  fromCache: boolean
  calledApi: boolean
  success: boolean
  error?: string
}

const globalForVirlo = globalThis as typeof globalThis & {
  __dispatchVirloDailyCache?: VirloDailyCache
}

function getUtcDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function normalizeTopic(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function resolveVirloToken() {
  return process.env.VIRLO_API_KEY?.trim() || ''
}

function addTopic(topics: Set<string>, value: unknown) {
  if (typeof value !== 'string') {
    return
  }

  const normalized = normalizeTopic(value)
  if (normalized.length < 4) {
    return
  }

  topics.add(normalized)
}

function walkTopicCandidates(value: unknown, topics: Set<string>, depth = 0) {
  if (!value || depth > 4) {
    return
  }

  if (typeof value === 'string') {
    addTopic(topics, value)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      walkTopicCandidates(item, topics, depth + 1)
      if (topics.size >= MAX_TOPICS) {
        return
      }
    }
    return
  }

  if (typeof value !== 'object') {
    return
  }

  const item = value as Record<string, unknown>
  const directKeys = ['topic', 'name', 'title', 'trend', 'keyword', 'label', 'text', 'headline']
  for (const key of directKeys) {
    addTopic(topics, item[key])
  }

  const containerKeys = ['topics', 'trends', 'results', 'items', 'data', 'digest', 'signals']
  for (const key of containerKeys) {
    walkTopicCandidates(item[key], topics, depth + 1)
    if (topics.size >= MAX_TOPICS) {
      return
    }
  }
}

function extractTopicsFromPayload(payload: unknown) {
  const topics = new Set<string>()
  walkTopicCandidates(payload, topics)
  return Array.from(topics).slice(0, MAX_TOPICS)
}

async function fetchVirloTopics(token: string) {
  try {
    const response = await fetch(VIRLO_TRENDS_DIGEST_URL, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return {
        topics: [] as string[],
        error: `Virlo request failed with status ${response.status}`,
      }
    }

    const payload = (await response.json()) as unknown
    const topics = extractTopicsFromPayload(payload)

    if (topics.length === 0) {
      return {
        topics: [] as string[],
        error: 'Virlo digest returned no usable topics',
      }
    }

    return {
      topics,
    }
  } catch (error) {
    return {
      topics: [] as string[],
      error: error instanceof Error ? error.message : 'Virlo request failed',
    }
  }
}

export async function getDailyVirloSnapshot(): Promise<VirloDailySnapshot> {
  const dayKey = getUtcDayKey()
  const cache = globalForVirlo.__dispatchVirloDailyCache

  if (cache && cache.dayKey === dayKey) {
    return {
      dayKey,
      topics: cache.topics,
      fetchedAt: cache.fetchedAt,
      fromCache: true,
      calledApi: false,
      success: cache.success,
      error: cache.error,
    }
  }

  const token = resolveVirloToken()
  if (!token) {
    const emptyCache: VirloDailyCache = {
      dayKey,
      topics: cache?.topics ?? [],
      fetchedAt: Date.now(),
      attemptedAt: Date.now(),
      success: false,
      error: 'Virlo token is not configured',
    }

    globalForVirlo.__dispatchVirloDailyCache = emptyCache

    return {
      dayKey,
      topics: emptyCache.topics,
      fetchedAt: emptyCache.fetchedAt,
      fromCache: false,
      calledApi: false,
      success: false,
      error: emptyCache.error,
    }
  }

  const result = await fetchVirloTopics(token)
  const nextCache: VirloDailyCache = {
    dayKey,
    topics: result.topics.length > 0 ? result.topics : cache?.topics ?? [],
    fetchedAt: Date.now(),
    attemptedAt: Date.now(),
    success: result.topics.length > 0,
    error: result.error,
  }

  globalForVirlo.__dispatchVirloDailyCache = nextCache

  return {
    dayKey,
    topics: nextCache.topics,
    fetchedAt: nextCache.fetchedAt,
    fromCache: false,
    calledApi: true,
    success: nextCache.success,
    error: nextCache.error,
  }
}

export async function getVirloTopics() {
  const snapshot = await getDailyVirloSnapshot()
  return snapshot.topics
}
