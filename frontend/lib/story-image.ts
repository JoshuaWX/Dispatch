import type { ArticleCategory } from '@/lib/dispatch-types'

function normalizeAbsoluteImageUrl(candidate: string) {
  const trimmed = candidate.trim()
  if (!trimmed) {
    return null
  }

  try {
    const resolved = new URL(trimmed)
    if (!/^https?:$/.test(resolved.protocol)) {
      return null
    }

    if (resolved.protocol === 'http:') {
      resolved.protocol = 'https:'
    }

    return resolved.toString()
  } catch {
    return null
  }
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

    const imageUrl = normalizeAbsoluteImageUrl(payload.thumbnail?.source ?? '')
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

function resolveImageUrl(candidate: string, pageUrl: string) {
  const trimmed = candidate.trim()
  if (!trimmed) {
    return null
  }

  try {
    const resolved = new URL(trimmed, pageUrl)
    if (!/^https?:$/.test(resolved.protocol)) {
      return null
    }

    if (resolved.protocol === 'http:') {
      resolved.protocol = 'https:'
    }

    return resolved.toString()
  } catch {
    return null
  }
}

function extractMetaImageFromHtml(html: string, pageUrl: string) {
  const patterns = [
    /<meta[^>]+property=["']og:image(?:secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?:secure_url)?["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    const candidate = match?.[1]
    if (!candidate) {
      continue
    }

    const resolved = resolveImageUrl(candidate, pageUrl)
    if (resolved) {
      return resolved
    }
  }

  return null
}

async function fetchSourceImage(sourceUrl: string) {
  const url = sourceUrl.trim()
  if (!url) {
    return null
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2500)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Use a common browser UA to reduce bot blocking on metadata endpoints.
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
      },
    })

    if (!response.ok) {
      return null
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('text/html')) {
      return null
    }

    const html = await response.text()
    const imageUrl = extractMetaImageFromHtml(html, response.url || url)
    if (!imageUrl) {
      return null
    }

    return {
      imageUrl,
      imageCredit: 'Research source image',
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchImageFromResearchSources(sourceUrls: string[]) {
  const uniqueUrls = Array.from(
    new Set(sourceUrls.map((value) => value.trim()).filter(Boolean))
  ).slice(0, 4)

  for (const url of uniqueUrls) {
    const image = await fetchSourceImage(url)
    if (image) {
      return image
    }
  }

  return null
}

export async function resolveStoryImage(
  topic: string,
  _category: ArticleCategory,
  hintedImageUrl?: string | null,
  sourceUrls: string[] = []
) {
  const hint = hintedImageUrl ? normalizeAbsoluteImageUrl(hintedImageUrl) : null
  if (hint) {
    return {
      imageUrl: hint,
      imageCredit: 'Source image',
    }
  }

  const researchSourceImage = await fetchImageFromResearchSources(sourceUrls)
  if (researchSourceImage) {
    return researchSourceImage
  }

  const wikiImage = await fetchWikipediaImage(topic)
  if (wikiImage) {
    return wikiImage
  }

  return null
}
