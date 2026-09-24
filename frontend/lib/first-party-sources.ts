import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type { ArticleSource, TrendTopic } from '@/lib/dispatch-types'
import { isLikelyArticleUrl, normalizeTopic } from '@/lib/news-provider-utils'
import { fetchArticleSafely, fetchFeedSafely, fetchJsonSafely } from '@/lib/security/safe-fetch'

export const GOV_UK_FEED = 'https://www.gov.uk/search/news-and-communications.atom'
export const ECDC_FEED = 'https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed'
const GOV_UK_LICENCE = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'
const CC_BY_LICENCE = 'https://creativecommons.org/licenses/by/4.0/'
const MAX_AGE_MS = 72 * 60 * 60 * 1000
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true, parseTagValue: false })

type Fetched = { url: string; text: string; raw: string; contentHash: string }
type Fetcher = (url: string, allowedDomains?: ReadonlySet<string>) => Promise<Fetched>
type Dependencies = {
  fetchFeed: Fetcher
  fetchArticle: Fetcher
  fetchJson: Fetcher
  now(): Date
}

function entries(value: unknown): Record<string, unknown>[] {
  if (!value) return []
  return (Array.isArray(value) ? value : [value]).filter((item): item is Record<string, unknown> =>
    Boolean(item) && typeof item === 'object' && !Array.isArray(item))
}

function parseXml(xml: string): Record<string, unknown> {
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Unsafe feed XML')
  const parsed: unknown = xmlParser.parse(xml)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid feed XML')
  return parsed as Record<string, unknown>
}

function string(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function allowedAge(value: string, now: Date) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp <= now.getTime() && now.getTime() - timestamp <= MAX_AGE_MS
}

function canonicalUrl(value: string, host: string, pathPrefix: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== host || !url.pathname.startsWith(pathPrefix) ||
        url.username || url.password || url.port || !isLikelyArticleUrl(url.toString())) return ''
    return `${url.origin}${url.pathname}`
  } catch {
    return ''
  }
}

function topicFrom(title: string, url: string): TrendTopic | null {
  const cleanTitle = normalizeTopic(title)
  if (cleanTitle.length < 12 || /\b(vacanc(?:y|ies)|recruitment|job opening|apply now)\b/i.test(cleanTitle)) return null
  return {
    topic: cleanTitle,
    category: /\b(health|disease|medicine|research|science|climate)\b/i.test(cleanTitle) ? 'Science' : 'World',
    score: 80,
    storyKind: 'official_announcement',
    sourceUrl: url,
  }
}

function govTopics(xml: string, now: Date): TrendTopic[] {
  const feed = parseXml(xml).feed as Record<string, unknown> | undefined
  return entries(feed?.entry).flatMap((item) => {
    const link = item.link as Record<string, unknown> | undefined
    const url = canonicalUrl(string(link?.['@_href']), 'www.gov.uk', '/government/news/')
    const topic = url && allowedAge(string(item.updated), now) ? topicFrom(string(item.title), url) : null
    return topic ? [topic] : []
  })
}

function ecdcTopics(xml: string, now: Date): TrendTopic[] {
  const rss = parseXml(xml).rss as Record<string, unknown> | undefined
  const channel = rss?.channel as Record<string, unknown> | undefined
  return entries(channel?.item).flatMap((item) => {
    const url = canonicalUrl(string(item.link), 'www.ecdc.europa.eu', '/en/news-events/')
    const topic = url && allowedAge(string(item.pubDate), now) ? topicFrom(string(item.title), url) : null
    return topic ? [topic] : []
  })
}

