import { z } from 'zod'
import { apiError, jsonResponse, unavailable } from '@/lib/http'
import { requireOperator } from '@/lib/security/operator-route'
import { getServiceSupabase } from '@/lib/supabase-server'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = requireOperator(request)
  if (authorization.error) return authorization.error
  const id = authorization.id
  const runId = (await params).id
  if (!z.string().uuid().safeParse(runId).success) return apiError(id, 404, 'run_not_found', 'Pipeline run not found.')
  try {
    const db = getServiceSupabase()
    const [{ data: run, error }, { data: events, error: eventError }, { data: usage, error: usageError }] = await Promise.all([
      db.from('dispatch_pipeline_runs').select('*').eq('id', runId).maybeSingle(),
      db.from('dispatch_pipeline_events').select('*').eq('run_id', runId).order('created_at'),
      db.from('dispatch_ai_usage').select('model,input_tokens,output_tokens,cost_usd,created_at').eq('run_id', runId).order('created_at'),
    ])
    if (error || eventError || usageError) throw new Error('run_read_failed')
    if (!run) return apiError(id, 404, 'run_not_found', 'Pipeline run not found.')
    return jsonResponse({ run, events, usage }, {}, id)
  } catch {
    return unavailable(id)
  }
}
