import { describe, expect, it } from 'vitest'
import { createFirstPartySources, GOV_UK_FEED } from '@/lib/first-party-sources'
import { fetchFeedSafely, fetchArticleSafely, fetchJsonSafely } from '@/lib/security/safe-fetch'

// Manual staging smoke only. CI never contacts a live source or Gemini.
describe.skipIf(process.env.DISPATCH_LIVE_SOURCE_SMOKE !== 'true')('live first-party source smoke', () => {
  it('finds a current rights-cleared article before any model call', async () => {
    const govFeed = await fetchFeedSafely(GOV_UK_FEED, new Set(['www.gov.uk']))
    expect(govFeed.text).toContain('<feed')
    const sources = createFirstPartySources({
      fetchFeed: async (url) => url === GOV_UK_FEED ? govFeed : { url, text: '<rss><channel></channel></rss>', raw: '', contentHash: '0'.repeat(64) },
      fetchArticle: fetchArticleSafely,
      fetchJson: fetchJsonSafely,
      now: () => new Date(),
    })
    const topics = await sources.discover(new Set())
    expect(topics.length).toBeGreaterThan(0)
    let evidence = [] as Awaited<ReturnType<typeof sources.collect>>
    for (const topic of topics.slice(0, 6)) {
      evidence = await sources.collect(topic)
      if (evidence.length) break
    }
    expect(evidence).toEqual([expect.objectContaining({
      isPrimary: true,
      reliability: 'high',
      attribution: expect.any(String),
      licenceEvidence: expect.any(String),
    })])
  }, 90_000)
})
