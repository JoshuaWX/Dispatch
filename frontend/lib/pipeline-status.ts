import 'server-only'

import { getServiceSupabase } from '@/lib/supabase-server'

export async function getPublicPipelineStatus() {
  const db = getServiceSupabase()
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const [
    { data: settings, error: settingsError },
    { data: lastSuccess, error: successError },
    { data: lastFailure, error: failureError },
    { data: activeLease, error: leaseError },
    { data: usage, error: usageError },
  ] = await Promise.all([
    db.from('dispatch_operator_settings').select('publishing_enabled,monthly_budget_usd,budget_warning_usd').eq('id', true).single(),
    db.from('dispatch_pipeline_runs').select('finished_at').eq('status', 'published')
      .order('finished_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('dispatch_pipeline_runs').select('finished_at,rejection_reason').in('status', ['failed', 'rejected'])
      .order('finished_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('dispatch_pipeline_leases').select('owner_run_id').eq('name', 'editorial')
      .gt('expires_at', new Date().toISOString()).maybeSingle(),
    db.from('dispatch_ai_usage').select('cost_usd').gte('created_at', monthStart),
  ])
  if (settingsError || successError || failureError || leaseError || usageError || !settings || !usage) {
    throw new Error('pipeline_status_unavailable')
  }
  const publishingEnabled = settings.publishing_enabled === true && process.env.PIPELINE_PUBLISHING_ENABLED === 'true'
  const monthlyBudget = Number(settings.monthly_budget_usd)
  const warningBudget = Number(settings.budget_warning_usd)
  const monthlySpend = usage.reduce((total, record) => total + Number(record.cost_usd), 0)
  if (![monthlyBudget, warningBudget, monthlySpend].every(Number.isFinite) || monthlyBudget <= 0 || warningBudget < 0) {
    throw new Error('pipeline_status_unavailable')
  }
  const budgetStatus = monthlySpend >= monthlyBudget
    ? 'exhausted'
    : monthlySpend >= Math.min(warningBudget, monthlyBudget)
      ? 'warning'
      : 'ok'
  return {
    status: publishingEnabled ? (activeLease ? 'running' : 'idle') : 'paused',
    budgetStatus,
    lastSuccessfulRunAt: lastSuccess?.finished_at ?? null,
    lastSafeFailureAt: lastFailure?.finished_at ?? null,
    lastSafeFailureCode: lastFailure?.rejection_reason ?? null,
  }
}
