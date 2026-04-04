'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ArticleCard } from '@/components/article-card'

type ApiArticle = {
  id: string
  headline: string
  subheadline: string
  lede: string
  category: string
  imageUrl?: string
  readingTime: number
  publishedAt: string
  tags: string[]
  sources: Array<{ name: string }>
  qualityScore?: { overallScore: number }
}

const MIN_IMAGE_CONFIDENCE = 7

export default function TagPage() {
  const params = useParams()
  const rawTag = typeof params?.tag === 'string' ? params.tag : ''
  const tag = decodeURIComponent(rawTag).toLowerCase()

  const [articles, setArticles] = useState<ApiArticle[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let mounted = true

    const loadArticles = async () => {
      try {
        setLoadState('loading')
        const response = await fetch('/api/articles', { cache: 'no-store' })
        if (!response.ok) {
          setLoadState('error')
          return
        }

        const json = (await response.json()) as { articles?: ApiArticle[] }
        if (!mounted) return

        setArticles(Array.isArray(json.articles) ? json.articles : [])
        setLoadState('ready')
      } catch {
        if (mounted) {
          setLoadState('error')
        }
      }
    }

    void loadArticles()
    return () => {
      mounted = false
    }
  }, [])

  const tagStories = useMemo(() => {
    return articles
      .filter((article) => article.tags.some((articleTag) => articleTag.toLowerCase() === tag))
      .map((article) => ({
        id: article.id,
        title: article.headline,
        description: article.subheadline || article.lede,
        category: article.category,
        imageUrl:
          (article.qualityScore?.overallScore ?? 0) >= MIN_IMAGE_CONFIDENCE
            ? article.imageUrl
            : undefined,
        publishedAt: new Date(article.publishedAt).toLocaleString(),
        sources: article.sources.map((source) => source.name),
      }))
  }, [articles, tag])

  if (loadState === 'loading') {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <p className="text-muted-foreground">Loading stories...</p>
        </div>
      </main>
    )
  }

  if (loadState === 'error') {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <p className="text-muted-foreground">Could not load tag stories right now.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 no-underline hover:no-underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Front Page
        </Link>

        <h1 className="text-4xl font-bold text-foreground mb-2">Tag: #{tag}</h1>
        <p className="text-muted-foreground mb-8">{tagStories.length} stories found</p>

        {tagStories.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tagStories.map((story) => (
              <ArticleCard key={story.id} {...story} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card p-8">
            <p className="text-muted-foreground">No stories found for this tag yet.</p>
          </div>
        )}
      </div>
    </main>
  )
}
