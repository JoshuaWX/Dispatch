import { createHash } from 'node:crypto'
import { z } from 'zod'
import { apiError, jsonResponse, requestId, unavailable } from '@/lib/http'
import { getServiceSupabase } from '@/lib/supabase-server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestIdentifier = requestId(request)
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError(requestIdentifier, 404, 'article_not_found', 'Article not found.')
  }
  const vercelAddress = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
  const localAddress = process.env.NODE_ENV !== 'production'
    ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    : undefined
  const clientAddress = vercelAddress || localAddress || 'shared-anonymous-client'
  const clientKey = createHash('sha256').update(clientAddress).digest('hex')
  try {
    const { data, error } = await getServiceSupabase().rpc('dispatch_increment_article_view', {
      p_article_id: id, p_client_key: clientKey,
    })
    if (error) {
      if (/rate limit/i.test(error.message)) return apiError(requestIdentifier, 429, 'rate_limited', 'Too many requests.')
      if (/not found/i.test(error.message)) return apiError(requestIdentifier, 404, 'article_not_found', 'Article not found.')
      throw new Error('view_update_failed')
    }
    return jsonResponse({ id, viewCount: Number(data) }, {}, requestIdentifier)
  } catch {
    return unavailable(requestIdentifier)
  }
}
