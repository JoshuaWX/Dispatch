import { z } from 'zod'
import { apiError, jsonResponse, unavailable } from '@/lib/http'
import { requireOperator } from '@/lib/security/operator-route'
import { getServiceSupabase } from '@/lib/supabase-server'

const bodySchema = z.object({ reason: z.string().trim().min(10).max(500) }).strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = requireOperator(request)
  if (authorization.error) return authorization.error
  const requestIdentifier = authorization.id
  const articleId = (await params).id
  if (!z.string().uuid().safeParse(articleId).success) return apiError(requestIdentifier, 404, 'article_not_found', 'Article not found.')
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiError(requestIdentifier, 400, 'invalid_request', 'A reason of at least 10 characters is required.')
  try {
    const { data, error } = await getServiceSupabase().from('dispatch_articles').update({
      publication_status: 'retracted', verification_status: 'failed',
      rejection_reason: parsed.data.reason, updated_at: new Date().toISOString(),
    }).eq('id', articleId).eq('publication_status', 'published').select('id').maybeSingle()
    if (error) throw new Error('retraction_failed')
    if (!data) return apiError(requestIdentifier, 404, 'article_not_found', 'Article not found.')
    return jsonResponse({ id: articleId, publicationStatus: 'retracted' }, {}, requestIdentifier)
  } catch {
    return unavailable(requestIdentifier)
  }
}
