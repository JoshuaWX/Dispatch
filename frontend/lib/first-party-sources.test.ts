import { describe, expect, it, vi } from 'vitest'
import { createFirstPartySources } from '@/lib/first-party-sources'

const govFeed = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Latest government announcement on research funding</title><updated>2026-09-24T12:00:00Z</updated><link href="https://www.gov.uk/government/news/latest-government-announcement-on-research-funding" /></entry>
<entry><title>Old publication recirculated</title><updated>2026-09-24T12:01:00Z</updated><link href="https://www.gov.uk/government/publications/old-publication-recirculated" /></entry>
</feed>`
const govUrl = 'https://www.gov.uk/government/news/latest-government-announcement-on-research-funding'
const govHtml = `<html><head><meta property="og:type" content="article"></head><body><main><h1>Latest government announcement on research funding</h1><p>${'The agency announced a research funding decision today. '.repeat(12)}</p></main><footer>All content is available under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">Open Government Licence v3.0</a>, except where otherwise stated.</footer></body></html>`
const govContent = {
  schema_name: 'news_article', document_type: 'news_story', title: 'Latest government announcement on research funding',
  first_published_at: '2026-09-24T11:00:00Z', public_updated_at: '2026-09-24T12:00:00Z',
  links: { organisations: [{ title: 'Department for Science, Innovation and Technology', base_path: '/government/organisations/department-for-science-innovation-and-technology' }] },
}

function dependencies(html = govHtml, content = govContent) {
  return {
    fetchFeed: vi.fn().mockImplementation(async (url: string) => ({ url, text: url.includes('gov.uk') ? govFeed : '<rss><channel></channel></rss>', raw: '', contentHash: 'a'.repeat(64) })),
    fetchArticle: vi.fn().mockResolvedValue({ url: govUrl, text: 'The agency announced a research funding decision today. '.repeat(12), raw: html, contentHash: 'b'.repeat(64) }),
    fetchJson: vi.fn().mockResolvedValue({ url: 'https://www.gov.uk/api/content/government/news/latest-government-announcement-on-research-funding', text: JSON.stringify(content), raw: JSON.stringify(content), contentHash: 'c'.repeat(64) }),
    now: () => new Date('2026-09-24T14:00:00Z'),
  }
}

describe('first-party evidence', () => {
  it('discovers only article links and excludes already published source URLs', async () => {
    const sources = createFirstPartySources(dependencies())
    const topics = await sources.discover(new Set())
    expect(topics).toEqual(expect.arrayContaining([expect.objectContaining({ sourceUrl: govUrl, storyKind: 'official_announcement' })]))
    expect(topics.some((topic) => topic.sourceUrl?.includes('/publications/'))).toBe(false)
    expect(await sources.discover(new Set([govUrl]))).toEqual([])
  })

  it('collects a current announcement with original timestamp, issuing organisation and OGL attribution', async () => {
    const deps = dependencies()
    const sources = createFirstPartySources(deps)
    const [topic] = await sources.discover(new Set())
    const evidence = await sources.collect(topic)
    expect(evidence).toEqual([expect.objectContaining({
      url: govUrl, publishedAt: '2026-09-24T11:00:00.000Z',
      organisationId: 'uk-government:department-for-science-innovation-and-technology',
      isPrimary: true, licenceId: 'OGL-3.0',
      attribution: expect.stringContaining('Open Government Licence v3.0'),
      discoveryUrl: 'https://www.gov.uk/search/news-and-communications.atom',
    })])
    expect(deps.fetchArticle).toHaveBeenCalledWith(govUrl, new Set(['www.gov.uk']))
  })

  it.each([
    ['no page-level licence', govHtml.replace('Open Government Licence v3.0', 'All rights reserved'), govContent],
    ['explicit third-party exception', govHtml.replace('</main>', '<p>Third-party copyright applies to this article.</p></main>'), govContent],
    ['not a news article', govHtml, { ...govContent, schema_name: 'publication' }],
    ['old original date', govHtml, { ...govContent, first_published_at: '2026-08-01T11:00:00Z' }],
  ])('rejects %s before evidence reaches Gemini', async (_name, html, content) => {
    const sources = createFirstPartySources(dependencies(html, content))
    const [topic] = await sources.discover(new Set())
    await expect(sources.collect(topic)).resolves.toEqual([])
  })

  it('rejects a feed with a DTD before accepting any discovery lead', async () => {
    const deps = dependencies()
    deps.fetchFeed.mockImplementation(async (url: string) => ({ url, text: '<!DOCTYPE feed [<!ENTITY x "boom">]><feed></feed>', raw: '', contentHash: 'a'.repeat(64) }))
    await expect(createFirstPartySources(deps).discover(new Set())).resolves.toEqual([])
  })
})
