import { apiError, jsonResponse, requestId, unavailable } from '@/lib/http'
import { runPipeline } from '@/lib/pipeline'
import { authorizeBearer } from '@/lib/security/auth'

export const runtime = 'nodejs'
export const maxDuration = 90

function twoHourKey(now = new Date()) {
  const bucketHour = Math.floor(now.getUTCHours() / 2) * 2
  return `cron:${now.toISOString().slice(0, 10)}:${String(bucketHour).padStart(2, '0')}`
}

export async function POST(request: Request) {
  const id = requestId(request)
  if (!authorizeBearer(request, process.env.SCHEDULER_SECRET)) {
    return apiError(id, 401, 'unauthorized', 'Authentication is required.')
  }
  try {
    const result = await runPipeline({ trigger: 'scheduled', idempotencyKey: twoHourKey(), requestId: id })
    return jsonResponse(result, { status: result.status === 'failed' ? 503 : 200 }, id)
  } catch {
    return unavailable(id)
  }
}

export function GET(request: Request) {
  const id = requestId(request)
  return apiError(id, 405, 'method_not_allowed', 'Use POST for scheduled runs.')
}
