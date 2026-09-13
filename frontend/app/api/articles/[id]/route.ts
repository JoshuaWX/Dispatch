import { getPublicArticle } from '@/lib/articles'
import { apiError, jsonResponse, requestId, unavailable } from '@/lib/http'

type Context = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Context) {
  const requestIdentifier = requestId(request)
  try {
    const article = await getPublicArticle((await params).id)
    return article
      ? jsonResponse(article, {}, requestIdentifier)
      : apiError(requestIdentifier, 404, 'article_not_found', 'Article not found.')
  } catch {
    return unavailable(requestIdentifier)
  }
}
