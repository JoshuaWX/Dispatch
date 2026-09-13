import { ArticleCard } from '@/components/article-card'
import { NewsTicker } from '@/components/news-ticker'
import type { ArticlePage } from '@/lib/dispatch-types'

export function HomePage({ recent, trending }: { recent: ArticlePage; trending: ArticlePage }) {
  const featured = recent.articles[0]
  const remaining = recent.articles.slice(1, 7)
  return (
    <>
      <NewsTicker articles={recent.articles} />
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="max-w-3xl">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-primary">Evidence before publication</p>
          <h1>News built for scrutiny.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            DISPATCH is an AI-authored newsroom. Every public story passes a separate fact check and links its material claims to retrieved publisher evidence.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="/explore" className="min-h-11 bg-primary px-5 py-3 font-semibold text-primary-foreground">Browse verified reporting</a>
            <a href="/methodology" className="min-h-11 border border-border px-5 py-3 font-semibold">Read the methodology</a>
          </div>
        </div>

        <div className="mt-12">
          {featured ? <ArticleCard article={featured} featured /> : (
            <div className="border border-dashed border-border bg-card p-8">
              <h2 className="text-2xl">Publishing is safely paused</h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">No article is public until it satisfies the new evidence and verification gate.</p>
            </div>
          )}
        </div>

        {remaining.length > 0 && (
          <section aria-labelledby="latest-heading" className="mt-16">
            <div className="mb-7 flex items-end justify-between gap-4 border-b border-border pb-4">
              <h2 id="latest-heading">Latest reporting</h2>
              <a href="/explore?sort=recent" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">View all</a>
            </div>
            <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">
              {remaining.map((article) => <ArticleCard key={article.id} article={article} />)}
            </div>
          </section>
        )}

        {trending.articles.length > 0 && (
          <section aria-labelledby="trending-heading" className="mt-16">
            <div className="mb-7 border-b border-border pb-4">
              <h2 id="trending-heading">Trending by evidence velocity</h2>
              <p className="mt-2 text-sm text-muted-foreground">Ranked from publisher velocity, recency decay, verification score, and reader activity.</p>
            </div>
            <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">
              {trending.articles.slice(0, 3).map((article) => <ArticleCard key={article.id} article={article} />)}
            </div>
          </section>
        )}
      </section>
    </>
  )
}
