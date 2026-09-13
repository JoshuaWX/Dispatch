import type { ArticleSummary } from '@/lib/dispatch-types'

export function NewsTicker({ articles }: { articles: ArticleSummary[] }) {
  if (articles.length === 0) return null
  return (
    <aside aria-label="Latest verified headlines" className="border-y border-primary/30 bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-7xl items-center gap-4 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.2em]">Latest</span>
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-primary-foreground/35" />
        {articles.slice(0, 5).map((article) => (
          <a key={article.id} href={`/article/${article.id}`} className="min-h-11 shrink-0 content-center text-sm font-semibold underline-offset-4 hover:underline">
            {article.headline}
          </a>
        ))}
      </div>
    </aside>
  )
}
