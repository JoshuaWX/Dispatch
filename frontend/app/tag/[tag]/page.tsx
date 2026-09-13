import type { Metadata } from 'next'
import { ArticleCard } from '@/components/article-card'
import { listPublicArticles } from '@/lib/articles'

type Props = { params: Promise<{ tag: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = decodeURIComponent((await params).tag).slice(0, 40)
  return { title: `Reporting tagged ${tag}`, alternates: { canonical: `/tag/${encodeURIComponent(tag)}` } }
}

export default async function TagPage({ params }: Props) {
  const tag = decodeURIComponent((await params).tag).trim().toLowerCase().slice(0, 40)
  const page = await listPublicArticles({ limit: 50 }).catch(() => null)
  const articles = (page?.articles ?? []).filter((article) => article.tags.some((item) => item.toLowerCase() === tag))
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <a href="/explore" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">← Explore all reporting</a>
      <h1 className="mt-5">Tag: {tag}</h1>
      <p className="mt-3 text-muted-foreground">{articles.length} verified {articles.length === 1 ? 'story' : 'stories'}</p>
      {articles.length > 0 ? <div className="mt-8 grid gap-7 md:grid-cols-2 lg:grid-cols-3">{articles.map((article) => <ArticleCard key={article.id} article={article} />)}</div>
        : <p className="mt-8 border border-dashed border-border p-8 text-muted-foreground">No verified stories use this tag.</p>}
    </section>
  )
}
