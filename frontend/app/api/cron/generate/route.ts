import { NextResponse } from 'next/server'
import { runPipeline } from '@/lib/pipeline'

export const runtime = 'nodejs'

function isCronRequest(request: Request) {
  if (process.env.NODE_ENV !== 'production') {
    return true
  }

  return request.headers.get('x-vercel-cron') === '1'
}

export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runPipeline({})
    return NextResponse.json({
      ok: true,
      published: result.published,
      topic: result.topic,
      articleId: result.article?.id ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Cron generation failed',
      },
      { status: 500 }
    )
  }
}