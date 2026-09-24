import type { NewsSearchHit } from '@/lib/newsapi'
import { normalizeForCompare, normalizeTopic } from '@/lib/news-provider-utils'
import { getDomain } from 'tldts'

const THE_NEWS_API_BASE_URL = 'https://api.thenewsapi.com/v1'
const THIRTY_MINUTES_MS = 30 * 60 * 1000

type TheNewsApiSearchCache = Record<string, { results: NewsSearchHit[]; fetchedAt: number }>

const globalForTheNewsApi = globalThis as typeof globalThis & {
  __dispatchTheNewsApiSearchCache?: TheNewsApiSearchCache
}

export async function searchTheNewsApi(topic: string, approvedDomains: ReadonlySet<string>): Promise<NewsSearchHit[]> {
  const normalizedTopic = normalizeTopic(topic)
  const domains = [...approvedDomains].sort().join(',')
  const cacheKey = `${normalizedTopic.toLowerCase()}|${domains}`

  if (!normalizedTopic || !domains) {
    return []
  }

  const now = Date.now()
  const cache = globalForTheNewsApi.__dispatchTheNewsApiSearchCache?.[cacheKey]
  if (cache && now - cache.fetchedAt < THIRTY_MINUTES_MS && cache.results.length > 0) {
    return cache.results
  }

  const apiToken = process.env.THENEWSAPI_KEY?.trim()
  if (!apiToken) {
    return []
  }

  try {
    const url = new URL(`${THE_NEWS_API_BASE_URL}/news/all`)
    url.searchParams.set('api_token', apiToken)
    url.searchParams.set('search', normalizedTopic)
    url.searchParams.set('language', 'en')
    url.searchParams.set('limit', '10')
    url.searchParams.set('domains', domains)
    const response = await fetch(url.toString(), {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`TheNewsAPI search failed with status ${response.status}`)
    const payload = (await response.json()) as {
      data?: Array<{
        title?: string
        description?: string
        snippet?: string
        url?: string
        source?: string
        published_at?: string
      }>
    }

    const seenTitles = new Set<string>()
    const results = (payload.data ?? [])
      .map((article) => {
        const title = normalizeTopic(article.title ?? '')
        const urlValue = article.url?.trim() || ''
        if (!title || !urlValue || !approvedDomains.has(getDomain(urlValue, { allowPrivateDomains: false }) ?? '')) {
          return null
        }

        const normalizedTitle = normalizeForCompare(title)
        if (!normalizedTitle || seenTitles.has(normalizedTitle)) {
          return null
        }
        seenTitles.add(normalizedTitle)

        // Keep snippet intact because it carries the strongest factual context for research.
        const excerpt =
          article.snippet?.trim() || article.description?.trim() || article.title?.trim() || title

        return {
          title,
          source: article.source?.trim() || 'TheNewsAPI source',
          url: urlValue,
          publishedAt: article.published_at?.trim() || 'Today',
          excerpt,
          description: article.description?.trim() || undefined,
        } as NewsSearchHit
      })
      .filter((item): item is NewsSearchHit => Boolean(item))

    globalForTheNewsApi.__dispatchTheNewsApiSearchCache = {
      ...(globalForTheNewsApi.__dispatchTheNewsApiSearchCache ?? {}),
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
