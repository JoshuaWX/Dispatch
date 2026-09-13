import type { ArticleCategory } from '@/lib/dispatch-types'

export function formatPublishedAt(value: string) {
  return new Intl.DateTimeFormat('en', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  }).format(new Date(value))
}

export function categoryArtwork(category: ArticleCategory) {
  return `/categories/${category.toLowerCase()}.svg`
}
