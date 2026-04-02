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

const ARTICLE_DATA = {
  id: '1',
  title: 'Breakthrough in Quantum Computing Achieved by Leading Research Institute',
  subtitle:
    'Scientists announce a major advancement in quantum error correction, bringing practical quantum computing closer to reality.',
  author: 'Dr. Elena Rodriguez',
  category: 'Technology',
  publishedAt: '2024-01-15T10:30:00Z',
  imageUrl:
    'https://images.unsplash.com/photo-1635070041078-e72b99c00b61?w=1600&h=800&fit=crop',
  imageCredit: 'MIT Research Institute',
  readTime: 8,
  verificationStatus: 'verified' as const,
  sourceCount: 12,
  lastUpdated: '30 minutes ago',
  aiGenerated: true,
  content: `
    <p>In a groundbreaking development that could accelerate the practical deployment of quantum computers, researchers at the MIT Quantum Engineering Laboratory have achieved a significant milestone in quantum error correction. The team's latest findings, published in today's edition of Nature, demonstrate a 1000-fold improvement in coherence times—a critical metric for quantum computing viability.</p>

    <h3>The Challenge of Quantum Stability</h3>
    <p>Quantum computers operate using qubits, which exist in superposition states and can perform vastly more calculations than classical bits. However, these quantum states are extraordinarily fragile. Environmental interference—from temperature fluctuations to electromagnetic radiation—causes "decoherence," where qubits lose their quantum properties and the computation fails.</p>

    <p>For nearly three decades, maintaining stable qubits for sufficient durations has been the primary obstacle preventing quantum computers from solving real-world problems. Traditional approaches could sustain quantum states for only microseconds, requiring thousands of error-correction protocols that consumed more qubits than they protected.</p>

    <h3>A New Approach</h3>
    <p>The breakthrough leverages a novel combination of topological qubits and advanced cryogenic isolation techniques. By reducing quantum state decay by a factor of 1000, the research team has created a pathway toward practical quantum advantage—the point where quantum computers outperform classical computers on meaningful problems.</p>

    <p>"This isn't just an incremental improvement," says Dr. James Chen, the project's principal investigator. "We've crossed a threshold where error correction becomes manageable rather than impossible. This changes the timeline for commercial quantum computing from decades to years."</p>

    <h3>Market and Scientific Impact</h3>
    <p>The implications are profound. Industries from pharmaceuticals to finance have invested billions in quantum computing research, anticipating applications in drug discovery, portfolio optimization, and cryptography. The announcement triggered immediate responses in both the scientific and business communities.</p>

    <p>Immediately following the publication, major tech companies announced expanded commitments to quantum computing divisions. IBM released a statement confirming accelerated timelines for its quantum roadmap, while Google and Microsoft issued similar commitments to increased R&D investment.</p>

    <h3>Next Steps</h3>
    <p>The research team is now focused on scaling the technology. Current prototypes feature 128 qubits, but achieving practical quantum advantage typically requires thousands of stable qubits working in concert. The team estimates a 50-qubit system could be operational within 18 months, with a commercially viable 1,000-qubit system possible within five years.</p>

    <p>Government agencies have taken notice as well. The Department of Energy announced $500 million in additional funding for quantum computing research, while the NSF committed to establishing three new Quantum Engineering Centers at leading research institutions.</p>

    <p>Industry analysts predict this breakthrough could accelerate the quantum computing market by 3-5 years, potentially creating a $50 billion industry by 2030—significantly faster than previous forecasts.</p>
  `,
  sources: [
    {
      id: '1',
      name: 'Nature',
      logo: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7fbda3?w=100&h=100&fit=crop',
      reliability: 'high' as const,
      excerpt:
        'Quantum error correction with topological codes demonstrates unprecedented coherence times in experimental quantum processors.',
      url: 'https://nature.com/articles/quantum-breakthrough-2024',
      publishedAt: '2024-01-15 10:00 AM',
    },
    {
      id: '2',
      name: 'MIT News',
      logo: 'https://images.unsplash.com/photo-1579154204601-01d6305d50af?w=100&h=100&fit=crop',
      reliability: 'high' as const,
      excerpt:
        'Researchers achieve major quantum computing milestone with breakthrough in error correction technology.',
      url: 'https://mit.edu/news/quantum-breakthrough',
      publishedAt: '2024-01-15 9:30 AM',
    },
    {
      id: '3',
      name: 'Science Daily',
      logo: 'https://images.unsplash.com/photo-1516110566962-a67fea4ebda4?w=100&h=100&fit=crop',
      reliability: 'high' as const,
      excerpt:
        'Quantum computing gets closer to practical applications with new error correction advancement.',
      url: 'https://sciencedaily.com/releases/quantum-computing-2024',
      publishedAt: '2024-01-15 11:15 AM',
    },
    {
      id: '4',
      name: 'IBM Blog',
      logo: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7fbda3?w=100&h=100&fit=crop',
      reliability: 'medium' as const,
      excerpt:
        'Analysis: What MIT\'s quantum breakthrough means for the industry and our roadmap.',
      url: 'https://ibm.com/quantum-analysis-2024',
      publishedAt: '2024-01-15 1:00 PM',
    },
  ],
}

type ApiArticle = {
  id: string
  topic: string
  headline: string
  subheadline: string
  lede: string
  body: string
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
  const [article, setArticle] = useState(ARTICLE_DATA)

  const evidenceSources = article.sources.slice(0, 3)
  const overallScore = article.qualityScore?.overallScore ?? null

  useEffect(() => {
    let mounted = true

    const loadArticle = async () => {
      try {
        const response = await fetch(`/api/articles/${articleId}`, {
          cache: 'no-store',
        })

        if (!response.ok) return

        const json = (await response.json()) as ApiArticle
        if (!mounted) return

        setArticle({
          ...ARTICLE_DATA,
          id: json.id,
          title: json.headline,
          subtitle: json.subheadline || json.lede,
          category: json.category,
          publishedAt: json.publishedAt,
          readTime: json.readingTime,
          verificationStatus: json.verificationStatus,
          sourceCount: json.sources.length,
          lastUpdated: 'just now',
          content: toHtmlParagraphs(json.body),
          sources: json.sources,
        })
      } catch {
        // Keep fallback story if API is unavailable.
      }
    }

    void loadArticle()
    return () => {
      mounted = false
    }
  }, [articleId])

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
            {article.imageUrl && (
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

            {/* Related Articles */}
            <div className="mt-12 pt-8 border-t border-border">
              <h3 className="text-2xl font-bold text-foreground mb-6">
                Related Articles
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="p-4 border border-border rounded-lg hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer group"
                  >
                    <p className="text-sm text-muted-foreground mb-1">Technology</p>
                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      Related quantum computing story {i}
                    </p>
                  </div>
                ))}
              </div>
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
                      Verified
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
              <div className="bg-linear-to-br from-primary/10 to-accent/10 rounded-lg border border-border p-6">
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
