import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase-server', () => ({ getServiceSupabase: () => ({ rpc }) }))

describe('article view route', () => {
  beforeEach(() => rpc.mockReset().mockResolvedValue({ data: 10, error: null }))

  it('uses the trusted platform address and ignores attacker-controlled user-agent changes', async () => {
    const { POST } = await import('./route')
    const id = '00000000-0000-4000-8000-000000000900'
    const params = { params: Promise.resolve({ id }) }
    await POST(new Request(`https://dispatch.test/api/articles/${id}/views`, {
      method: 'POST',
      headers: {
        'x-vercel-forwarded-for': '203.0.113.10',
        'x-forwarded-for': '198.51.100.1',
        'user-agent': 'attacker-variant-one',
      },
    }), params)
    await POST(new Request(`https://dispatch.test/api/articles/${id}/views`, {
      method: 'POST',
      headers: {
        'x-vercel-forwarded-for': '203.0.113.10',
        'x-forwarded-for': '198.51.100.200',
        'user-agent': 'attacker-variant-two',
      },
    }), params)

    const firstKey = rpc.mock.calls[0][1].p_client_key
    const secondKey = rpc.mock.calls[1][1].p_client_key
    expect(firstKey).toMatch(/^[0-9a-f]{64}$/)
    expect(secondKey).toBe(firstKey)
  })

  it('rejects malformed article IDs before touching the database', async () => {
    const { POST } = await import('./route')
    const response = await POST(new Request('https://dispatch.test/api/articles/not-an-id/views', { method: 'POST' }), {
      params: Promise.resolve({ id: 'not-an-id' }),
    })

    expect(response.status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })
})
