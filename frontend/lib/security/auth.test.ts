import { describe, expect, it } from 'vitest'
import { authorizeBearer } from '@/lib/security/auth'

describe('authorizeBearer', () => {
  it('rejects a missing bearer token', () => {
    expect(authorizeBearer(new Request('https://dispatch.test'), 'expected-secret')).toBe(false)
  })

  it('rejects a forged scheduler metadata header', () => {
    const request = new Request('https://dispatch.test', {
      headers: { 'x-vercel-cron': '1' },
    })

    expect(authorizeBearer(request, 'expected-secret')).toBe(false)
  })

  it('accepts only the configured bearer token', () => {
    const request = new Request('https://dispatch.test', {
      headers: { authorization: 'Bearer expected-secret' },
    })

    expect(authorizeBearer(request, 'expected-secret')).toBe(true)
    expect(authorizeBearer(request, 'different-secret')).toBe(false)
  })
})
