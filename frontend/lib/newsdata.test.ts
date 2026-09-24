import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTopics, searchNewsData } from '@/lib/newsdata'

describe('NewsData provider permission gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    ;(globalThis as typeof globalThis & {
      __dispatchNewsDataCache?: unknown
      __dispatchNewsSearchCache?: unknown
    }).__dispatchNewsDataCache = undefined
    ;(globalThis as typeof globalThis & { __dispatchNewsSearchCache?: unknown }).__dispatchNewsSearchCache = undefined
  })

  it('makes no topic or search request when production API use is not approved', async () => {
    vi.stubEnv('NEWSDATA_API_KEY', 'test-token')
    vi.stubEnv('NEWSDATA_API_USE_APPROVED', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getTopics()).resolves.toEqual([])
    await expect(searchNewsData('Verified material development')).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not return cached topics after approval is withdrawn', async () => {
    vi.stubEnv('NEWSDATA_API_KEY', 'test-token')
    vi.stubEnv('NEWSDATA_API_USE_APPROVED', 'true')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ title: 'Verified agency development', category: ['science'] }],
    }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getTopics()).resolves.toEqual(['Verified agency development'])
    vi.stubEnv('NEWSDATA_API_USE_APPROVED', 'false')
    await expect(getTopics()).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
