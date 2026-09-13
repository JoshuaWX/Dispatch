import Image from 'next/image'
import type { ArticleSummary } from '@/lib/dispatch-types'
import { categoryArtwork, formatPublishedAt } from '@/lib/presentation'

export function ArticleCard({ article, featured = false }: { article: ArticleSummary; featured?: boolean }) {
  return (
    <article className={`group h-full overflow-hidden border border-border bg-card ${featured ? 'md:grid md:grid-cols-[1.25fr_1fr]' : ''}`}>
      <div className={`relative min-h-48 overflow-hidden bg-muted ${featured ? 'md:min-h-80' : ''}`}>
        <Image
          src={categoryArtwork(article.category)}
          alt=""
          fill
          className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.02]"
          sizes={featured ? '(max-width: 768px) 100vw, 55vw' : '(max-width: 768px) 100vw, 33vw'}
        />
      </div>
      <div className="flex h-full flex-col p-5 sm:p-6">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">{article.category}</p>
        <h2 className={`${featured ? 'text-3xl sm:text-4xl' : 'text-2xl'} leading-tight`}>
          <a href={`/article/${article.id}`} className="decoration-2 underline-offset-4 group-hover:underline">
            {article.headline}
          </a>
        </h2>
        <p className="mt-3 grow text-base leading-relaxed text-muted-foreground">{article.subheadline || article.lede}</p>
        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <time dateTime={article.publishedAt}>{formatPublishedAt(article.publishedAt)}</time>
          <span>{article.readingTime} min read</span>
          <span>{article.evidenceCount} evidence links</span>
        </div>
      </div>
    </article>
  )
}
