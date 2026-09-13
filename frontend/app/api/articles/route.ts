import { listPublicArticles } from '@/lib/articles'
import { apiError, jsonResponse, requestId, unavailable } from '@/lib/http'

export async function GET(request: Request) {
  const id = requestId(request)
  const url = new URL(request.url)
  const rawLimit = url.searchParams.get('limit')
  const limit = rawLimit ? Number(rawLimit) : 24
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return apiError(id, 400, 'invalid_limit', 'Limit must be an integer from 1 to 50.')
  }
  const sort = url.searchParams.get('sort') ?? 'recent'
  if (sort !== 'recent' && sort !== 'trending') {
    return apiError(id, 400, 'invalid_sort', 'Sort must be recent or trending.')
  }
  try {
    const page = await listPublicArticles({
      category: url.searchParams.get('category'), q: url.searchParams.get('q'),
      sort, cursor: url.searchParams.get('cursor'), limit,
    })
    return jsonResponse(page, {}, id)
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_cursor') {
      return apiError(id, 400, 'invalid_cursor', 'The pagination cursor is invalid.')
    }
    return unavailable(id)
  }
}
