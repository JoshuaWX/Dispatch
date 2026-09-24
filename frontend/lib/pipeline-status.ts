import 'server-only'

import { getServiceSupabase } from '@/lib/supabase-server'

export async function getPublicPipelineStatus() {
  const db = getServiceSupabase()
  const [
    { data: settings, error: settingsError },
    { data: lastSuccess, error: successError },
    { data: lastFailure, error: failureError },
    { data: activeLease, error: leaseError },
  ] = await Promise.all([
    db.from('dispatch_operator_settings').select('publishing_enabled').eq('id', true).single(),
    db.from('dispatch_pipeline_runs').select('finished_at').eq('status', 'published')
      .order('finished_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('dispatch_pipeline_runs').select('finished_at,rejection_reason').in('status', ['failed', 'rejected'])
      .order('finished_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('dispatch_pipeline_leases').select('owner_run_id').eq('name', 'editorial')
      .gt('expires_at', new Date().toISOString()).maybeSingle(),
  ])
  if (settingsError || successError || failureError || leaseError || !settings) throw new Error('pipeline_status_unavailable')
  const publishingEnabled = settings.publishing_enabled === true && process.env.PIPELINE_PUBLISHING_ENABLED === 'true'
  return {
    status: publishingEnabled ? (activeLease ? 'running' : 'idle') : 'paused',
    lastSuccessfulRunAt: lastSuccess?.finished_at ?? null,
    lastSafeFailureAt: lastFailure?.finished_at ?? null,
    lastSafeFailureCode: lastFailure?.rejection_reason ?? null,
  }
}
