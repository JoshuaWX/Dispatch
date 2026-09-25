import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Editorial methodology', alternates: { canonical: '/methodology' } }

export default function MethodologyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Transparency</p>
      <h1 className="mt-3">Editorial methodology</h1>
      <p className="mt-5 text-xl leading-8 text-muted-foreground">DISPATCH uses AI to draft reporting, but publication is controlled by deterministic evidence, verification, safety, and budget gates.</p>
      <div className="mt-10 space-y-10 text-base leading-7">
        <section><h2 className="text-2xl">Evidence threshold</h2><p className="mt-3">We discover leads from official public-interest feeds, then retrieve the original article page. A current official announcement may use one authoritative primary source, but the brief must attribute its claims to that issuer. A developing story needs at least two genuinely independent source organisations and upstream origins. Several pages repeating one release or measurement count as one origin. Search snippets, homepages, and pages without explicit compatible reuse rights do not count.</p></section>
        <section><h2 className="text-2xl">Rights and attribution</h2><p className="mt-3">We retain a short excerpt, source URL, original publication date, issuing organisation, content hash, licence evidence, and required attribution. We do not reproduce full publisher pages, third-party media, or excluded copyrighted material. The source and reuse licence are linked on every article.</p></section>
        <section><h2 className="text-2xl">Draft and fact check</h2><p className="mt-3">Gemini 3.1 Flash-Lite receives only short curated evidence excerpts and their source IDs after retrieval and rights checks pass. A fresh, lower-temperature request checks the finished article against the same evidence. Google Search grounding, URL context, external tools, and alternate model providers are disabled.</p></section>
        <section><h2 className="text-2xl">Publication gate</h2><p className="mt-3">Each material claim must map to retained evidence. For a developing story, at least one central claim must be corroborated by independent organisations and origins. The verifier must return grade A with no flags, conflicts, unsupported numbers, invented source IDs, duplicate passages, filler, or headline overstatement. A scheduled run may safely skip when no qualifying story exists.</p></section>
        <section><h2 className="text-2xl">Trending</h2><p className="mt-3">Trending rank combines publisher evidence velocity, a 72-hour recency decay, verification quality, and a small logarithmic reader-activity signal. It is never based on array position or fabricated popularity.</p></section>
        <section><h2 className="text-2xl">Corrections</h2><p className="mt-3">Questioned articles can be retracted immediately without erasing the audit record. See the corrections page for the public policy.</p></section>
      </div>
    </article>
  )
}
