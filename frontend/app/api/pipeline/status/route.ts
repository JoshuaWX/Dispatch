import { jsonResponse, requestId, unavailable } from '@/lib/http'
import { getPublicPipelineStatus } from '@/lib/pipeline-status'

export async function GET(request: Request) {
  const id = requestId(request)
  try {
    return jsonResponse(await getPublicPipelineStatus(), {}, id)
  } catch {
    return unavailable(id)
  }
}
