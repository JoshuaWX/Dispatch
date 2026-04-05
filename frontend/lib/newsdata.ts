const NEWSDATA_BASE_URL = 'https://newsdata.io/api/1'
const ONE_HOUR_MS = 60 * 60 * 1000

type CachedTopics = {
  topics: string[]
  imageByTopic: Record<string, string>
  fetchedAt: number
}

export type NewsSearchHit = {
  title: string
  url: string
  source: string
  excerpt: string
  publishedAt: string
  imageUrl?: string
}

const globalForNewsData = globalThis as typeof globalThis & {
  __dispatchNewsDataCache?: CachedTopics
  __dispatchNewsSearchCache?: Record<string, { results: NewsSearchHit[]; fetchedAt: number }>
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

function isLowQualityExcerpt(value: string) {
  const normalized = normalizeForCompare(value)
  if (!normalized) {
    return true
  }

  const lowSignalPatterns = [
    'get latest articles and stories',
    'latestly',
    'read more',
    'click here',
    'follow us on',
  ]

  return lowSignalPatterns.some((pattern) => normalized.includes(pattern))
}

function cleanExcerpt(value: string, fallbackTitle: string) {
  const raw = value.trim()
  if (!raw) {
    return fallbackTitle.trim()
  }

  const stripped = raw
    .replace(/^get latest articles and stories on [^.]+\.\s*/i, '')
    .replace(/\[\.\.\.\].*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!stripped) {
    return fallbackTitle.trim()
  }

  const firstSentenceMatch = stripped.match(/^(.+?[.!?])\s/)
  const firstSentence = firstSentenceMatch?.[1] ?? stripped

  return firstSentence.slice(0, 260).trim()
}

export async function getTopics(): Promise<string[]> {
  const now = Date.now()
  const cache = globalForNewsData.__dispatchNewsDataCache

  if (cache && now - cache.fetchedAt < ONE_HOUR_MS && cache.topics.length > 0) {
    return cache.topics
  }

  const apiKey = process.env.NEWSDATA_API_KEY?.trim()
  if (!apiKey) {
    return []
  }

  try {
    const url = new URL(`${NEWSDATA_BASE_URL}/news`)
    url.searchParams.set('apikey', apiKey)
    url.searchParams.set('language', 'en')
    url.searchParams.set('category', 'world,technology,business,science')
    url.searchParams.set('size', '25')

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
    return []
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

export async function searchNewsData(topic: string): Promise<NewsSearchHit[]> {
  const normalizedTopic = normalizeTopic(topic).toLowerCase()
  if (!normalizedTopic) {
    return []
  }

  const now = Date.now()
  const cache = globalForNewsData.__dispatchNewsSearchCache?.[normalizedTopic]
  if (cache && now - cache.fetchedAt < ONE_HOUR_MS && cache.results.length > 0) {
    return cache.results
  }

  const apiKey = process.env.NEWSDATA_API_KEY?.trim()
  if (!apiKey) {
    return []
  }

  try {
    const url = new URL(`${NEWSDATA_BASE_URL}/news`)
    url.searchParams.set('apikey', apiKey)
    url.searchParams.set('language', 'en')
    url.searchParams.set('category', 'world,technology,business,science')
    url.searchParams.set('q', normalizedTopic)
    url.searchParams.set('size', '10')

    const response = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      throw new Error(`NewsData search failed with status ${response.status}`)
    }

    const payload = (await response.json()) as {
      results?: Array<{
        title?: string
        link?: string
        source_id?: string
        source_url?: string
        description?: string
        pubDate?: string
        image_url?: string
      }>
    }

    const rawResults = (payload.results ?? [])
      .map((item) => {
        const url = item.link?.trim() || item.source_url?.trim() || ''
        if (!url) {
          return null
        }

        let source = item.source_id?.trim() || ''
        if (!source) {
          try {
            source = new URL(url).hostname.replace(/^www\./, '')
          } catch {
            source = 'news source'
          }
        }

        return {
          title: item.title?.trim() || topic,
          url,
          source,
          excerpt: cleanExcerpt(item.description?.trim() || '', item.title?.trim() || topic),
          publishedAt: item.pubDate?.trim() || 'Today',
          imageUrl: item.image_url?.trim() || undefined,
        }
      })
      .filter((item): item is NewsSearchHit => Boolean(item))

    const seenTitles = new Set<string>()
    const results = rawResults.filter((hit) => {
      const normalizedTitle = normalizeForCompare(hit.title)
      if (!normalizedTitle) {
        return false
      }

      if (seenTitles.has(normalizedTitle)) {
        return false
      }

      const hasGoodExcerpt = hit.excerpt.length >= 60 && !isLowQualityExcerpt(hit.excerpt)
      const hasUsableTitle = hit.title.length >= 40
      if (!hasGoodExcerpt && !hasUsableTitle) {
        return false
      }

      seenTitles.add(normalizedTitle)
      return true
    })

    globalForNewsData.__dispatchNewsSearchCache = {
      ...(globalForNewsData.__dispatchNewsSearchCache ?? {}),
      [normalizedTopic]: {
        results,
        fetchedAt: now,
      },
    }

    return results
  } catch {
    return []
  }
}
