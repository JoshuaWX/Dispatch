import { apiError, jsonResponse, requestId, unavailable } from '@/lib/http'
import { authorizeBearer } from '@/lib/security/auth'
import { getServiceSupabase } from '@/lib/supabase-server'

export const runtime = 'nodejs'

// One-time staging operation. Remove this route and its branch-scoped secret
// immediately after the Vercel Preview bypass is copied into Supabase Vault.
export async function POST(request: Request) {
  const id = requestId(request)
  if (process.env.VERCEL_ENV !== 'preview' ||
      process.env.VERCEL_GIT_COMMIT_REF !== 'codex/dispatch-production-rollout') {
    return apiError(id, 404, 'not_found', 'Not found.')
  }
  const secret = process.env.DISPATCH_STAGING_BYPASS_TRANSFER
  if (!authorizeBearer(request, secret)) {
    return apiError(id, 401, 'unauthorized', 'Authentication is required.')
  }
  try {
    const { data, error } = await getServiceSupabase().rpc('dispatch_rotate_staging_preview_bypass', {
      p_secret: secret,
    })
    if (error || data !== true) throw new Error('Vault transfer failed')
    return jsonResponse({ synced: true }, {}, id)
  } catch {
    return unavailable(id)
  }
}
