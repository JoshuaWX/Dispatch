import type { Metadata } from 'next'
import { ArticleCard } from '@/components/article-card'
import { listPublicArticles } from '@/lib/articles'
import { ARTICLE_CATEGORIES, type ArticlePage } from '@/lib/dispatch-types'

export const metadata: Metadata = { title: 'Explore verified reporting', alternates: { canonical: '/explore' } }

const emptyPage: ArticlePage = { articles: [], count: 0, nextCursor: null, facets: ARTICLE_CATEGORIES.map((category) => ({ category, count: 0 })) }

export default async function ExplorePage({ searchParams }: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string; cursor?: string }>
}) {
  const params = await searchParams
  const sort = params.sort === 'trending' ? 'trending' : 'recent'
  const page = await listPublicArticles({ ...params, sort }).catch(() => emptyPage)
  const searchString = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams()
    const merged = { q: params.q, category: params.category, sort, ...changes }
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value)
    return `/explore?${next.toString()}`
  }
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Public archive</p>
        <h1 className="mt-3">Explore verified reporting</h1>
        <p className="mt-4 text-lg text-muted-foreground">Search headlines and summaries, filter by desk, or rank stories with the published trending methodology.</p>
      </header>
      <form action="/explore" method="get" role="search" className="mt-9 grid gap-3 border border-border bg-card p-4 sm:grid-cols-[1fr_auto_auto]">
        <label className="sr-only" htmlFor="story-search">Search reporting</label>
        <input id="story-search" name="q" defaultValue={params.q} maxLength={200} placeholder="Search reporting…" className="min-h-11 border border-border bg-background px-4" />
        {params.category && <input type="hidden" name="category" value={params.category} />}
        <select name="sort" defaultValue={sort} aria-label="Sort stories" className="min-h-11 border border-border bg-background px-4">
          <option value="recent">Most recent</option><option value="trending">Trending</option>
        </select>
        <button className="min-h-11 bg-primary px-6 font-semibold text-primary-foreground">Apply</button>
      </form>
      <nav aria-label="Filter by category" className="mt-5 flex flex-wrap gap-2">
        <a href={searchString({ category: undefined, cursor: undefined })} aria-current={!params.category ? 'page' : undefined} className="min-h-11 border border-border px-4 py-3 text-sm aria-[current=page]:border-primary aria-[current=page]:text-primary">All · {page.count}</a>
        {page.facets.map((facet) => (
          <a key={facet.category} href={searchString({ category: facet.category, cursor: undefined })}
            aria-current={params.category?.toLowerCase() === facet.category.toLowerCase() ? 'page' : undefined}
            className="min-h-11 border border-border px-4 py-3 text-sm aria-[current=page]:border-primary aria-[current=page]:text-primary">
            {facet.category} · {facet.count}
          </a>
        ))}
      </nav>
      <div className="mt-10 flex items-end justify-between gap-4 border-b border-border pb-4">
        <h2 className="text-2xl">{page.count} {page.count === 1 ? 'story' : 'stories'}</h2>
        <p className="text-sm text-muted-foreground">Sorted by {sort}</p>
      </div>
      {page.articles.length > 0 ? (
        <div className="mt-7 grid gap-7 md:grid-cols-2 lg:grid-cols-3">{page.articles.map((article) => <ArticleCard key={article.id} article={article} />)}</div>
      ) : (
        <div className="mt-7 border border-dashed border-border p-8"><h2 className="text-2xl">No verified stories found</h2><p className="mt-2 text-muted-foreground">Try a broader search, or return after the next successful evidence-gated run.</p></div>
      )}
      {page.nextCursor && <a href={searchString({ cursor: page.nextCursor })} className="mt-10 inline-flex min-h-11 items-center border border-primary px-5 font-semibold text-primary">Next page</a>}
    </section>
  )
}
