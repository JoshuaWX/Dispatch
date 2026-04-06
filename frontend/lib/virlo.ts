import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const VIRLO_TRENDS_DIGEST_URL = 'https://api.virlo.ai/v1/trends/digest'
const MAX_TOPICS = 60
const SUPABASE_VIRLO_CACHE_TABLE = 'dispatch_virlo_daily_cache'

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
  __dispatchVirloSupabaseClient?: SupabaseClient
}

type VirloDailyRow = {
  day_key: string
  topics: unknown
  fetched_at: string
  attempted_at: string
  success: boolean
  error: string | null
}

function getUtcDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10)
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

  if (!globalForVirlo.__dispatchVirloSupabaseClient) {
    globalForVirlo.__dispatchVirloSupabaseClient = createClient(
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

  return globalForVirlo.__dispatchVirloSupabaseClient
}

function toMillis(value: string) {
  const millis = new Date(value).getTime()
  return Number.isFinite(millis) ? millis : Date.now()
}

function normalizeTopics(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => normalizeTopic(item))
    .filter((item) => item.length >= 4)
    .slice(0, MAX_TOPICS)
}

function rowToCache(row: VirloDailyRow): VirloDailyCache {
  return {
    dayKey: row.day_key,
    topics: normalizeTopics(row.topics),
    fetchedAt: toMillis(row.fetched_at),
    attemptedAt: toMillis(row.attempted_at),
    success: row.success,
    error: row.error ?? undefined,
  }
}

async function readDailyCachePersistent(dayKey: string): Promise<VirloDailyCache | null> {
  const client = getSupabaseClient()
  if (!client) {
    return null
  }

  try {
    const { data, error } = await client
      .from(SUPABASE_VIRLO_CACHE_TABLE)
      .select('*')
      .eq('day_key', dayKey)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    return rowToCache(data as VirloDailyRow)
  } catch {
    return null
  }
}

async function upsertDailyCachePersistent(cache: VirloDailyCache) {
  const client = getSupabaseClient()
  if (!client) {
    return
  }

  try {
    await client.from(SUPABASE_VIRLO_CACHE_TABLE).upsert(
      {
        day_key: cache.dayKey,
        topics: cache.topics,
        fetched_at: new Date(cache.fetchedAt).toISOString(),
        attempted_at: new Date(cache.attemptedAt).toISOString(),
        success: cache.success,
        error: cache.error ?? null,
      },
      { onConflict: 'day_key' }
    )
  } catch {
    // Ignore persistence failures and continue with in-memory cache.
  }
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

  const persistedCache = await readDailyCachePersistent(dayKey)
  if (persistedCache) {
    globalForVirlo.__dispatchVirloDailyCache = persistedCache

    return {
      dayKey,
      topics: persistedCache.topics,
      fetchedAt: persistedCache.fetchedAt,
      fromCache: true,
      calledApi: false,
      success: persistedCache.success,
      error: persistedCache.error,
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
    await upsertDailyCachePersistent(emptyCache)

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
  await upsertDailyCachePersistent(nextCache)

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
