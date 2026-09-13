import type { PublishedArticle } from '@/lib/dispatch-types'
import { formatPublishedAt } from '@/lib/presentation'

function Body({ value }: { value: string }) {
  const blocks = value.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
  return blocks.map((block, index) => {
    const heading = block.match(/^#{2,3}\s+(.+)$/)
    if (heading) return <h2 key={index} className="mt-10 text-2xl">{heading[1]}</h2>
    if (block.startsWith('>')) return <blockquote key={index} className="border-l-4 border-primary pl-5 text-xl italic">{block.replace(/^>\s*/, '')}</blockquote>
    return <p key={index}>{block.replace(/\n/g, ' ')}</p>
  })
}

export function ArticleReader({ article }: { article: PublishedArticle }) {
  const sourceById = new Map(article.sources.map((source) => [source.id, source]))
  return (
    <article className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <a href="/explore" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">← Back to reporting</a>
      <header className="mt-6 max-w-4xl border-b border-border pb-8">
        <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
          <span>{article.category}</span><span aria-hidden="true">·</span><span>{article.format}</span>
        </div>
        <h1 className="mt-4">{article.headline}</h1>
        <p className="mt-5 text-xl leading-8 text-muted-foreground">{article.subheadline}</p>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span>AI-authored; checked in a separate Gemini 2.5 Flash verification pass</span>
          <time dateTime={article.publishedAt}>{formatPublishedAt(article.publishedAt)}</time>
          <span>{article.readingTime} min read</span>
        </div>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="max-w-3xl">
          <p className="text-xl font-semibold leading-8">{article.lede}</p>
          <div className="mt-8 space-y-6 text-lg leading-8"><Body value={article.body} /></div>
          <section aria-labelledby="claims-heading" className="mt-12 border-t border-border pt-8">
            <h2 id="claims-heading" className="text-2xl">Material claims and evidence</h2>
            <p className="mt-3 text-muted-foreground">Each publication claim links to the stored publisher evidence used by the verification gate.</p>
            <ol className="mt-6 space-y-5">
              {article.claims.map((claim) => (
                <li key={claim.id} className="border-l-2 border-primary pl-4">
                  <p className="leading-7">{claim.text}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Evidence:{' '}
                    {claim.sourceIds.map((sourceId, index) => {
                      const source = sourceById.get(sourceId)
                      if (!source) return null
                      return (
                        <span key={sourceId}>
                          {index > 0 ? ', ' : ''}
                          <a href={`#evidence-${source.id}`} className="font-semibold text-primary underline underline-offset-4">
                            {source.name}
                          </a>
                        </span>
                      )
                    })}
                  </p>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="unknown-heading" className="mt-12 border-l-4 border-border bg-muted/50 p-6">
            <h2 id="unknown-heading" className="text-xl">What we do not know</h2>
            <p className="mt-3 leading-7 text-muted-foreground">{article.whatWeDoNotKnow}</p>
          </section>
          <section aria-labelledby="next-heading" className="mt-6 border-l-4 border-primary bg-primary/5 p-6">
            <h2 id="next-heading" className="text-xl">What happens next</h2>
            <p className="mt-3 leading-7 text-muted-foreground">{article.whatHappensNext}</p>
          </section>
        </div>

        <aside aria-labelledby="evidence-heading" className="h-fit border border-border bg-card p-5 lg:sticky lg:top-24">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Verification passed · Grade A</p>
          <h2 id="evidence-heading" className="mt-3 text-2xl">Evidence</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Short excerpts are retained for audit. Publisher pages open in a new tab.</p>
          <ol className="mt-5 space-y-5">
            {article.sources.map((source) => (
              <li id={`evidence-${source.id}`} key={source.id} className="scroll-mt-28 border-t border-border pt-4 first:border-0 first:pt-0">
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-4 hover:underline">{source.name}</a>
                <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{source.reliability} reliability · {formatPublishedAt(source.publishedAt)}</p>
                <p className="mt-2 text-sm leading-6">{source.excerpt}</p>
              </li>
            ))}
          </ol>
          <a href="/methodology" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">How verification works</a>
        </aside>
      </div>
    </article>
  )
}
