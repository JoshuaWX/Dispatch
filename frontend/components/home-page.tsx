'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArticleCard } from '@/components/article-card'
import { NewsTicker } from '@/components/news-ticker'
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

type VirloSnapshot = {
  dayKey: string
  source: 'api' | 'cache' | 'none'
  topTopics: string[]
  success: boolean
}

export function HomePage() {
  const [articles, setArticles] = useState<ApiArticle[]>([])
  const [virloSnapshot, setVirloSnapshot] = useState<VirloSnapshot | null>(null)

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

    const loadVirloSnapshot = async () => {
      try {
        const response = await fetch('/api/trends', { cache: 'no-store' })
        if (!response.ok) return

        const json = (await response.json()) as {
          virloSnapshot?: {
            dayKey?: string
            source?: 'api' | 'cache' | 'none'
            topTopics?: string[]
            success?: boolean
          }
        }

        const snapshot = json.virloSnapshot
        if (!mounted || !snapshot || typeof snapshot.dayKey !== 'string') {
          return
        }

        setVirloSnapshot({
          dayKey: snapshot.dayKey,
          source: snapshot.source ?? 'none',
          topTopics: Array.isArray(snapshot.topTopics)
            ? snapshot.topTopics.filter((topic): topic is string => typeof topic === 'string').slice(0, 3)
            : [],
          success: snapshot.success ?? false,
        })
      } catch {
        if (mounted) {
          setVirloSnapshot(null)
        }
      }
    }

    void loadArticles()
    void loadVirloSnapshot()
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
        categoryColor: 'default' as const,
        imageUrl: article.imageUrl,
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
      <NewsTicker />

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <div className="mb-12">
          <p className="mb-4 inline-flex rounded-sm border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Real-time autonomous newsroom
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-balance mb-4">
            Breaking News, Built for the <span className="text-primary">Trust Era</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground text-balance max-w-2xl">
            DISPATCH turns signal into verified reporting in minutes, not cycles. Readers get
            source-linked facts, accountable context, and publication-grade clarity from an AI
            newsroom that never sleeps.
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
                <div className="bg-card rounded-lg border border-border p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Virlo Snapshot</h3>
                  {virloSnapshot ? (
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>
                        <span className="font-medium text-foreground">Day key:</span> {virloSnapshot.dayKey}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Source:</span>{' '}
                        {virloSnapshot.source === 'api'
                          ? 'Live API call'
                          : virloSnapshot.source === 'cache'
                            ? 'Daily cache'
                            : 'Unavailable'}
                      </p>
                      <div>
                        <p className="font-medium text-foreground mb-1">Top 3 topics</p>
                        {virloSnapshot.topTopics.length > 0 ? (
                          <ul className="space-y-1">
                            {virloSnapshot.topTopics.map((topic) => (
                              <li key={topic} className="line-clamp-1">• {topic}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>Virlo topics are not available yet.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Virlo snapshot is loading.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border p-8 text-center">
              <h3 className="text-xl font-semibold text-foreground mb-2">No generated stories yet</h3>
              <p className="text-muted-foreground">
                Autonomous generation is warming up. Your first AI story should appear shortly.
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

      <section className="bg-linear-to-br from-primary/10 via-foreground/3 to-transparent border-t border-border py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <section className="mb-10 rounded-sm border border-border bg-card/70 p-4 text-left sm:p-6">
            <h2 className="mb-4 text-base font-semibold uppercase tracking-[0.16em] text-foreground/85 sm:text-lg">
              How Dispatch Works
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
              <div className="rounded-sm border border-border bg-background/65 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">01 Research</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Cross-source fact gathering with structured evidence extraction.
                </p>
              </div>
              <div className="rounded-sm border border-border bg-background/65 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">02 Write</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Reported article drafting with attribution and newsroom tone.
                </p>
              </div>
              <div className="rounded-sm border border-border bg-background/65 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">03 Quality Gate</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Only stories that pass confidence and sourcing checks are published.
                </p>
              </div>
            </div>
          </section>

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
