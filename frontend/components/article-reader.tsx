'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { TrustStrip } from '@/components/trust-strip'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'

export interface ArticleReaderProps {
  articleId: string
}

type ReaderArticle = {
  id: string
  title: string
  subtitle: string
  lede: string
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
    credibilityNotes?: string
  }>
  qualityScore?: {
    sourceDiversity: number
    sensationalism: number
    factualConfidence: number
    ledeStrength: number
    overallScore: number
  }
  tags: string[]
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
  tags: string[]
  sources: Array<{
    id: string
    name: string
    reliability: 'high' | 'medium' | 'low'
    excerpt: string
    url: string
    publishedAt: string
    credibilityNotes?: string
  }>
  readingTime: number
  publishedAt: string
  verificationStatus: 'verified' | 'pending' | 'unverified'
  viewCount?: number
  qualityScore?: {
    sourceDiversity: number
    sensationalism: number
    factualConfidence: number
    ledeStrength: number
    overallScore: number
  }
}

type RelatedArticle = {
  id: string
  title: string
  category: string
  publishedAt: string
}

type WeatherSnapshot = {
  temperature: number
  windSpeed: number
  label: string
  city: string
}

type BodyBlock =
  | {
      type: 'heading'
      level: 2 | 3 | 4
      text: string
    }
  | {
      type: 'blockquote'
      text: string
    }
  | {
      type: 'paragraph'
      text: string
    }

function parseBodyBlocks(text: string): BodyBlock[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return []
  }

  const rawBlocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  const blocks: BodyBlock[] = []

  for (const rawBlock of rawBlocks) {
    const headingMatch = rawBlock.match(/^(#{2,6})\s+(.+)$/)
    if (headingMatch) {
      const level = Math.min(4, Math.max(2, headingMatch[1].length)) as 2 | 3 | 4
      const headingText = headingMatch[2].trim()
      if (headingText) {
        blocks.push({ type: 'heading', level, text: headingText })
      }
      continue
    }

    if (/^>\s*/.test(rawBlock)) {
      const quoteText = rawBlock
        .split('\n')
        .map((line) => line.replace(/^>\s?/, '').trim())
        .filter(Boolean)
        .join(' ')

      if (quoteText) {
        blocks.push({ type: 'blockquote', text: quoteText })
      }
      continue
    }

    const paragraphText = rawBlock.replace(/\n+/g, ' ').trim()
    if (paragraphText) {
      blocks.push({ type: 'paragraph', text: paragraphText })
    }
  }

  return blocks
}

function mapWeatherCode(code: number) {
  if (code === 0) return 'Clear sky'
  if (code <= 3) return 'Partly cloudy'
  if (code <= 48) return 'Foggy'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Rain showers'
  if (code <= 99) return 'Thunderstorm'
  return 'Conditions unavailable'
}

function toTitleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) {
    return 'recently'
  }

  const diffMs = Date.now() - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < minute) {
    return 'just now'
  }

  if (diffMs < hour) {
    const minutes = Math.max(1, Math.floor(diffMs / minute))
    return `${minutes}m ago`
  }

  if (diffMs < day) {
    const hours = Math.max(1, Math.floor(diffMs / hour))
    return `${hours}h ago`
  }

  const days = Math.max(1, Math.floor(diffMs / day))
  return `${days}d ago`
}

function CategoryPill({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-sm bg-primary text-primary-foreground text-[11px] tracking-[0.14em] uppercase font-semibold">
      {category}
    </span>
  )
}

