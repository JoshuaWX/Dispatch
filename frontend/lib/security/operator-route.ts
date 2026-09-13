import { apiError, requestId } from '@/lib/http'
import { authorizeBearer } from '@/lib/security/auth'

export function requireOperator(request: Request) {
  const id = requestId(request)
  if (authorizeBearer(request, process.env.OPS_ADMIN_TOKEN)) return { id, error: null }
  return {
    id,
    error: apiError(id, 401, 'unauthorized', 'Authentication is required.'),
  }
}
