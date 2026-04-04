import type { ArticleCategory } from '@/lib/dispatch-types'

const categoryFallback: Record<ArticleCategory, { url: string; credit: string }> = {
  World: {
    url: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=1600&h=900&fit=crop',
    credit: 'Unsplash',
  },
  Tech: {
    url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600&h=900&fit=crop',
    credit: 'Unsplash',
  },
  Business: {
    url: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7fbda3?w=1600&h=900&fit=crop',
    credit: 'Unsplash',
  },
  Science: {
    url: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=1600&h=900&fit=crop',
    credit: 'Unsplash',
  },
}

async function fetchWikipediaImage(topic: string) {
  const query = topic.trim().replace(/\s+/g, '_')
  if (!query) {
    return null
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2500)

  try {
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
      {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
        },
      }
    )

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as {
      thumbnail?: { source?: string }
      title?: string
    }

    const imageUrl = payload.thumbnail?.source?.trim()
    if (!imageUrl) {
      return null
    }

    return {
      imageUrl,
      imageCredit: payload.title ? `Wikipedia - ${payload.title}` : 'Wikipedia',
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function resolveStoryImage(
  topic: string,
  category: ArticleCategory,
  hintedImageUrl?: string | null
) {
  const hint = hintedImageUrl?.trim()
  if (hint) {
    return {
      imageUrl: hint,
      imageCredit: 'NewsData source image',
    }
  }

  const wikiImage = await fetchWikipediaImage(topic)
  if (wikiImage) {
    return wikiImage
  }

  return null
}
