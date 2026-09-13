import type { MetadataRoute } from 'next'
import { listPublicArticles } from '@/lib/articles'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://dispatch-1news.vercel.app'
  const staticRoutes = ['', '/explore', '/methodology', '/corrections', '/pipeline', '/privacy', '/terms']
    .map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: 'daily' as const }))
  const page = await listPublicArticles({ limit: 50 }).catch(() => null)
  return [...staticRoutes, ...(page?.articles ?? []).map((article) => ({
    url: `${base}/article/${article.id}`, lastModified: new Date(article.publishedAt), changeFrequency: 'weekly' as const,
  }))]
}
