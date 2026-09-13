import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Editorial methodology', alternates: { canonical: '/methodology' } }

export default function MethodologyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Transparency</p>
      <h1 className="mt-3">Editorial methodology</h1>
      <p className="mt-5 text-xl leading-8 text-muted-foreground">DISPATCH uses AI to draft reporting, but publication is controlled by deterministic evidence, verification, safety, and budget gates.</p>
      <div className="mt-10 space-y-10 text-base leading-7">
        <section><h2 className="text-2xl">Evidence threshold</h2><p className="mt-3">A candidate needs at least four successfully retrieved article pages from three independent domains, two published within 72 hours, and one high-reliability source. Search snippets and homepages do not count.</p></section>
        <section><h2 className="text-2xl">Draft and fact check</h2><p className="mt-3">Gemini 2.5 Flash receives only short evidence excerpts and their source IDs. A fresh, lower-temperature request then checks the finished article against the same evidence. Google Search grounding, URL context, external tools, and alternate model providers are disabled.</p></section>
        <section><h2 className="text-2xl">Publication gate</h2><p className="mt-3">Each material claim must map to retained evidence, one claim must be corroborated by two publishers, and the verifier must return grade A with no flags, conflicts, unsupported numbers, invented source IDs, duplicate passages, filler, or headline overstatement.</p></section>
        <section><h2 className="text-2xl">Trending</h2><p className="mt-3">Trending rank combines publisher evidence velocity, a 72-hour recency decay, verification quality, and a small logarithmic reader-activity signal. It is never based on array position or fabricated popularity.</p></section>
        <section><h2 className="text-2xl">Corrections</h2><p className="mt-3">Questioned articles can be retracted immediately without erasing the audit record. See the corrections page for the public policy.</p></section>
      </div>
    </article>
  )
}
