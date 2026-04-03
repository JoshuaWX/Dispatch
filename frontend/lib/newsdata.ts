const NEWSDATA_BASE_URL = 'https://newsdata.io/api/1'
const ONE_HOUR_MS = 60 * 60 * 1000

const FALLBACK_TOPICS = [
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

type CachedTopics = {
  topics: string[]
  imageByTopic: Record<string, string>
  fetchedAt: number
}

const globalForNewsData = globalThis as typeof globalThis & {
  __dispatchNewsDataCache?: CachedTopics
}

function normalizeTopic(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export async function getTopics(): Promise<string[]> {
  const now = Date.now()
  const cache = globalForNewsData.__dispatchNewsDataCache

  if (cache && now - cache.fetchedAt < ONE_HOUR_MS && cache.topics.length > 0) {
    return cache.topics
  }

  const apiKey = process.env.NEWSDATA_API_KEY?.trim()
  if (!apiKey) {
    return [...FALLBACK_TOPICS]
  }

  try {
    const url = new URL(`${NEWSDATA_BASE_URL}/latest-news`)
    url.searchParams.set('apikey', apiKey)
    url.searchParams.set('language', 'en')
    url.searchParams.set('category', 'world,technology,business,science')

    const response = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      throw new Error(`NewsData request failed with status ${response.status}`)
    }

    const payload = (await response.json()) as {
      results?: Array<{
        title?: string
        category?: string[] | string
        image_url?: string
      }>
    }

    const imageByTopic: Record<string, string> = {}
    for (const item of payload.results ?? []) {
      const topic = normalizeTopic(item.title ?? '')
      const imageUrl = item.image_url?.trim()
      if (topic && imageUrl) {
        imageByTopic[topic.toLowerCase()] = imageUrl
      }
    }

    const topics = Array.from(
      new Set(
        (payload.results ?? [])
          .map((item) => normalizeTopic(item.title ?? ''))
          .filter(Boolean)
      )
    )

    if (topics.length === 0) {
      throw new Error('NewsData returned no topics')
    }

    globalForNewsData.__dispatchNewsDataCache = {
      topics,
      imageByTopic,
      fetchedAt: now,
    }

    return topics
  } catch {
    return [...FALLBACK_TOPICS]
  }
}

export async function getTopicImageHint(topic: string): Promise<string | null> {
  const normalized = normalizeTopic(topic).toLowerCase()
  if (!normalized) {
    return null
  }

  const now = Date.now()
  const cache = globalForNewsData.__dispatchNewsDataCache

  if (!cache || now - cache.fetchedAt >= ONE_HOUR_MS) {
    await getTopics()
  }

  return globalForNewsData.__dispatchNewsDataCache?.imageByTopic?.[normalized] ?? null
}
