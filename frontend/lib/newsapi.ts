const NEWSAPI_BASE_URL = 'https://newsapi.org/v2'
const ONE_HOUR_MS = 60 * 60 * 1000
const THIRTY_MINUTES_MS = 30 * 60 * 1000

export type NewsSearchHit = {
  title: string
  url: string
  source: string
  excerpt: string
  publishedAt: string
  description?: string
  imageUrl?: string
}

type NewsApiTopicsCache = {
  topics: string[]
  imageByTopic: Record<string, string>
  fetchedAt: number
}

type NewsApiSearchCache = Record<string, { results: NewsSearchHit[]; fetchedAt: number }>

const globalForNewsApi = globalThis as typeof globalThis & {
  __dispatchNewsApiTopicsCache?: NewsApiTopicsCache
  __dispatchNewsApiSearchCache?: NewsApiSearchCache
}

function normalizeTopic(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeForCompare(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function getNewsApiTopics(): Promise<string[]> {
  const now = Date.now()
  const cache = globalForNewsApi.__dispatchNewsApiTopicsCache

  if (cache && now - cache.fetchedAt < ONE_HOUR_MS && cache.topics.length > 0) {
    return cache.topics
  }

  const apiKey = process.env.NEWSAPI_KEY?.trim()
  if (!apiKey) {
    return []
  }

  try {
    const url = new URL(`${NEWSAPI_BASE_URL}/top-headlines`)
    url.searchParams.set('apiKey', apiKey)
    url.searchParams.set('language', 'en')
    url.searchParams.set('pageSize', '15')

    const response = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      throw new Error(`NewsAPI top-headlines failed with status ${response.status}`)
    }

    const payload = (await response.json()) as {
      articles?: Array<{
        title?: string
        urlToImage?: string
      }>
    }

    const imageByTopic: Record<string, string> = {}
    for (const article of payload.articles ?? []) {
      const topic = normalizeTopic(article.title ?? '')
      const imageUrl = article.urlToImage?.trim()
      if (topic && imageUrl) {
        imageByTopic[topic.toLowerCase()] = imageUrl
      }
    }

    const topics = Array.from(
      new Set((payload.articles ?? []).map((article) => normalizeTopic(article.title ?? '')).filter(Boolean))
    )

    if (topics.length === 0) {
      throw new Error('NewsAPI returned no topics')
    }

    globalForNewsApi.__dispatchNewsApiTopicsCache = {
      topics,
      imageByTopic,
      fetchedAt: now,
    }

    return topics
  } catch {
    return []
  }
}

export async function getNewsApiTopicImageHint(topic: string): Promise<string | null> {
  const normalized = normalizeTopic(topic).toLowerCase()
  if (!normalized) {
    return null
  }

  const now = Date.now()
  const cache = globalForNewsApi.__dispatchNewsApiTopicsCache
  if (!cache || now - cache.fetchedAt >= ONE_HOUR_MS) {
    await getNewsApiTopics()
  }

  return globalForNewsApi.__dispatchNewsApiTopicsCache?.imageByTopic?.[normalized] ?? null
}

export async function searchNewsApi(topic: string): Promise<NewsSearchHit[]> {
  const normalizedTopic = normalizeTopic(topic)
  const cacheKey = normalizedTopic.toLowerCase()

  if (!cacheKey) {
    return []
  }

  const now = Date.now()
  const cache = globalForNewsApi.__dispatchNewsApiSearchCache?.[cacheKey]
  if (cache && now - cache.fetchedAt < THIRTY_MINUTES_MS && cache.results.length > 0) {
    return cache.results
  }

  const apiKey = process.env.NEWSAPI_KEY?.trim()
  if (!apiKey) {
    return []
  }

  try {
    const url = new URL(`${NEWSAPI_BASE_URL}/everything`)
    url.searchParams.set('q', normalizedTopic)
    url.searchParams.set('sortBy', 'relevancy')
    url.searchParams.set('language', 'en')
    url.searchParams.set('pageSize', '10')
    url.searchParams.set('apiKey', apiKey)

    const response = await fetch(url.toString(), {
      next: { revalidate: 1800 },
    })

    if (!response.ok) {
      throw new Error(`NewsAPI everything failed with status ${response.status}`)
    }

    const payload = (await response.json()) as {
      articles?: Array<{
        title?: string
        description?: string
        content?: string
        url?: string
        source?: { name?: string }
        publishedAt?: string
        urlToImage?: string
      }>
    }

    const seenTitles = new Set<string>()
    const results = (payload.articles ?? [])
      .map((article) => {
        const title = normalizeTopic(article.title ?? '')
        const urlValue = article.url?.trim() || ''
        if (!title || !urlValue) {
          return null
        }

        const excerpt =
          article.description?.trim() || article.content?.trim() || article.title?.trim() || title

        const normalizedTitle = normalizeForCompare(title)
        if (!normalizedTitle || seenTitles.has(normalizedTitle)) {
          return null
        }

        seenTitles.add(normalizedTitle)

        return {
          title,
          url: urlValue,
          source: article.source?.name?.trim() || 'NewsAPI source',
          excerpt,
          description: article.description?.trim() || undefined,
          publishedAt: article.publishedAt?.trim() || 'Today',
          imageUrl: article.urlToImage?.trim() || undefined,
        } as NewsSearchHit
      })
      .filter((item): item is NewsSearchHit => Boolean(item))

    globalForNewsApi.__dispatchNewsApiSearchCache = {
      ...(globalForNewsApi.__dispatchNewsApiSearchCache ?? {}),
      [cacheKey]: {
        results,
        fetchedAt: now,
      },
    }

    return results
  } catch {
    return []
  }
}
