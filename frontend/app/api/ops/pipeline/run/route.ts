import { z } from 'zod'
import { apiError, jsonResponse, unavailable } from '@/lib/http'
import { runPipeline } from '@/lib/pipeline'
import { requireOperator } from '@/lib/security/operator-route'
import { getServiceSupabase } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const maxDuration = 90

const bodySchema = z.object({ topic: z.string().trim().min(4).max(240).optional() }).strict()

export async function POST(request: Request) {
  const authorization = requireOperator(request)
  if (authorization.error) return authorization.error
  const id = authorization.id
  const idempotencyKey = request.headers.get('idempotency-key')?.trim()
  if (!idempotencyKey || idempotencyKey.length > 240) {
    return apiError(id, 400, 'idempotency_key_required', 'A valid Idempotency-Key header is required.')
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return apiError(id, 400, 'invalid_request', 'The request body is invalid.')

  try {
    const db = getServiceSupabase()
    const { data: allowed, error } = await db.rpc('dispatch_take_rate_limit', {
      p_bucket_key: 'operator:pipeline-run', p_limit: 10, p_window_seconds: 3600,
    })
    if (error) throw new Error('rate_limit_unavailable')
    if (!allowed) return apiError(id, 429, 'rate_limited', 'Too many pipeline requests.')
    const result = await runPipeline({ trigger: 'manual', topic: parsed.data.topic, idempotencyKey, requestId: id })
    return jsonResponse(result, { status: result.status === 'published' ? 201 : result.status === 'failed' ? 503 : 200 }, id)
  } catch {
    return unavailable(id)
  }
}
