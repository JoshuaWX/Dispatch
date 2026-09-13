import { createHash, timingSafeEqual } from 'node:crypto'

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest()
}

export function authorizeBearer(request: Request, configuredSecret: string | undefined) {
  const secret = configuredSecret?.trim()
  const header = request.headers.get('authorization')?.trim()

  if (!secret || !header?.startsWith('Bearer ')) return false

  const candidate = header.slice('Bearer '.length).trim()
  return candidate.length > 0 && timingSafeEqual(digest(candidate), digest(secret))
}
