import type { Metadata } from 'next'
import { getPublicPipelineStatus } from '@/lib/pipeline-status'

export const metadata: Metadata = { title: 'Pipeline status', alternates: { canonical: '/pipeline' } }

export default async function PipelinePage() {
  const status = await getPublicPipelineStatus().catch(() => ({ status: 'unavailable', lastSuccessfulRunAt: null, lastSafeFailureAt: null, lastSafeFailureCode: null }))
  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Redacted public health</p>
      <h1 className="mt-3">Editorial pipeline</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">This page reports safe operational state without exposing prompts, secrets, unpublished topics, or private rejection details.</p>
      <dl className="mt-10 grid gap-px border border-border bg-border sm:grid-cols-3">
        <div className="bg-card p-6"><dt className="text-sm text-muted-foreground">Current state</dt><dd className="mt-2 text-2xl font-semibold capitalize">{status.status}</dd></div>
        <div className="bg-card p-6"><dt className="text-sm text-muted-foreground">Last publication</dt><dd className="mt-2 text-base font-semibold">{status.lastSuccessfulRunAt ? new Date(status.lastSuccessfulRunAt).toISOString() : 'None under the new gate'}</dd></div>
        <div className="bg-card p-6"><dt className="text-sm text-muted-foreground">Last safe rejection</dt><dd className="mt-2 text-base font-semibold">{status.lastSafeFailureCode ?? 'None recorded'}</dd></div>
      </dl>
      <div className="mt-10 border-l-4 border-primary bg-primary/5 p-6"><h2 className="text-2xl">Fail closed by design</h2><p className="mt-3 leading-7 text-muted-foreground">If Gemini, Supabase, evidence retrieval, the budget ledger, or any verification gate is unavailable, nothing is published. No alternate editorial model is used.</p></div>
      <a href="/methodology" className="mt-8 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">Read the complete methodology</a>
    </section>
  )
}
