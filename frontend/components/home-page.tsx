'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArticleCard } from '@/components/article-card'
import { TrustStrip } from '@/components/trust-strip'

type ApiArticle = {
  id: string
  topic: string
  headline: string
  subheadline: string
  lede: string
  body: string
  imageUrl?: string
  category: string
  tags: string[]
  sources: Array<{ name: string }>
  readingTime: number
  publishedAt: string
  qualityScore: { overallScore: number }
}

const MIN_IMAGE_CONFIDENCE = 7

export function HomePage() {
  const [articles, setArticles] = useState<ApiArticle[]>([])

  useEffect(() => {
    let mounted = true

    const loadArticles = async () => {
      try {
        const response = await fetch('/api/articles', { cache: 'no-store' })
        if (!response.ok) return
        const json = (await response.json()) as { articles?: ApiArticle[] }
        if (mounted && Array.isArray(json.articles)) {
          setArticles(json.articles)
        }
      } catch {
        setArticles([])
      }
    }

    void loadArticles()
    return () => {
      mounted = false
    }
  }, [])

  const mapped = useMemo(
    () =>
      articles.map((article, index) => ({
        id: article.id,
        title: article.headline,
        description: article.subheadline || article.lede,
        category: article.category,
        categoryColor: (index === 0 ? 'secondary' : 'default') as const,
        imageUrl:
          article.qualityScore.overallScore >= MIN_IMAGE_CONFIDENCE ? article.imageUrl : undefined,
        publishedAt: new Date(article.publishedAt).toLocaleString(),
        viewCount: Math.round(article.qualityScore.overallScore * 5000),
        sources: article.sources.map((source) => source.name),
        featured: index === 0,
      })),
    [articles]
  )

  const featuredArticle = mapped[0] ?? null
  const trendingArticles = mapped.slice(1, 4)

  const categorySummary = useMemo(() => {
    const counts = new Map<string, number>()

    mapped.forEach((article) => {
      counts.set(article.category, (counts.get(article.category) ?? 0) + 1)
    })

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
  }, [mapped])

  const liveSummary = useMemo(() => {
    const sourceCount = mapped[0]?.sources.length ?? 0
    const averageScore =
      mapped.length > 0
        ? Math.round(
            (mapped.reduce((sum, article) => sum + article.viewCount / 5000, 0) / mapped.length) *
              10
          ) / 10
        : 0
    const topCategory = categorySummary[0]?.name ?? 'n/a'

    return {
      sourceCount,
      averageScore,
      topCategory,
    }
  }, [categorySummary, mapped])

  return (
    <div className="min-h-screen bg-background">
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <div className="mb-12">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-balance mb-4">
            The Future of <span className="text-primary">Autonomous Journalism</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground text-balance max-w-2xl">
            Discover AI-curated news with complete source transparency. Every story, verified.
            Every source, visible. Every claim, trackable.
          </p>
        </div>

        <div className="mb-16">
          {featuredArticle ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <ArticleCard {...featuredArticle} />
              </div>
              <div className="flex flex-col gap-4">
                <div className="bg-card rounded-lg border border-border p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Verification Status</h3>
                  <TrustStrip
                    verificationStatus="verified"
                    sourceCount={liveSummary.sourceCount}
                    lastUpdated={mapped[0]?.publishedAt ?? 'just now'}
                    aiGenerated
                  />
                </div>
                <div className="bg-card rounded-lg border border-border p-6 grow">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Live Signals</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>{liveSummary.topCategory} is the most active category right now</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>{liveSummary.sourceCount} sources visible on the featured story</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>Average live story score: {liveSummary.averageScore || 'n/a'}/10</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border p-8 text-center">
              <h3 className="text-xl font-semibold text-foreground mb-2">No generated stories yet</h3>
              <p className="text-muted-foreground">
                Run the pipeline to publish the first AI-generated article.
              </p>
            </div>
          )}
        </div>

        <div>
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-foreground">Trending Now</h2>
            <p className="text-muted-foreground mt-2">Most viewed stories across all categories</p>
          </div>

          {trendingArticles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {trendingArticles.map((article) => (
                <ArticleCard key={article.id} {...article} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No additional generated stories yet.</p>
          )}
        </div>
      </section>

      <section className="bg-muted/30 border-t border-border py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-8">Browse by Category</h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {categorySummary.length > 0 ? (
              categorySummary.map((cat) => (
                <div
                  key={cat.name}
                  className="group cursor-pointer p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/5 transition-all text-center"
                >
                  <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                    {cat.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{cat.count} stories</p>
                </div>
              ))
            ) : (
              <p className="col-span-full text-sm text-muted-foreground">
                Categories will appear after generated stories are published.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="bg-linear-to-br from-primary/10 to-accent/10 border-t border-border py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Get News You Can Trust</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Sign up for personalized news briefings curated by AI with full source transparency.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors">
              Subscribe Now
            </button>
            <button className="px-8 py-3 border border-primary text-primary rounded-lg font-semibold hover:bg-primary/10 transition-colors">
              Learn More
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
