import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchTheNewsApi } from '@/lib/thenewsapi'

describe('TheNewsAPI publisher discovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    ;(globalThis as typeof globalThis & { __dispatchTheNewsApiSearchCache?: unknown }).__dispatchTheNewsApiSearchCache = undefined
  })

  it('merges a trusted-domain query with the general results', async () => {
    vi.stubEnv('THENEWSAPI_KEY', 'test-token')
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input)
      const article = url.searchParams.has('domains')
        ? { title: 'Trusted report', url: 'https://www.theguardian.com/world/2026/sep/23/trusted-report', source: 'The Guardian', published_at: '2026-09-23T12:00:00Z' }
        : { title: 'General report', url: 'https://example.com/world/2026/sep/23/general-report', source: 'Example', published_at: '2026-09-23T12:00:00Z' }
      return new Response(JSON.stringify({ data: [article] }), { headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchTheNewsApi('Verified material development')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.some(([input]) => new URL(input).searchParams.get('domains')?.includes('theguardian.com'))).toBe(true)
    expect(results.map((result) => result.source)).toEqual(['Example', 'The Guardian'])
  })

  it('keeps general discovery available when the trusted query fails', async () => {
    vi.stubEnv('THENEWSAPI_KEY', 'test-token')
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (new URL(input).searchParams.has('domains')) return new Response(null, { status: 429 })
      return new Response(JSON.stringify({ data: [{
        title: 'General report', url: 'https://example.com/world/2026/sep/23/general-report',
        source: 'Example', published_at: '2026-09-23T12:00:00Z',
      }] }))
    }))

    await expect(searchTheNewsApi('Another verified development')).resolves.toMatchObject([{ source: 'Example' }])
  })
})
