import 'server-only'

import { randomUUID } from 'node:crypto'
import { normalizeTopic } from '@/lib/news-provider-utils'
import { getServiceSupabase } from '@/lib/supabase-server'

const VIRLO_TRENDS_DIGEST_URL = 'https://api.virlo.ai/v1/trends/digest'
const MAX_TOPICS = 60

export type VirloDailySnapshot = {
  dayKey: string
  topics: string[]
  fetchedAt: number | null
  fromCache: boolean
  calledApi: boolean
  success: boolean
  error?: string
}

function normalizeTopics(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string')
    .map(normalizeTopic).filter((item) => item.length >= 4))].slice(0, MAX_TOPICS)
}

function walkTopicCandidates(value: unknown, topics: Set<string>, depth = 0) {
  if (!value || depth > 4 || topics.size >= MAX_TOPICS) return
  if (typeof value === 'string') {
    const topic = normalizeTopic(value)
    if (topic.length >= 4) topics.add(topic)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) walkTopicCandidates(item, topics, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  const record = value as Record<string, unknown>
  for (const key of ['topic', 'name', 'title', 'trend', 'keyword', 'label', 'text', 'headline']) {
    walkTopicCandidates(record[key], topics, depth + 1)
  }
  for (const key of ['topics', 'trends', 'results', 'items', 'data', 'digest', 'signals']) {
    walkTopicCandidates(record[key], topics, depth + 1)
  }
}

function extractTopics(payload: unknown) {
  const topics = new Set<string>()
  walkTopicCandidates(payload, topics)
  return [...topics].slice(0, MAX_TOPICS)
}

async function callVirlo(token: string) {
  const response = await fetch(VIRLO_TRENDS_DIGEST_URL, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    cache: 'no-store', signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Virlo returned ${response.status}`)
  const topics = extractTopics(await response.json())
  if (topics.length === 0) throw new Error('Virlo returned no usable topics')
  return topics
}

export async function getDailyVirloSnapshot(): Promise<VirloDailySnapshot> {
  const dayKey = new Date().toISOString().slice(0, 10)
  const owner = randomUUID()
  const db = getServiceSupabase()
  const { data, error } = await db.rpc('dispatch_claim_virlo_refresh', { p_day_key: dayKey, p_owner: owner })
  if (error || !data) throw new Error('Virlo cache unavailable')
  const claim = data as { acquired?: boolean; cached?: boolean; topics?: unknown; fetchedAt?: string }
  const cachedTopics = normalizeTopics(claim.topics)
  if (!claim.acquired) {
    return {
      dayKey, topics: cachedTopics,
      fetchedAt: claim.fetchedAt ? Date.parse(claim.fetchedAt) : null,
      fromCache: claim.cached === true, calledApi: false,
      success: claim.cached === true && cachedTopics.length > 0,
    }
  }

  const token = process.env.VIRLO_API_KEY?.trim()
  if (!token) {
    await finishRefresh(dayKey, owner, [], false, 'Virlo token is not configured')
    return { dayKey, topics: [], fetchedAt: Date.now(), fromCache: false, calledApi: false, success: false, error: 'Virlo token is not configured' }
  }

  try {
    const topics = await callVirlo(token)
    await finishRefresh(dayKey, owner, topics, true, null)
    return { dayKey, topics, fetchedAt: Date.now(), fromCache: false, calledApi: true, success: true }
  } catch (fetchError) {
    const message = fetchError instanceof Error ? fetchError.message.slice(0, 500) : 'Virlo request failed'
    await finishRefresh(dayKey, owner, [], false, message)
    return { dayKey, topics: [], fetchedAt: Date.now(), fromCache: false, calledApi: true, success: false, error: message }
  }
}

async function finishRefresh(dayKey: string, owner: string, topics: string[], success: boolean, error: string | null) {
  const { error: persistenceError } = await getServiceSupabase().rpc('dispatch_finish_virlo_refresh', {
    p_day_key: dayKey, p_owner: owner, p_topics: topics, p_success: success, p_error: error,
  })
  if (persistenceError) throw new Error('Virlo cache settlement failed')
}

export async function getVirloTopics() {
  return (await getDailyVirloSnapshot()).topics
}
