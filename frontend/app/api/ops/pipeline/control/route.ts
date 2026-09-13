import { z } from 'zod'
import { apiError, jsonResponse, unavailable } from '@/lib/http'
import { requireOperator } from '@/lib/security/operator-route'
import { getServiceSupabase } from '@/lib/supabase-server'

const bodySchema = z.object({ action: z.enum(['pause', 'resume']) }).strict()

export async function POST(request: Request) {
  const authorization = requireOperator(request)
  if (authorization.error) return authorization.error
  const id = authorization.id
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiError(id, 400, 'invalid_request', 'Action must be pause or resume.')
  try {
    const publishingEnabled = parsed.data.action === 'resume'
    const { error } = await getServiceSupabase().from('dispatch_operator_settings')
      .update({ publishing_enabled: publishingEnabled, updated_at: new Date().toISOString() }).eq('id', true)
    if (error) throw new Error('control_update_failed')
    return jsonResponse({ status: publishingEnabled ? 'running' : 'paused' }, {}, id)
  } catch {
    return unavailable(id)
  }
}
