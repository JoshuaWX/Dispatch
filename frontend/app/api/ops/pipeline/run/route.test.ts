import { beforeEach, describe, expect, it, vi } from 'vitest'

const runPipeline = vi.fn()
const rpc = vi.fn()
vi.mock('@/lib/pipeline', () => ({ runPipeline }))
vi.mock('@/lib/supabase-server', () => ({ getServiceSupabase: () => ({ rpc }) }))

describe('operator pipeline route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.OPS_ADMIN_TOKEN = 'operator-test-secret'
  })

  it('returns 401 with no model or database work for an unauthenticated request', async () => {
    const { POST } = await import('./route')
    const response = await POST(new Request('https://dispatch.test/api/ops/pipeline/run', {
      method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'idempotency-key': 'attempt-1' },
    }))
    expect(response.status).toBe(401)
    expect(runPipeline).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('requires an idempotency key before touching the database', async () => {
    const { POST } = await import('./route')
    const response = await POST(new Request('https://dispatch.test/api/ops/pipeline/run', {
      method: 'POST', body: '{}', headers: { 'content-type': 'application/json', authorization: 'Bearer operator-test-secret' },
    }))
    expect(response.status).toBe(400)
    expect(runPipeline).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('passes the validated HTTP request ID into the durable pipeline run', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    runPipeline.mockResolvedValue({ status: 'skipped', runId: 'run-1', reason: 'publishing_paused' })
    const { POST } = await import('./route')
    const response = await POST(new Request('https://dispatch.test/api/ops/pipeline/run', {
      method: 'POST',
      body: '{}',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer operator-test-secret',
        'idempotency-key': 'request-correlation',
        'x-request-id': 'operator-request-1234',
      },
    }))

    expect(response.status).toBe(200)
    expect(runPipeline).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'operator-request-1234' }))
  })
})
