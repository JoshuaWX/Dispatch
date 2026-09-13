import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Corrections policy', alternates: { canonical: '/corrections' } }

export default function CorrectionsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Accountability</p>
      <h1 className="mt-3">Corrections and retractions</h1>
      <div className="mt-8 space-y-7 text-lg leading-8">
        <p>When credible evidence challenges a published article, publication is paused for that record while the claim and its original sources are reviewed.</p>
        <p>A material error results in retraction. The article leaves every public feed immediately, while its ID, content, evidence, run history, and machine-readable reason remain preserved for audit and recovery.</p>
        <p>Minor corrections require a dated correction note and a complete repeat of the verification gate before republication. DISPATCH does not silently overwrite published reporting.</p>
      </div>
    </article>
  )
}
