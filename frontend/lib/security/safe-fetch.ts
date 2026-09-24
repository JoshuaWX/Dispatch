import { createHash } from 'node:crypto'
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'
import { getDomain } from 'tldts'
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici'

const ALLOWED_CONTENT_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain']

export class SafeFetchError extends Error {
  constructor(public readonly code: 'unsafe_source_url' | 'source_fetch_failed', message: string) {
    super(message)
    this.name = 'SafeFetchError'
  }
}

type Lookup = (hostname: string) => Promise<string[]>
type FetchRequestInit = RequestInit & { dispatcher?: Dispatcher }
type FetchImpl = (input: string | URL, init?: FetchRequestInit) => Promise<Response>
type DispatcherFactory = (hostname: string, addresses: string[]) => Dispatcher
type SafeFetcherOptions = {
  fetchImpl?: FetchImpl
  dispatcherFactory?: DispatcherFactory
  lookup?: Lookup
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
}

function isUnsafeAddress(address: string) {
  try {
    return ipaddr.parse(address.split('%')[0]).range() !== 'unicast'
  } catch {
    return true
  }
}

async function defaultLookup(hostname: string) {
  const records = await dnsLookup(hostname, { all: true, verbatim: true })
  return records.map((record) => record.address)
}

async function withinDeadline<T>(promise: Promise<T>, deadline: number, message: string) {
  const remainingMs = deadline - Date.now()
  if (remainingMs <= 0) throw new SafeFetchError('source_fetch_failed', message)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new SafeFetchError('source_fetch_failed', message)), remainingMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function assertPublicHttpsUrl(value: string, lookup: Lookup, deadline: number, allowedDomains?: ReadonlySet<string>) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new SafeFetchError('unsafe_source_url', 'Source URL is invalid')
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new SafeFetchError('unsafe_source_url', 'Source URL must be a credential-free HTTPS URL')
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new SafeFetchError('unsafe_source_url', 'Source host is not public')
  }
  if (allowedDomains && !allowedDomains.has(getDomain(hostname, { allowPrivateDomains: false }) ?? '')) {
    throw new SafeFetchError('unsafe_source_url', 'Source host is not approved for evidence use')
  }

  const addresses = isIP(hostname)
    ? [hostname]
    : await withinDeadline(lookup(hostname), deadline, 'Source DNS lookup timed out')
  if (addresses.length === 0 || addresses.some(isUnsafeAddress)) {
    throw new SafeFetchError('unsafe_source_url', 'Source host resolves to a non-public address')
  }
  return { url, hostname, addresses }
}

function createPinnedDispatcher(hostname: string, addresses: string[]) {
  const expectedHostname = hostname.toLowerCase().replace(/\.$/, '')
  const records = addresses.map((address) => ({ address, family: isIP(address) as 4 | 6 }))
  return new Agent({
    connect: {
      lookup(requestedHostname, options, callback) {
        if (requestedHostname.toLowerCase().replace(/\.$/, '') !== expectedHostname) {
          const error = new Error('DNS lookup escaped the validated source host') as NodeJS.ErrnoException
          error.code = 'EACCES'
          callback(error, '')
          return
        }
        if (options.all) {
          callback(null, records)
          return
        }
        callback(null, records[0].address, records[0].family)
      },
    },
  })
}

function htmlToText(value: string) {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim()
}

function articleText(raw: string) {
  const article = raw.match(/<article\b[^>]*>[\s\S]*?<\/article>/i)?.[0]
  return htmlToText(article ?? raw)
}

