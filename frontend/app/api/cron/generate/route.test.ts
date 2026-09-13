import { beforeEach, describe, expect, it, vi } from 'vitest'

const runPipeline = vi.fn()
vi.mock('@/lib/pipeline', () => ({ runPipeline }))

describe('cron generation route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.SCHEDULER_SECRET = 'scheduler-test-secret'
  })

  it('returns 401 and performs no work without scheduler authentication', async () => {
    const { POST } = await import('./route')
    const response = await POST(new Request('https://dispatch.test/api/cron/generate', { method: 'POST' }))
    expect(response.status).toBe(401)
    expect(runPipeline).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'unauthorized', requestId: expect.any(String) } })
  })

  it('ignores a forged x-vercel-cron header', async () => {
    const { POST } = await import('./route')
    const response = await POST(new Request('https://dispatch.test/api/cron/generate', {
      method: 'POST', headers: { 'x-vercel-cron': '1' },
    }))
    expect(response.status).toBe(401)
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it('uses a server-generated two-hour idempotency key for an authenticated request', async () => {
    runPipeline.mockResolvedValue({ status: 'skipped', runId: 'run-1', reason: 'publishing_paused' })
    const { POST } = await import('./route')
    const response = await POST(new Request('https://dispatch.test/api/cron/generate?strict=false', {
      method: 'POST', headers: { authorization: 'Bearer scheduler-test-secret', 'x-request-id': 'cron-request-1234' },
    }))
    expect(response.status).toBe(200)
    expect(runPipeline).toHaveBeenCalledWith(expect.objectContaining({
      trigger: 'scheduled', idempotencyKey: expect.stringMatching(/^cron:\d{4}-\d{2}-\d{2}:\d{2}$/),
      requestId: 'cron-request-1234',
    }))
    expect(runPipeline.mock.calls[0][0]).not.toHaveProperty('strict')
  })
})
