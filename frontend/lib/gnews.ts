const GNEWS_BASE_URL = 'https://gnews.io/api/v4'
const ONE_HOUR_MS = 60 * 60 * 1000

type GNewsTopicsCache = {
  topics: string[]
  fetchedAt: number
}

const globalForGNews = globalThis as typeof globalThis & {
  __dispatchGNewsTopicsCache?: GNewsTopicsCache
}

function normalizeTopic(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export async function getGNewsTopics(): Promise<string[]> {
  const now = Date.now()
  const cache = globalForGNews.__dispatchGNewsTopicsCache

  if (cache && now - cache.fetchedAt < ONE_HOUR_MS && cache.topics.length > 0) {
    return cache.topics
  }

  const token = process.env.GNEWS_KEY?.trim()
  if (!token) {
    return []
  }

  try {
    const url = new URL(`${GNEWS_BASE_URL}/top-headlines`)
    url.searchParams.set('token', token)
    url.searchParams.set('lang', 'en')
    url.searchParams.set('max', '15')

    const response = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      throw new Error(`GNews top-headlines failed with status ${response.status}`)
    }

    const payload = (await response.json()) as {
      articles?: Array<{
        title?: string
      }>
    }

    const topics = Array.from(
      new Set((payload.articles ?? []).map((article) => normalizeTopic(article.title ?? '')).filter(Boolean))
    )

    if (topics.length === 0) {
      throw new Error('GNews returned no topics')
    }

    globalForGNews.__dispatchGNewsTopicsCache = {
      topics,
      fetchedAt: now,
    }

    return topics
  } catch {
    return []
  }
}