function isArticleDocument(raw: string, text: string, contentType: string) {
  if (contentType.startsWith('text/plain')) return text.length >= 800
  if (text.length < 300) return false

  const hasOgArticle = /<meta\b(?=[^>]*(?:property|name)\s*=\s*["']og:type["'])(?=[^>]*content\s*=\s*["']article["'])[^>]*>/i.test(raw)
  const hasArticleMetadata = hasOgArticle || /(?:property|name)\s*=\s*["']article:(?:published_time|section|author)["']/i.test(raw)
  const hasArticleSchema = /["']@type["']\s*:\s*["'](?:NewsArticle|Article|ReportageNewsArticle|AnalysisNewsArticle|BlogPosting)["']/i.test(raw)
  const hasSemanticArticle = /<article\b/i.test(raw) && /<h1\b/i.test(raw)
  return hasArticleMetadata || hasArticleSchema || hasSemanticArticle
}

async function readBoundedBody(response: Response, maxBytes: number, deadline: number) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await withinDeadline(reader.read(), deadline, 'Source body timed out')
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new SafeFetchError('source_fetch_failed', 'Source document exceeds the size limit')
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

async function closeDispatcher(dispatcher: Dispatcher, deadline: number) {
  try {
    await withinDeadline(dispatcher.close(), deadline, 'Source connection shutdown timed out')
  } catch {
    void dispatcher.destroy()
  }
}

export function createSafeArticleFetcher(options: SafeFetcherOptions = {}) {
  const fetchImpl = options.fetchImpl ?? (undiciFetch as unknown as FetchImpl)
  const lookup = options.lookup ?? defaultLookup
  const dispatcherFactory = options.dispatcherFactory ?? createPinnedDispatcher
  const timeoutMs = options.timeoutMs ?? 5_000
  const maxBytes = options.maxBytes ?? 1024 * 1024
  const maxRedirects = options.maxRedirects ?? 3

  return async function fetchArticle(sourceUrl: string, allowedDomains?: ReadonlySet<string>) {
    const deadline = Date.now() + timeoutMs
    let current = await assertPublicHttpsUrl(sourceUrl, lookup, deadline, allowedDomains)
    for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
      const dispatcher = dispatcherFactory(current.hostname, current.addresses)
      let response: Response
      try {
        response = await fetchImpl(current.url, {
          method: 'GET', redirect: 'manual', cache: 'no-store',
          headers: {
            accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
            'user-agent': 'DispatchEvidenceBot/1.0 (+https://dispatch-1news.vercel.app/methodology)',
          },
          signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
          dispatcher,
        })
      } catch {
        await closeDispatcher(dispatcher, deadline)
        throw new SafeFetchError('source_fetch_failed', 'Source request failed')
      }

      try {
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location')
          if (!location || redirects === maxRedirects) {
            await response.body?.cancel()
            throw new SafeFetchError('source_fetch_failed', 'Source redirect could not be followed safely')
          }
          await response.body?.cancel()
          current = await assertPublicHttpsUrl(new URL(location, current.url).toString(), lookup, deadline, allowedDomains)
          continue
        }
        if (!response.ok) {
          await response.body?.cancel()
          throw new SafeFetchError('source_fetch_failed', `Source request returned ${response.status}`)
        }

        const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
        if (!ALLOWED_CONTENT_TYPES.some((allowed) => contentType.startsWith(allowed))) {
          await response.body?.cancel()
          throw new SafeFetchError('source_fetch_failed', 'Source content type is not supported')
        }
        const contentLength = Number(response.headers.get('content-length'))
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          await response.body?.cancel()
          throw new SafeFetchError('source_fetch_failed', 'Source document exceeds the size limit')
        }
        const raw = await readBoundedBody(response, maxBytes, deadline)
        const text = contentType.startsWith('text/plain') ? raw.replace(/\s+/g, ' ').trim() : articleText(raw)
        if (!isArticleDocument(raw, text, contentType)) {
          throw new SafeFetchError('source_fetch_failed', 'Source document is not an article page')
        }
        return {
          url: current.url.toString(),
          text: text.slice(0, 24_000),
          contentHash: createHash('sha256').update(text, 'utf8').digest('hex'),
        }
      } finally {
        await closeDispatcher(dispatcher, deadline)
      }
    }
    throw new SafeFetchError('source_fetch_failed', 'Source request failed')
  }
}

export const fetchArticleSafely = createSafeArticleFetcher()
