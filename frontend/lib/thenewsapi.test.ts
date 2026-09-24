import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchTheNewsApi } from '@/lib/thenewsapi'

describe('TheNewsAPI publisher discovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    ;(globalThis as typeof globalThis & { __dispatchTheNewsApiSearchCache?: unknown }).__dispatchTheNewsApiSearchCache = undefined
  })

  it('queries only explicitly approved domains', async () => {
    vi.stubEnv('THENEWSAPI_KEY', 'test-token')
    const fetchMock = vi.fn(async (input: string) => {
      expect(new URL(input).hostname).toBe('api.thenewsapi.com')
      const article = { title: 'Approved report', url: 'https://publisher.com/world/2026/sep/23/report', source: 'Publisher', published_at: '2026-09-23T12:00:00Z' }
      return new Response(JSON.stringify({ data: [article] }), { headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchTheNewsApi('Verified material development', new Set(['publisher.com']))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('domains')).toBe('publisher.com')
    expect(results.map((result) => result.source)).toEqual(['Publisher'])
  })

  it('makes no request without approved domains', async () => {
    vi.stubEnv('THENEWSAPI_KEY', 'test-token')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchTheNewsApi('Verified material development', new Set())).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when the approved-domain query fails', async () => {
    vi.stubEnv('THENEWSAPI_KEY', 'test-token')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 429 })))

    await expect(searchTheNewsApi('Another verified development', new Set(['publisher.com']))).resolves.toEqual([])
  })
})
