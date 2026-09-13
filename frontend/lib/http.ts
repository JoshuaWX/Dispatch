import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'

export function requestId(request: Request) {
  const supplied = request.headers.get('x-request-id')?.trim()
  return supplied && /^[a-zA-Z0-9_-]{8,100}$/.test(supplied) ? supplied : randomUUID()
}

export function jsonResponse(body: unknown, init: ResponseInit = {}, id?: string) {
  const headers = new Headers(init.headers)
  if (id) headers.set('x-request-id', id)
  headers.set('cache-control', 'no-store')
  return NextResponse.json(body, { ...init, headers })
}

export function apiError(id: string, status: number, code: string, message: string) {
  return jsonResponse({ error: { code, message, requestId: id } }, { status }, id)
}

export function unavailable(id: string) {
  return apiError(id, 503, 'service_unavailable', 'The service is temporarily unavailable.')
}

export function retiredRoute(request: Request) {
  const id = requestId(request)
  return apiError(id, 404, 'not_found', 'Not found.')
}
