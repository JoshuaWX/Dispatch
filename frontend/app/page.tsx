import { HomePage } from '@/components/home-page'
import { listPublicArticles } from '@/lib/articles'
import { ARTICLE_CATEGORIES, type ArticlePage } from '@/lib/dispatch-types'

const emptyPage: ArticlePage = { articles: [], count: 0, nextCursor: null, facets: ARTICLE_CATEGORIES.map((category) => ({ category, count: 0 })) }

export default async function Page() {
  const [recent, trending] = await Promise.all([
    listPublicArticles({ sort: 'recent', limit: 7 }).catch(() => emptyPage),
    listPublicArticles({ sort: 'trending', limit: 3 }).catch(() => emptyPage),
  ])
  return <HomePage recent={recent} trending={trending} />
}