function articleScope(raw: string, kind: 'gov' | 'ecdc') {
  return kind === 'gov'
    ? raw.match(/<main\b[^>]*>[\s\S]*?<\/main>/i)?.[0] ?? ''
    : raw.match(/<article\b[^>]*class=["'][^"']*\bct-news\b[^"']*\bfull\b[^"']*["'][^>]*>[\s\S]*?<\/article>/i)?.[0] ?? ''
}

function hasThirdPartyException(scope: string) {
  return /third.party (?:copyright|rights)|all rights reserved|©(?!\s*Crown)/i.test(scope)
}

function govEvidence(page: Fetched, metadata: unknown, now: Date): ArticleSource[] {
  const url = canonicalUrl(page.url, 'www.gov.uk', '/government/news/')
  const scope = articleScope(page.raw, 'gov')
  if (!url || !page.raw.includes('Open Government Licence v3.0') ||
      !page.raw.includes('nationalarchives.gov.uk/doc/open-government-licence') ||
      !scope || hasThirdPartyException(scope)) return []
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return []
  const item = metadata as Record<string, unknown>
  if (item.schema_name !== 'news_article' || item.document_type !== 'news_story' ||
      !allowedAge(string(item.first_published_at), now)) return []
  const withdrawn = item.withdrawn_notice as Record<string, unknown> | undefined
  if (withdrawn && Object.values(withdrawn).some(Boolean)) return []
  const links = item.links as Record<string, unknown> | undefined
  const organisation = entries(links?.organisations)[0]
  const slug = string(organisation?.base_path).split('/').filter(Boolean).at(-1)
  const name = string(organisation?.title)
  if (!slug || !name) return []
  return [{
    id: 'source-1', name, url, domain: 'www.gov.uk', reliability: 'high',
    excerpt: page.text.replace(/\s+/g, ' ').trim().slice(0, 1_500),
    publishedAt: new Date(string(item.first_published_at)).toISOString(), contentHash: page.contentHash,
    organisationId: `uk-government:${slug}`, upstreamOriginId: url, isPrimary: true,
    licenceId: 'OGL-3.0', licenceUrl: GOV_UK_LICENCE,
    licenceEvidence: 'All content is available under the Open Government Licence v3.0, except where otherwise stated.',
    attribution: 'Contains public sector information licensed under the Open Government Licence v3.0.',
    discoveryUrl: GOV_UK_FEED,
    retrievedAt: now.toISOString(), rightsCheckedAt: now.toISOString(),
    updatedAt: string(item.public_updated_at) ? new Date(string(item.public_updated_at)).toISOString() : undefined,
  }]
}

function ecdcEvidence(page: Fetched, now: Date): ArticleSource[] {
  const url = canonicalUrl(page.url, 'www.ecdc.europa.eu', '/en/news-events/')
  const scope = articleScope(page.raw, 'ecdc')
  if (!url || !scope || hasThirdPartyException(scope) ||
      !page.raw.includes('/en/ecdc-intellectual-property-notices')) return []
  const timestamp = page.raw.match(/<meta\b(?=[^>]*article:published_time)[^>]*content=["']([^"']+)["'][^>]*>/i)?.[1] ?? ''
  if (!allowedAge(timestamp, now)) return []
  return [{
    id: 'source-1', name: 'European Centre for Disease Prevention and Control', url,
    domain: 'europa.eu', reliability: 'high',
    excerpt: page.text.replace(/\s+/g, ' ').trim().slice(0, 1_500),
    publishedAt: new Date(timestamp).toISOString(), contentHash: page.contentHash,
    organisationId: 'ecdc', upstreamOriginId: url, isPrimary: true,
    licenceId: 'CC-BY-4.0', licenceUrl: CC_BY_LICENCE,
    licenceEvidence: 'ECDC intellectual property notice linked on this article; ECDC-owned web text is CC BY 4.0.',
    attribution: 'Adapted from the European Centre for Disease Prevention and Control (ECDC), CC BY 4.0; Dispatch is not endorsed by ECDC.',
    discoveryUrl: ECDC_FEED,
    retrievedAt: now.toISOString(), rightsCheckedAt: now.toISOString(),
  }]
}

export function createFirstPartySources(deps: Dependencies = {
  fetchFeed: fetchFeedSafely,
  fetchArticle: fetchArticleSafely,
  fetchJson: fetchJsonSafely,
  now: () => new Date(),
}) {
  return {
    async discover(publishedUrls: ReadonlySet<string>): Promise<TrendTopic[]> {
      const feeds = await Promise.allSettled([
        deps.fetchFeed(GOV_UK_FEED, new Set(['www.gov.uk'])),
        deps.fetchFeed(ECDC_FEED, new Set(['europa.eu'])),
      ])
      const candidates: TrendTopic[] = []
      if (feeds[0].status === 'fulfilled') {
        try { candidates.push(...govTopics(feeds[0].value.text, deps.now())) } catch { /* Invalid feed is not evidence. */ }
      }
      if (feeds[1].status === 'fulfilled') {
        try { candidates.push(...ecdcTopics(feeds[1].value.text, deps.now())) } catch { /* Invalid feed is not evidence. */ }
      }
      return candidates.filter((topic) => topic.sourceUrl && !publishedUrls.has(topic.sourceUrl))
    },
    async collect(topic: TrendTopic): Promise<ArticleSource[]> {
      const url = topic.sourceUrl
      if (!url) return []
      try {
        if (canonicalUrl(url, 'www.gov.uk', '/government/news/')) {
          const page = await deps.fetchArticle(url, new Set(['www.gov.uk']))
          const finalUrl = canonicalUrl(page.url, 'www.gov.uk', '/government/news/')
          if (!finalUrl) return []
          const metadataUrl = `https://www.gov.uk/api/content${new URL(finalUrl).pathname}`
          const metadataPage = await deps.fetchJson(metadataUrl, new Set(['www.gov.uk']))
          if (metadataPage.url !== metadataUrl) return []
          return govEvidence(page, JSON.parse(metadataPage.text) as unknown, deps.now())
        }
        if (canonicalUrl(url, 'www.ecdc.europa.eu', '/en/news-events/')) {
          const page = await deps.fetchArticle(url, new Set(['europa.eu']))
          return ecdcEvidence(page, deps.now())
        }
      } catch { /* A failed retrieval or rights check safely yields no evidence. */ }
      return []
    },
  }
}
