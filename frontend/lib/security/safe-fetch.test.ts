import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSafeArticleFetcher } from '@/lib/security/safe-fetch'

describe('safe article fetcher', () => {
  afterEach(() => vi.useRealTimers())

  it.each([
    'http://example.com/story',
    'https://localhost/story',
    'https://127.0.0.1/story',
    'https://169.254.169.254/latest/meta-data',
    'https://[fec0::1]/reports/deprecated-site-local-address',
  ])('rejects unsafe destination %s before fetching', async (url) => {
    const fetchImpl = vi.fn()
    const fetchArticle = createSafeArticleFetcher({
      fetchImpl,
      lookup: async () => ['127.0.0.1'],
    })

    await expect(fetchArticle(url)).rejects.toMatchObject({ code: 'unsafe_source_url' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('revalidates redirect destinations', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://10.0.0.1/private' },
      })
    )
    const fetchArticle = createSafeArticleFetcher({
      fetchImpl,
      lookup: async (hostname) => hostname === 'publisher.test' ? ['93.184.216.34'] : ['10.0.0.1'],
    })

    await expect(fetchArticle('https://publisher.test/story')).rejects.toMatchObject({
      code: 'unsafe_source_url',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('returns a bounded text document from a public HTTPS source', async () => {
    const dispatcher = { close: vi.fn().mockResolvedValue(undefined) }
    const dispatcherFactory = vi.fn().mockReturnValue(dispatcher)
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(`<html><head><meta property="og:type" content="article"></head><body><article><h1>Report</h1><p>${'Verified facts with named sources and dated records. '.repeat(12)}</p></article></body></html>`, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    )
    const fetchArticle = createSafeArticleFetcher({
      fetchImpl,
      lookup: async () => ['93.184.216.34'],
      dispatcherFactory: dispatcherFactory as never,
    })

    await expect(fetchArticle('https://publisher.test/story')).resolves.toMatchObject({
      url: 'https://publisher.test/story',
      text: expect.stringContaining('Verified facts with named sources'),
    })
    expect(dispatcherFactory).toHaveBeenCalledWith('publisher.test', ['93.184.216.34'])
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ dispatcher }))
    expect(dispatcher.close).toHaveBeenCalledOnce()
  })

  it('accepts a large publisher page but extracts article text instead of navigation', async () => {
    const article = 'Verified reporting with named sources and dated records. '.repeat(12)
    const html = `<html><head><meta property="og:type" content="article"></head><body><nav>${'Menu '.repeat(75_000)}</nav><article><h1>Report</h1><p>${article}</p></article></body></html>`
    expect(new TextEncoder().encode(html).length).toBeGreaterThan(256 * 1024)
    const fetchArticle = createSafeArticleFetcher({
      fetchImpl: vi.fn().mockResolvedValue(new Response(html, { headers: { 'content-type': 'text/html' } })),
      lookup: async () => ['93.184.216.34'],
      dispatcherFactory: () => ({ close: async () => undefined }) as never,
    })

    const result = await fetchArticle('https://publisher.test/reports/verified-large-article')
    expect(result.text).toContain('Verified reporting with named sources')
    expect(result.text).not.toContain('Menu')
  })

  it('rejects unsupported response content types', async () => {
    const fetchArticle = createSafeArticleFetcher({
      fetchImpl: vi.fn().mockResolvedValue(new Response('binary', {
        headers: { 'content-type': 'application/octet-stream' },
      })),
      lookup: async () => ['93.184.216.34'],
    })

    await expect(fetchArticle('https://publisher.test/story')).rejects.toMatchObject({
      code: 'source_fetch_failed',
    })
  })

  it('rejects aggregation HTML even when its URL looks like an article slug', async () => {
    const fetchArticle = createSafeArticleFetcher({
      fetchImpl: vi.fn().mockResolvedValue(new Response(
        `<html><body><h1>Search results</h1><main>${'Result card summary. '.repeat(30)}</main></body></html>`,
        { headers: { 'content-type': 'text/html' } },
      )),
      lookup: async () => ['93.184.216.34'],
    })

    await expect(fetchArticle('https://publisher.test/very-long-article-looking-search-results')).rejects.toMatchObject({
      code: 'source_fetch_failed',
    })
  })

  it('rejects an oversized response before reading its body', async () => {
    const fetchArticle = createSafeArticleFetcher({
      fetchImpl: vi.fn().mockResolvedValue(new Response('small', {
        headers: { 'content-type': 'text/plain', 'content-length': '999999' },
      })),
      lookup: async () => ['93.184.216.34'],
      maxBytes: 100,
    })

    await expect(fetchArticle('https://publisher.test/story')).rejects.toMatchObject({
      code: 'source_fetch_failed',
    })
  })

  it('fails closed when a source request times out', async () => {
    const timeout = new DOMException('timed out', 'TimeoutError')
    const fetchArticle = createSafeArticleFetcher({
      fetchImpl: vi.fn().mockRejectedValue(timeout),
      lookup: async () => ['93.184.216.34'],
    })

    await expect(fetchArticle('https://publisher.test/story')).rejects.toMatchObject({
      code: 'source_fetch_failed',
    })
  })

  it('applies the timeout to DNS resolution', async () => {
    vi.useFakeTimers()
    const fetchArticle = createSafeArticleFetcher({
      fetchImpl: vi.fn(),
      lookup: async () => new Promise<string[]>(() => undefined),
      timeoutMs: 100,
    })

    const assertion = expect(fetchArticle('https://publisher.test/reports/verified-material-story'))
      .rejects.toMatchObject({ code: 'source_fetch_failed' })
    await vi.advanceTimersByTimeAsync(100)
    await assertion
  })

  it('uses one timeout deadline for DNS and the complete redirect chain', async () => {
    vi.useFakeTimers()
    const delayed = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 40))
    const fetchArticle = createSafeArticleFetcher({
      lookup: async () => delayed(['93.184.216.34']),
      fetchImpl: vi.fn().mockImplementation(() => delayed(new Response(null, {
        status: 302, headers: { location: 'https://publisher-two.test/reports/continued-story' },
      }))),
      timeoutMs: 100,
    })

    const assertion = expect(fetchArticle('https://publisher.test/reports/verified-material-story'))
      .rejects.toMatchObject({ code: 'source_fetch_failed' })
    await vi.advanceTimersByTimeAsync(100)
    await assertion
  })
})
