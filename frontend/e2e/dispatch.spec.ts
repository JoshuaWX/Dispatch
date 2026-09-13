import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { checkA11y, injectAxe } from 'axe-playwright'
import { FIXTURE_ARTICLE_ID } from './global-setup'
import { localSupabaseEnvironment } from './local-supabase'

function currentCronKey(now = new Date()) {
  const bucketHour = Math.floor(now.getUTCHours() / 2) * 2
  return `cron:${now.toISOString().slice(0, 10)}:${String(bucketHour).padStart(2, '0')}`
}

test.beforeEach(async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  ;(page as typeof page & { consoleErrors?: string[] }).consoleErrors = consoleErrors
})

test.afterEach(async ({ page }) => {
  expect((page as typeof page & { consoleErrors?: string[] }).consoleErrors).toEqual([])
})

test('home renders verified reporting with no accessibility violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'News built for scrutiny.' })).toBeVisible()
  await expect(page.getByRole('link', { name: /DISPATCH verification gate passes/ }).first()).toBeVisible()
  await injectAxe(page)
  await checkA11y(page, undefined, { detailedReport: true, detailedReportOptions: { html: true } })
})

test('URL-backed search, sort, and category filters work', async ({ page }) => {
  await page.goto('/explore')
  await page.getByLabel('Search reporting').fill('acceptance')
  await page.getByLabel('Sort stories').selectOption('trending')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page).toHaveURL(/q=acceptance/)
  await expect(page).toHaveURL(/sort=trending/)
  await expect(page.getByRole('link', { name: /DISPATCH verification gate passes/ })).toBeVisible()
  await page.getByRole('link', { name: /World · 1/ }).click()
  await expect(page).toHaveURL(/category=World/)
})

test('article renders evidence, authorship, metadata, and local assets', async ({ page }) => {
  await page.goto(`/article/${FIXTURE_ARTICLE_ID}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('verification gate passes')
  await expect(page.getByText(/AI-authored; checked in a separate/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Material claims and evidence' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Evidence', exact: true })).toBeVisible()
  await expect(page.locator('#evidence-source-1').getByRole('link', { name: 'Reuters' }))
    .toHaveAttribute('rel', /noopener/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/article/${FIXTURE_ARTICLE_ID}$`))
  const manifest = await page.request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBeTruthy()
})

test('mobile navigation has an accessible name and state', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile project only')
  await page.goto('/')
  const menu = page.locator('summary[aria-label="Navigation menu"]')
  await expect(menu).toHaveAccessibleName('Navigation menu')
  await expect(page.locator('details')).not.toHaveAttribute('open', '')
  await menu.click()
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible()
  await expect(page.locator('details')).toHaveAttribute('open', '')
})

test('public API is bounded and retired generation endpoint stays hidden', async ({ request }) => {
  const articles = await request.get('/api/articles?limit=24')
  expect(articles.ok()).toBeTruthy()
  expect((await articles.body()).byteLength).toBeLessThan(100_000)
  const retired = await request.post('/api/generate')
  expect(retired.status()).toBe(404)
  const cron = await request.post('/api/cron/generate')
  expect(cron.status()).toBe(401)
})

test('20 concurrent Cron requests claim one durable run and publish at most once', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'concurrency contract runs once')
  const { url, serviceRoleKey } = localSupabaseEnvironment()
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  const idempotencyKey = currentCronKey()
  const { data: previousRuns } = await db.from('dispatch_pipeline_runs').select('id').eq('idempotency_key', idempotencyKey)
  for (const previous of previousRuns ?? []) {
    await db.from('dispatch_articles').delete().eq('pipeline_run_id', previous.id)
  }
  const { error: cleanupError } = await db.from('dispatch_pipeline_runs').delete().eq('idempotency_key', idempotencyKey)
  expect(cleanupError).toBeNull()
  await db.from('dispatch_articles').delete().eq('topic', 'Recorded concurrency publication fixture')
  const { error: controlError } = await db.from('dispatch_operator_settings')
    .update({ publishing_enabled: true }).eq('id', true)
  expect(controlError).toBeNull()

  try {
    const responses = await Promise.all(Array.from({ length: 20 }, () => request.post('/api/cron/generate', {
      headers: { authorization: 'Bearer e2e-scheduler-secret' },
    })))
    expect(responses.every((response) => response.status() === 200)).toBeTruthy()

    const { data: runs, error: runError } = await db.from('dispatch_pipeline_runs')
      .select('id,status,result').eq('idempotency_key', idempotencyKey)
    expect(runError).toBeNull()
    expect(runs).toHaveLength(1)
    const run = runs?.[0]
    expect(run?.status, JSON.stringify(run?.result)).toBe('published')
    if (!run) throw new Error('Concurrent Cron requests did not create a run')
    const { count, error: articleError } = await db.from('dispatch_articles')
      .select('id', { count: 'exact', head: true }).eq('pipeline_run_id', run.id)
    expect(articleError).toBeNull()
    expect(count).toBe(1)
  } finally {
    await db.from('dispatch_operator_settings').update({ publishing_enabled: false }).eq('id', true)
    const { data: runs } = await db.from('dispatch_pipeline_runs').select('id').eq('idempotency_key', idempotencyKey)
    for (const run of runs ?? []) await db.from('dispatch_articles').delete().eq('pipeline_run_id', run.id)
    await db.from('dispatch_pipeline_runs').delete().eq('idempotency_key', idempotencyKey)
  }
})

test('20 concurrent AI reservations cannot exceed either budget cap', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'budget concurrency contract runs once')
  const { url, serviceRoleKey } = localSupabaseEnvironment()
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  const runId = '00000000-0000-4000-8000-000000000990'
  const dayKey = '2099-02-28'
  const monthKey = dayKey.slice(0, 7)
  await db.from('dispatch_pipeline_runs').delete().eq('id', runId)
  const { error: insertError } = await db.from('dispatch_pipeline_runs').insert({
    id: runId, idempotency_key: `budget-concurrency:${dayKey}`, trigger: 'manual', status: 'running',
  })
  expect(insertError).toBeNull()

  const attempts = await Promise.all(Array.from({ length: 20 }, () => db.rpc('dispatch_reserve_ai_budget', {
    p_run_id: runId, p_amount_usd: 0.01, p_month_key: monthKey, p_day_key: dayKey,
  })))
  expect(attempts.every((attempt) => attempt.error === null)).toBeTruthy()
  expect(attempts.filter((attempt) => attempt.data?.reserved === true)).toHaveLength(4)
  const { data: reservations, error } = await db.from('dispatch_ai_reservations')
    .select('reserved_usd').eq('run_id', runId)
  expect(error).toBeNull()
  const reserved = (reservations ?? []).reduce((total, row) => total + Number(row.reserved_usd), 0)
  expect(reserved).toBeLessThanOrEqual(0.04)
  expect(reserved).toBeLessThanOrEqual(1)
})

test('20 concurrent Virlo refresh claims permit one external fetch owner', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Virlo concurrency contract runs once')
  const { url, serviceRoleKey } = localSupabaseEnvironment()
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  const dayKey = 'e2e-virlo-lease'
  await db.from('dispatch_virlo_daily_cache').delete().eq('day_key', dayKey)

  const claims = await Promise.all(Array.from({ length: 20 }, () => db.rpc('dispatch_claim_virlo_refresh', {
    p_day_key: dayKey, p_owner: crypto.randomUUID(),
  })))
  expect(claims.every((claim) => claim.error === null)).toBeTruthy()
  expect(claims.filter((claim) => claim.data?.acquired === true)).toHaveLength(1)
})
