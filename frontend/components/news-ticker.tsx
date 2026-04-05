'use client'

import { useEffect, useMemo, useState } from 'react'

type TickerArticle = {
  id: string
  headline: string
  category: string
  publishedAt: string
}

const REFRESH_INTERVAL_MS = 20000

const FALLBACK_ITEMS = [
  { id: 'fallback-1', label: 'Dispatch live desk is warming up and preparing verified stories.' },
  { id: 'fallback-2', label: 'New headlines will appear here as the pipeline publishes.' },
  { id: 'fallback-3', label: 'Every item includes source-backed reporting and quality checks.' },
]

export function NewsTicker() {
  const [articles, setArticles] = useState<TickerArticle[]>([])

  useEffect(() => {
    let mounted = true

    const loadArticles = async () => {
      try {
        const response = await fetch('/api/articles', { cache: 'no-store' })
        if (!response.ok) {
          return
        }

        const json = (await response.json()) as { articles?: TickerArticle[] }
        if (mounted && Array.isArray(json.articles)) {
          setArticles(json.articles)
        }
      } catch {
        if (mounted) {
          setArticles([])
        }
      }
    }

    void loadArticles()
    const timer = window.setInterval(() => {
      void loadArticles()
    }, REFRESH_INTERVAL_MS)

    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  const items = useMemo(() => {
    const mapped = articles
      .slice(0, 10)
      .map((article) => ({
        id: article.id,
        label: `${article.category.toUpperCase()}: ${article.headline}`,
      }))

    return mapped.length > 0 ? mapped : FALLBACK_ITEMS
  }, [articles])

  const doubled = useMemo(() => [...items, ...items], [items])

  return (
    <section className="news-ticker sticky top-0 z-30 border-y border-primary/30 bg-linear-to-r from-primary to-primary/90 text-primary-foreground shadow-[0_6px_18px_-10px_rgba(0,0,0,0.45)]">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-3 py-2 sm:px-6">
        <span className="shrink-0 rounded-sm bg-primary-foreground/15 px-2 py-1 text-[10px] font-bold tracking-[0.2em] sm:text-xs">
          LIVE
        </span>

        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="news-ticker-track flex w-max min-w-full items-center whitespace-nowrap pr-6">
            {doubled.map((item, index) => (
              <span
                key={`${item.id}-${index}`}
                className="inline-flex items-center text-xs font-semibold tracking-wide sm:text-sm"
              >
                <span className="mr-3 inline-block h-1.5 w-1.5 rounded-full bg-primary-foreground/85" />
                {item.label}
                <span className="mx-4 text-primary-foreground/60">//</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
