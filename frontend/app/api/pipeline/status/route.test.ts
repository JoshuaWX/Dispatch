import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({ from: vi.fn() }))
const latest: {
  success: { finished_at: string } | null
  failure: { finished_at: string; rejection_reason: string } | null
} = { success: null, failure: null }
let usage: Array<{ cost_usd: number }> = []

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase-server', () => ({ getServiceSupabase: () => database }))

import { GET } from './route'

describe('public pipeline status route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('PIPELINE_PUBLISHING_ENABLED', 'true')
    latest.success = null
    latest.failure = null
    usage = []

    const tables = {
      dispatch_operator_settings: {
        select() { return this },
        eq() { return this },
        single: async () => ({ data: {
          publishing_enabled: true,
          monthly_budget_usd: 0.19,
          budget_warning_usd: 0.15,
        }, error: null }),
      },
      dispatch_pipeline_leases: {
        select() { return this },
        eq() { return this },
        gt() { return this },
        maybeSingle: async () => ({ data: null, error: null }),
      },
      dispatch_ai_usage: {
        select() { return this },
        gte: async () => ({ data: usage, error: null }),
      },
    }
    database.from.mockImplementation((table: string) => {
      if (table === 'dispatch_pipeline_runs') {
        let kind = ''
        return {
          select() { return this },
          eq(_column: string, value: string) { kind = value; return this },
          in() { kind = 'failure'; return this },
          order() { return this },
          limit() { return this },
          maybeSingle: async () => ({ data: kind === 'published' ? latest.success : latest.failure, error: null }),
        }
      }
      return tables[table as keyof typeof tables]
    })
  })

  afterEach(() => vi.unstubAllEnvs())

  it('reports idle when an old running record has no active lease', async () => {
    const response = await GET(new Request('https://dispatch.test/api/pipeline/status'))

    expect(response.status).toBe(200)
    expect((await response.json()).status).toBe('idle')
  })

  it('reports a redacted warning when this month reaches the configured budget threshold', async () => {
    usage = [{ cost_usd: 0.15 }]

    const response = await GET(new Request('https://dispatch.test/api/pipeline/status'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ budgetStatus: 'warning' })
  })

  it('reports an exhausted status only when the hard monthly cap is reached', async () => {
    usage = [{ cost_usd: 0.19 }]

    const response = await GET(new Request('https://dispatch.test/api/pipeline/status'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ budgetStatus: 'exhausted' })
  })

  it('reports the latest durable success and failure even after many skipped runs', async () => {
    latest.success = { finished_at: '2026-09-13T10:00:00Z' }
    latest.failure = { finished_at: '2026-09-14T08:20:00Z', rejection_reason: 'stale_run_expired' }
    const response = await GET(new Request('https://dispatch.test/api/pipeline/status'))
    const status = await response.json()
    expect(status).toMatchObject({
      status: 'idle',
      lastSuccessfulRunAt: '2026-09-13T10:00:00Z',
      lastSafeFailureAt: '2026-09-14T08:20:00Z',
      lastSafeFailureCode: 'stale_run_expired',
    })
    expect(database.from).toHaveBeenCalledWith('dispatch_pipeline_runs')
  })
})
