import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ getServiceSupabase: () => db }))

import { POST } from './route'

describe('one-time staging Vault sync', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'codex/dispatch-production-rollout')
    vi.stubEnv('DISPATCH_STAGING_BYPASS_TRANSFER', 'recorded-test-bypass-secret')
    db.rpc.mockReset().mockResolvedValue({ data: true, error: null })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('is absent outside the staging Preview branch', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const response = await POST(new Request('https://dispatch.test/api/ops/staging-vault-sync', { method: 'POST' }))
    expect(response.status).toBe(404)
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('rejects requests without the rotated bearer and makes no database call', async () => {
    const response = await POST(new Request('https://dispatch.test/api/ops/staging-vault-sync', { method: 'POST' }))
    expect(response.status).toBe(401)
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('copies the secret only through the staging service-role RPC', async () => {
    const response = await POST(new Request('https://dispatch.test/api/ops/staging-vault-sync', {
      method: 'POST', headers: { authorization: 'Bearer recorded-test-bypass-secret' },
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ synced: true })
    expect(db.rpc).toHaveBeenCalledWith('dispatch_rotate_staging_preview_bypass', {
      p_secret: 'recorded-test-bypass-secret',
    })
  })
})