function WeatherInlineWidget() {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)

  useEffect(() => {
    let mounted = true

    const loadWeather = async () => {
      try {
        const coords = await new Promise<{ latitude: number; longitude: number }>((resolve) => {
          if (!navigator.geolocation) {
            resolve({ latitude: 51.5072, longitude: -0.1276 })
            return
          }

          navigator.geolocation.getCurrentPosition(
            (position) =>
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              }),
            () => resolve({ latitude: 51.5072, longitude: -0.1276 }),
            { enableHighAccuracy: false, timeout: 7000 }
          )
        })

        const weatherResponse = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`
        )
        if (!weatherResponse.ok) {
          return
        }

        const weatherJson = (await weatherResponse.json()) as {
          current?: {
            temperature_2m?: number
            weather_code?: number
            wind_speed_10m?: number
          }
        }

        const cityResponse = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}`,
          {
            headers: {
              accept: 'application/json',
            },
          }
        )

        let city = 'Local'
        if (cityResponse.ok) {
          const cityJson = (await cityResponse.json()) as {
            address?: { city?: string; town?: string; state?: string }
          }
          city = cityJson.address?.city ?? cityJson.address?.town ?? cityJson.address?.state ?? 'Local'
        }

        if (!mounted || !weatherJson.current) {
          return
        }

        setWeather({
          temperature: Math.round(weatherJson.current.temperature_2m ?? 0),
          windSpeed: Math.round(weatherJson.current.wind_speed_10m ?? 0),
          label: mapWeatherCode(weatherJson.current.weather_code ?? -1),
          city,
        })
      } catch {
        if (mounted) {
          setWeather(null)
        }
      }
    }

    void loadWeather()
    return () => {
      mounted = false
    }
  }, [])

  if (!weather) {
    return null
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border border-border text-[11px] text-muted-foreground">
      {weather.city}
      <span>·</span>
      <span>{weather.temperature}C</span>
      <span>·</span>
      <span>{weather.label}</span>
    </span>
  )
}

function TagPills({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {tags.map((tag) => (
        <Link
          key={tag}
          href={`/tag/${encodeURIComponent(tag.toLowerCase())}`}
          className="inline-flex px-2.5 py-0.75 rounded-[2px] border border-primary text-primary text-[0.75rem] tracking-[1px] uppercase font-mono no-underline hover:no-underline transition-colors duration-150 hover:bg-primary hover:text-primary-foreground dark:border-foreground dark:text-foreground dark:hover:bg-foreground dark:hover:text-background"
        >
          {tag}
        </Link>
      ))}
    </div>
  )
}

function SectionedArticleBody({ lede, body }: { lede: string; body: string }) {
  const blocks = parseBodyBlocks(body)

  return (
    <div className="mx-auto max-w-170">
      <p className="text-lg sm:text-xl leading-[1.8] mb-6 text-foreground/85 font-medium">{lede}</p>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          if (block.level === 2) {
            return (
              <h2
                key={`body-${index}`}
                className="text-xl sm:text-2xl font-serif font-bold text-foreground mt-10 mb-5"
              >
                {block.text}
              </h2>
            )
          }

          if (block.level === 3) {
            return (
              <h3
                key={`body-${index}`}
                className="text-lg sm:text-xl font-serif font-semibold text-foreground mt-8 mb-4"
              >
                {block.text}
              </h3>
            )
          }

          return (
            <h4
              key={`body-${index}`}
              className="text-base sm:text-lg font-serif font-semibold text-foreground mt-7 mb-3"
            >
              {block.text}
            </h4>
          )
        }

        if (block.type === 'blockquote') {
          return (
            <blockquote
              key={`body-${index}`}
              className="my-7 border-l-2 border-primary/50 pl-4 italic text-foreground/85"
            >
              {block.text}
            </blockquote>
          )
        }

        return (
          <p key={`body-${index}`} className="text-base sm:text-[1.125rem] leading-[1.8] mb-6 text-foreground">
            {block.text}
          </p>
        )
      })}
    </div>
  )
}

function SocialIconX() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 fill-current">
      <path d="M18.9 2H22l-6.77 7.74L23 22h-6.2l-4.86-6.35L6.39 22H3.27l7.25-8.3L1 2h6.36l4.39 5.79L18.9 2zm-1.09 18h1.72L6.42 3.9H4.58L17.81 20z" />
    </svg>
  )
}

function SocialIconWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 fill-current">
      <path d="M20.5 3.5A11 11 0 0 0 3.3 16.2L2 22l6-1.3A11 11 0 1 0 20.5 3.5zm-8.5 18a9 9 0 0 1-4.6-1.3l-.3-.2-3.6.8.8-3.5-.2-.3A9 9 0 1 1 12 21.5zm5-6.8c-.3-.2-1.6-.8-1.8-.9-.2-.1-.4-.2-.6.2-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.4-2.2-1.4-.8-.7-1.3-1.6-1.5-1.9-.2-.3 0-.4.1-.6l.4-.4c.1-.1.2-.2.3-.4.1-.1.1-.3 0-.5 0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.4-.2.3-1 1-.9 2.4 0 1.4 1 2.8 1.1 3 .2.2 2 3.2 5 4.4.7.3 1.2.4 1.7.5.7.2 1.3.1 1.8.1.6-.1 1.6-.6 1.8-1.3.2-.6.2-1.2.2-1.3 0-.1-.1-.2-.3-.3z" />
    </svg>
  )
}

function SocialIconLinkedIn() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 fill-current">
      <path d="M20.4 20.4h-3.6v-5.7c0-1.4 0-3.1-1.9-3.1s-2.2 1.5-2.2 3v5.8H9.1V9h3.4v1.6h.1c.5-.9 1.6-1.9 3.3-1.9 3.6 0 4.3 2.4 4.3 5.4v6.3zM5 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zM6.8 20.4H3.2V9h3.6v11.4z" />
    </svg>
  )
}

function SocialIconLink() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 fill-current">
      <path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a3 3 0 1 1 4.2 4.2l-2 2a3 3 0 0 1-4.2 0 1 1 0 1 1 1.4-1.4 1 1 0 0 0 1.4 0l2-2a1 1 0 0 0-1.4-1.4L12 13.4a1 1 0 0 1-1.4 0zM13.4 10.6a1 1 0 0 1 0 1.4L10 15.4a3 3 0 1 1-4.2-4.2l2-2a3 3 0 0 1 4.2 0 1 1 0 0 1-1.4 1.4 1 1 0 0 0-1.4 0l-2 2a1 1 0 1 0 1.4 1.4l3.4-3.4a1 1 0 0 1 1.4 0z" />
    </svg>
  )
}

function SocialIconCheck() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 fill-current">
      <path d="M9.2 16.6 4.9 12.3l1.4-1.4 2.9 2.9 8.5-8.5 1.4 1.4z" />
    </svg>
  )
}

type SharePlatform = 'twitter' | 'whatsapp' | 'linkedin'

