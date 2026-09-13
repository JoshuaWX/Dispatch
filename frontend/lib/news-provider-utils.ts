const NON_ARTICLE_SEGMENTS = new Set([
  'archive', 'archives', 'category', 'categories', 'feed', 'latest', 'search',
  'section', 'sections', 'tag', 'tags', 'topic', 'topics',
])

export function normalizeTopic(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 240)
}

export function normalizeForCompare(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isLikelyArticleUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false

    const segments = url.pathname.split('/').filter(Boolean).map((segment) => segment.toLowerCase())
    if (segments.length === 0 || segments.some((segment) => NON_ARTICLE_SEGMENTS.has(segment))) return false
    if ([...url.searchParams.keys()].some((key) => ['q', 'query', 'search'].includes(key.toLowerCase()))) return false

    const finalSegment = decodeURIComponent(segments.at(-1) ?? '').replace(/\.[a-z0-9]{1,6}$/i, '')
    const hasArticleShape = /\d{4}[/-]\d{1,2}/.test(url.pathname) || /\d{5,}/.test(finalSegment) ||
      finalSegment.length >= 16 || finalSegment.split(/[-_]/).filter(Boolean).length >= 3
    return hasArticleShape
  } catch {
    return false
  }
}
