'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrustStrip } from '@/components/trust-strip'
import { SourcePanel } from '@/components/source-panel'
import { ArrowLeft, Share2, Bookmark, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

export interface ArticleReaderProps {
  articleId: string
}

type ReaderArticle = {
  id: string
  title: string
  subtitle: string
  author: string
  category: string
  publishedAt: string
  imageUrl?: string
  imageCredit?: string
  readTime: number
  verificationStatus: 'verified' | 'pending' | 'unverified'
  sourceCount: number
  lastUpdated: string
  aiGenerated: true
  content: string
  sources: Array<{
    id: string
    name: string
    reliability: 'high' | 'medium' | 'low'
    excerpt: string
    url: string
    publishedAt: string
  }>
  qualityScore?: {
    sourceDiversity: number
    sensationalism: number
    factualConfidence: number
    ledeStrength: number
    overallScore: number
  }
}

type ApiArticle = {
  id: string
  topic: string
  headline: string
  subheadline: string
  lede: string
  body: string
  imageUrl?: string
  imageCredit?: string
  category: string
  sources: Array<{
    id: string
    name: string
    reliability: 'high' | 'medium' | 'low'
    excerpt: string
    url: string
    publishedAt: string
  }>
  readingTime: number
  publishedAt: string
  verificationStatus: 'verified' | 'pending' | 'unverified'
  qualityScore?: {
    sourceDiversity: number
    sensationalism: number
    factualConfidence: number
    ledeStrength: number
    overallScore: number
  }
}

function toHtmlParagraphs(text: string) {
  return text
    .split(/\n\n+/)
    .map((paragraph) => `<p>${paragraph.trim()}</p>`)
    .join('')
}

export function ArticleReader({ articleId }: ArticleReaderProps) {
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [article, setArticle] = useState<ReaderArticle | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')

  const MIN_IMAGE_CONFIDENCE = 7
  const evidenceSources = article?.sources.slice(0, 3) ?? []
  const overallScore = article?.qualityScore?.overallScore ?? null
  const showTrustedImage =
    Boolean(article?.imageUrl) &&
    article?.verificationStatus === 'verified' &&
    (overallScore === null || overallScore >= MIN_IMAGE_CONFIDENCE)

  useEffect(() => {
    let mounted = true

    const loadArticle = async () => {
      try {
        setLoadState('loading')
        const response = await fetch(`/api/articles/${articleId}`, {
          cache: 'no-store',
        })

        if (!response.ok) {
          setLoadState('error')
          return
        }

        const json = (await response.json()) as ApiArticle
        if (!mounted) return

        setArticle({
          id: json.id,
          title: json.headline,
          subtitle: json.subheadline || json.lede,
          author: 'Dispatch AI Desk',
          category: json.category,
          publishedAt: json.publishedAt,
          imageUrl: json.imageUrl,
          imageCredit: json.imageCredit,
          readTime: json.readingTime,
          verificationStatus: json.verificationStatus,
          sourceCount: json.sources.length,
          lastUpdated: 'just now',
          aiGenerated: true,
          content: toHtmlParagraphs(json.body),
          sources: json.sources,
          qualityScore: json.qualityScore,
        })
        setLoadState('ready')
      } catch {
        if (mounted) {
          setLoadState('error')
        }
      }
    }

    void loadArticle()
    return () => {
      mounted = false
    }
  }, [articleId])

  if (loadState === 'loading') {
    return (
      <article className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <p className="text-muted-foreground">Loading generated article...</p>
        </div>
      </article>
    )
  }

  if (loadState === 'error' || !article) {
    return (
      <article className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-2xl font-bold text-foreground mb-2">Article unavailable</h1>
          <p className="text-muted-foreground">This story is not available in the generated feed.</p>
        </div>
      </article>
    )
  }

  return (
    <article className="min-h-screen bg-background">
      {/* Navigation */}
      <div className="sticky top-16 bg-background/80 backdrop-blur border-b border-border z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Stories
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Badge>{article.category}</Badge>
                <span className="text-sm text-muted-foreground">
                  {article.readTime} min read
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
                {article.title}
              </h1>

              <p className="text-xl text-muted-foreground mb-6">
                {article.subtitle}
              </p>

              <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-6 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
                    <span className="text-sm font-semibold text-accent">ER</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">
                      {article.author}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(article.publishedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="ghost" size="icon">
                    <Share2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsBookmarked(!isBookmarked)}
                    className={isBookmarked ? 'text-primary' : ''}
                  >
                    <Bookmark
                      className="w-4 h-4"
                      fill={isBookmarked ? 'currentColor' : 'none'}
                    />
                  </Button>
                  <Button variant="ghost" size="icon">
                    <MessageCircle className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Evidence Snapshot */}
            <div className="mb-8 rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Evidence Snapshot</h2>
                  <p className="text-xs text-muted-foreground">
                    Fast traceability from the article to the sources behind it.
                  </p>
                </div>
                {overallScore !== null && (
                  <Badge variant="outline" className="shrink-0">
                    Score {overallScore}/10
                  </Badge>
                )}
              </div>

              <div className="space-y-3">
                {evidenceSources.map((source) => (
                  <div key={source.id} className="rounded-md border border-border/70 p-3">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <p className="text-sm font-medium text-foreground">{source.name}</p>
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        {source.reliability}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {source.excerpt}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Featured Image */}
            {showTrustedImage && article.imageUrl && (
              <div className="mb-8 rounded-lg overflow-hidden">
                <div className="relative h-96 sm:h-full">
                  <Image
                    src={article.imageUrl}
                    alt={article.title}
                    width={800}
                    height={400}
                    className="w-full h-auto object-cover"
                    priority
                  />
                </div>
                {article.imageCredit && (
                  <p className="text-xs text-muted-foreground italic pt-2">
                    Credit: {article.imageCredit}
                  </p>
                )}
              </div>
            )}

            {/* Article Content */}
            <div className="prose prose-sm dark:prose-invert max-w-none mb-12">
              <div
                className="text-foreground leading-relaxed space-y-4"
                dangerouslySetInnerHTML={{
                  __html: article.content.replace(/<h3>/g, '<h3 className="text-xl font-bold mt-6 mb-3">').replace(/<p>/g, '<p className="text-base leading-relaxed">'),
                }}
              />
            </div>

            {/* Sources Section */}
            <div className="mt-12">
              <SourcePanel sources={article.sources} title="Verified Sources" />
            </div>

          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Trust Information */}
            <div className="sticky top-24">
              <TrustStrip
                verificationStatus={article.verificationStatus}
                sourceCount={article.sourceCount}
                lastUpdated={article.lastUpdated}
                aiGenerated={article.aiGenerated}
              />

              {/* Key Stats */}
              <div className="mt-6 bg-card rounded-lg border border-border p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Story Stats
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Sources</p>
                    <p className="text-lg font-bold text-primary">
                      {article.sourceCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Verification Status
                    </p>
                    <p className="text-sm font-semibold capitalize text-green-600 dark:text-green-400">
                      {article.verificationStatus}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      AI-Generated
                    </p>
                    <p className="text-sm font-semibold">Yes</p>
                  </div>
                </div>
              </div>

              {/* Newsletter CTA */}
              <div className="bg-linear-to-br from-primary/8 via-foreground/3 to-transparent rounded-lg border border-border p-6">
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  Subscribe to Updates
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Get similar stories delivered daily.
                </p>
                <input
                  type="email"
                  placeholder="Email address"
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground mb-3"
                />
                <Button className="w-full text-sm">Subscribe</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
