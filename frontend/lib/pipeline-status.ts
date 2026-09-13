import 'server-only'

import { getServiceSupabase } from '@/lib/supabase-server'

export async function getPublicPipelineStatus() {
  const db = getServiceSupabase()
  const [{ data: settings, error: settingsError }, { data: runs, error: runsError }] = await Promise.all([
    db.from('dispatch_operator_settings').select('publishing_enabled').eq('id', true).single(),
    db.from('dispatch_pipeline_runs').select('status,started_at,finished_at,rejection_reason')
      .order('started_at', { ascending: false }).limit(25),
  ])
  if (settingsError || runsError || !settings || !runs) throw new Error('pipeline_status_unavailable')
  const running = runs.find((run) => run.status === 'running')
  const lastSuccess = runs.find((run) => run.status === 'published')
  const lastFailure = runs.find((run) => run.status === 'failed' || run.status === 'rejected')
  const publishingEnabled = settings.publishing_enabled === true && process.env.PIPELINE_PUBLISHING_ENABLED === 'true'
  return {
    status: publishingEnabled ? (running ? 'running' : 'idle') : 'paused',
    lastSuccessfulRunAt: lastSuccess?.finished_at ?? null,
    lastSafeFailureAt: lastFailure?.finished_at ?? null,
    lastSafeFailureCode: lastFailure?.rejection_reason ?? null,
  }
}
