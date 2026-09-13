import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ArticleReader } from '@/components/article-reader'
import { getPublicArticle } from '@/lib/articles'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const article = await getPublicArticle(id).catch(() => null)
  if (!article) return { title: 'Article not found', robots: { index: false, follow: false } }
  return {
    title: article.headline,
    description: article.subheadline,
    alternates: { canonical: `/article/${article.id}` },
    openGraph: {
      type: 'article', title: article.headline, description: article.subheadline,
      publishedTime: article.publishedAt, tags: article.tags, url: `/article/${article.id}`,
    },
  }
}

export default async function ArticlePage({ params }: Props) {
  const { id } = await params
  const article = await getPublicArticle(id).catch(() => null)
  if (!article) notFound()
  const nonce = (await headers()).get('x-nonce') ?? undefined
  const viewPath = `/api/articles/${encodeURIComponent(article.id)}/views`
  const viewScript = `fetch(${JSON.stringify(viewPath)},{method:'POST',keepalive:true}).catch(()=>{});`
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'NewsArticle',
    headline: article.headline, description: article.subheadline,
    datePublished: article.publishedAt, dateModified: article.publishedAt,
    author: { '@type': 'Organization', name: 'DISPATCH AI Newsroom' },
    publisher: { '@type': 'Organization', name: 'DISPATCH', logo: { '@type': 'ImageObject', url: '/dispatch-sign.svg' } },
    mainEntityOfPage: `/article/${article.id}`,
  }
  return (
    <>
      <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: viewScript.replace(/</g, '\\u003c') }} />
      <ArticleReader article={article} />
    </>
  )
}
