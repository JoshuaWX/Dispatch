import { createClient } from '@supabase/supabase-js'
import { localSupabaseEnvironment } from './local-supabase'

export const FIXTURE_ARTICLE_ID = '00000000-0000-4000-8000-000000000900'

export default async function globalSetup() {
  const { url, serviceRoleKey } = localSupabaseEnvironment()
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  const publishedAt = new Date().toISOString()
  const sources = [
    ['source-1', 'Reuters', 'reuters.com', 'a'],
    ['source-2', 'Associated Press', 'apnews.com', 'b'],
    ['source-3', 'BBC', 'bbc.com', 'c'],
    ['source-4', 'Nature', 'nature.com', 'd'],
  ].map(([id, name, domain, hash]) => ({
    id, name, url: `https://${domain}/reports/dispatch-fixture`, domain, reliability: 'high',
    excerpt: `Retrieved publisher evidence from ${name} supports the fixture article for local browser acceptance testing.`,
    publishedAt, contentHash: hash.repeat(64),
  }))
  const claims = [
    { id: 'claim-1', text: 'The local acceptance fixture passed its evidence checks.', sourceIds: ['source-1', 'source-2'] },
    { id: 'claim-2', text: 'Four publisher pages are attached to the fixture.', sourceIds: ['source-2', 'source-3'] },
    { id: 'claim-3', text: 'The fixture exists only in the local test database.', sourceIds: ['source-3', 'source-4'] },
  ]
  const { error: articleError } = await db.from('dispatch_articles').upsert({
    id: FIXTURE_ARTICLE_ID, topic: 'Verified local acceptance fixture',
    headline: 'DISPATCH verification gate passes local acceptance test',
    subheadline: 'A deterministic browser fixture demonstrates public rendering without contacting a live provider.',
    lede: 'The local test database contains one evidence-linked article for browser acceptance.',
    body: 'The fixture is created during Playwright setup and removed during teardown. It verifies the article reader, source links, metadata, search, filtering, and public API contract.\n\n## Why this matters\n\nCI can exercise the complete browser-to-database path without calling Gemini or any live news provider.',
    category: 'World', tags: ['testing', 'verification'], sources,
    reading_time: 2, published_at: publishedAt,
    quality_score: { sourceDiversity: 9, factualConfidence: 9, overallScore: 9, flaggedClaims: [], publishRecommendation: true },
    verification_status: 'passed', publication_status: 'published', grade: 'A', word_count: 61,
    quality_score_value: 9, what_we_do_not_know: 'The fixture does not make claims about production provider availability.',
    what_happens_next: 'The fixture is removed automatically when the browser suite ends.',
    pipeline_run_id: '00000000-0000-4000-8000-000000000901', fact_check_warnings: [],
    article_format: 'brief', trend_score: 95, topic_fingerprint: 'f'.repeat(64), publication_day: publishedAt.slice(0, 10),
  })
  if (articleError) throw new Error('Could not create browser article fixture')
  const { error: sourceError } = await db.from('dispatch_article_sources').upsert(sources.map((source) => ({
    article_id: FIXTURE_ARTICLE_ID, source_id: source.id, publisher_name: source.name,
    source_url: source.url, source_domain: new URL(source.url).hostname,
    reliability: source.reliability, excerpt: source.excerpt, content_hash: source.contentHash,
    published_at: source.publishedAt,
  })))
  const { error: claimError } = await db.from('dispatch_material_claims').upsert(claims.map((claim) => ({
    article_id: FIXTURE_ARTICLE_ID, claim_id: claim.id, claim_text: claim.text,
  })))
  const { error: mapError } = await db.from('dispatch_claim_sources').upsert(claims.flatMap((claim) => claim.sourceIds.map((sourceId) => ({
    article_id: FIXTURE_ARTICLE_ID, claim_id: claim.id, source_id: sourceId,
  }))))
  if (sourceError || claimError || mapError) throw new Error('Could not create browser evidence fixtures')
}