function ShareRow({
  headline,
  pageUrl,
}: {
  headline: string
  pageUrl: string
}) {
  const [copied, setCopied] = useState(false)

  const normalizedPageUrl = (() => {
    try {
      const parsed = new URL(pageUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return ''
      }
      return parsed.toString()
    } catch {
      return ''
    }
  })()

  const encodedHeadline = encodeURIComponent(headline)
  const encodedUrl = encodeURIComponent(normalizedPageUrl)

  const openShare = (platform: SharePlatform) => {
    if (!normalizedPageUrl) {
      return
    }

    const url =
      platform === 'twitter'
        ? `https://twitter.com/intent/tweet?text=${encodedHeadline}&url=${encodedUrl}`
        : platform === 'whatsapp'
          ? `https://api.whatsapp.com/send?text=${encodedHeadline}%20${encodedUrl}`
          : `https://linkedin.com/sharing/share-offsite/?url=${encodedUrl}`

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const copyLink = async () => {
    if (!normalizedPageUrl) {
      return
    }

    await navigator.clipboard.writeText(normalizedPageUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const buttonBase =
    'relative inline-flex items-center justify-center w-9 h-9 rounded-[2px] border border-border bg-transparent text-foreground transition-colors duration-150'

  return (
    <div className="mt-10 pt-4 border-t border-border flex flex-wrap items-center gap-3">
      <span className="text-xs uppercase tracking-[2px] text-muted-foreground">Share this story</span>

      <button
        type="button"
        onClick={() => openShare('twitter')}
        className={`${buttonBase} hover:bg-black hover:text-white`}
        aria-label="Share on X"
      >
        <SocialIconX />
      </button>

      <button
        type="button"
        onClick={() => openShare('whatsapp')}
        className={`${buttonBase} hover:bg-[#25D366] hover:text-white`}
        aria-label="Share on WhatsApp"
      >
        <SocialIconWhatsApp />
      </button>

      <button
        type="button"
        onClick={() => openShare('linkedin')}
        className={`${buttonBase} hover:bg-[#0A66C2] hover:text-white`}
        aria-label="Share on LinkedIn"
      >
        <SocialIconLinkedIn />
      </button>

      <button
        type="button"
        onClick={() => void copyLink()}
        className={`${buttonBase} hover:bg-primary hover:text-primary-foreground`}
        aria-label="Copy story link"
      >
        {copied ? <SocialIconCheck /> : <SocialIconLink />}
        {copied && (
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] px-1.5 py-0.5 rounded bg-foreground text-background">
            Copied!
          </span>
        )}
      </button>
    </div>
  )
}

function RelatedStories({ stories }: { stories: RelatedArticle[] }) {
  if (stories.length === 0) {
    return null
  }

  return (
    <section className="mt-10 pt-4 border-t-2 border-primary">
      <h2 className="text-base font-serif font-semibold tracking-[2px] uppercase mb-5">More Stories</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {stories.map((story) => (
          <Link
            key={story.id}
            href={`/article/${story.id}`}
            className="block pb-4 border-b border-border lg:border-b-0 no-underline hover:no-underline"
          >
            <p className="text-[10px] uppercase tracking-[1px] text-primary font-semibold mb-2">{story.category}</p>
            <p className="font-serif text-[0.95rem] sm:text-base font-bold text-foreground line-clamp-2 hover:underline">
              {story.title}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {new Date(story.publishedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}

function SourcesList({
  sources,
}: {
  sources: ReaderArticle['sources']
}) {
  if (!sources || sources.length === 0) {
    return null
  }

  return (
    <section className="mt-10 pt-4 border-t-2 border-primary">
      <h2 className="text-xs sm:text-sm uppercase tracking-[2px] font-semibold text-foreground mb-4">Sources</h2>
      <ol className="space-y-3">
        {sources.map((source, index) => {
          const credibilityNotes = source.credibilityNotes
          return (
            <li
              key={source.id}
              className="pl-3 border-l border-transparent hover:border-primary/40 transition-colors"
            >
              <p className="text-sm text-foreground">
                {index + 1}.{' '}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-foreground dark:text-muted-foreground hover:underline"
                >
                  {source.name}
                </a>
              </p>
              <p className="text-[0.8rem] text-muted-foreground truncate">{source.url}</p>
              {credibilityNotes && (
                <p className="text-[0.8rem] text-muted-foreground italic">{credibilityNotes}</p>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function CorrectionsLine() {
  return (
    <p className="mt-8 pt-4 border-t border-border text-[0.8rem] text-muted-foreground italic">
      Spotted an error? Contact our editorial team at{' '}
      <a href="mailto:dispatch@newsroom.ai" className="not-italic text-primary hover:underline">
        dispatch@newsroom.ai
      </a>
    </p>
  )
}

export function ArticleReader({ articleId }: ArticleReaderProps) {
  const [article, setArticle] = useState<ReaderArticle | null>(null)
  const [relatedArticles, setRelatedArticles] = useState<RelatedArticle[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')

  const MIN_IMAGE_CONFIDENCE = 7
  const evidenceSources = article?.sources.slice(0, 3) ?? []
  const overallScore = article?.qualityScore?.overallScore ?? null
  const showTrustedImage = Boolean(article?.imageUrl) &&
    (
      article?.verificationStatus !== 'verified' ||
      overallScore === null ||
      overallScore >= MIN_IMAGE_CONFIDENCE
    )

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
          lede: json.lede || json.subheadline,
          author: 'Dispatch AI Desk',
          category: json.category,
          publishedAt: json.publishedAt,
          imageUrl: json.imageUrl,
          imageCredit: json.imageCredit,
          readTime: json.readingTime,
          verificationStatus: json.verificationStatus,
          sourceCount: json.sources.length,
          lastUpdated: formatRelativeTime(json.publishedAt),
          aiGenerated: true,
          content: json.body,
          sources: json.sources,
          qualityScore: json.qualityScore,
          tags: json.tags,
        })

        if (typeof window !== 'undefined') {
          try {
            const viewSessionKey = `dispatch:viewed:${json.id}`
            const alreadyViewed = window.sessionStorage.getItem(viewSessionKey) === '1'

            if (!alreadyViewed) {
              window.sessionStorage.setItem(viewSessionKey, '1')

              const viewResponse = await fetch(`/api/articles/${articleId}`, {
                method: 'POST',
              })

              if (!viewResponse.ok) {
                window.sessionStorage.removeItem(viewSessionKey)
              }
            }
          } catch {
            // Swallow view-tracking errors so article rendering is not impacted.
          }
        }

        const relatedResponse = await fetch('/api/articles', { cache: 'no-store' })
        if (relatedResponse.ok) {
          const relatedJson = (await relatedResponse.json()) as { articles?: ApiArticle[] }
          const all = Array.isArray(relatedJson.articles) ? relatedJson.articles : []
          const currentTags = new Set((json.tags ?? []).map((tag) => tag.toLowerCase()))

          const withMatchingTag = all
            .filter((candidate) => candidate.id !== json.id)
            .filter((candidate) =>
              (candidate.tags ?? []).some((tag) => currentTags.has(tag.toLowerCase()))
            )
            .sort(
              (a, b) =>
                new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
            )

          const recentFallback = all
            .filter((candidate) => candidate.id !== json.id)
            .sort(
              (a, b) =>
                new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
            )

          const selected = [...withMatchingTag]
          for (const candidate of recentFallback) {
            if (selected.length >= 3) {
              break
            }

            if (!selected.some((articleItem) => articleItem.id === candidate.id)) {
              selected.push(candidate)
            }
          }

          const related = selected.slice(0, 3).map((candidate) => ({
            id: candidate.id,
            title: candidate.headline,
            category: candidate.category,
            publishedAt: candidate.publishedAt,
          }))

          if (mounted) {
            setRelatedArticles(related)
          }
        }

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

  const pageUrl = typeof window !== 'undefined' ? `${window.location.origin}/article/${article.id}` : ''

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

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mx-auto max-w-180">
          <div className="mb-4">
            <CategoryPill category={article.category} />
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold text-foreground mb-4 font-serif">{article.title}</h1>

          <p className="text-lg sm:text-xl text-muted-foreground font-medium mb-5">{article.subtitle}</p>

          <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs text-muted-foreground font-mono pb-3 border-b border-border">
            <span>By DISPATCH AI</span>
            <span>·</span>
            <span>
              {new Date(article.publishedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <span>·</span>
            <span>{article.readTime} min read</span>
            <span>·</span>
            <WeatherInlineWidget />
          </div>

          <div className="mt-4">
            <TrustStrip
              verificationStatus={article.verificationStatus}
              sourceCount={article.sourceCount}
              lastUpdated={article.lastUpdated}
              aiGenerated={article.aiGenerated}
            />
          </div>

          {showTrustedImage && article.imageUrl && (
            <div className="mt-8 rounded-sm overflow-hidden border border-border">
              <div className="relative">
                <Image
                  src={article.imageUrl}
                  alt={article.title}
                  width={1200}
                  height={675}
                  className="w-full h-auto object-cover"
                  priority
                />
              </div>
              {article.imageCredit && (
                <p className="text-[11px] text-muted-foreground italic px-3 py-2 border-t border-border">
                  Credit: {article.imageCredit}
                </p>
              )}
            </div>
          )}

          <div className="mt-8">
            <TagPills tags={article.tags} />
          </div>

          <SectionedArticleBody lede={article.lede} body={article.content} />

          <ShareRow headline={article.title} pageUrl={pageUrl} />

          <RelatedStories stories={relatedArticles} />

          <SourcesList sources={article.sources} />

          <CorrectionsLine />
        </div>
      </div>
    </article>
  )
}
