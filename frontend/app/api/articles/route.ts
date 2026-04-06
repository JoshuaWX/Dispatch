import { NextResponse } from 'next/server'
import { getPublishedArticles } from '@/lib/pipeline'
import { getArticleViewCount } from '@/lib/store'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const category = url.searchParams.get('category')?.trim().toLowerCase()
  const query = url.searchParams.get('q')?.trim().toLowerCase()

  const articles = (await getPublishedArticles()).filter((article) => {
    const matchesCategory = !category || article.category.toLowerCase() === category
    const matchesQuery =
      !query ||
      [article.headline, article.subheadline, article.lede, article.body, article.topic]
        .join(' ')
        .toLowerCase()
        .includes(query)

    return matchesCategory && matchesQuery
  })

  return NextResponse.json({
    count: articles.length,
    articles: articles.map((article) => ({
      ...article,
      viewCount: getArticleViewCount(article.id),
    })),
  })
}
