import { NextResponse } from 'next/server'
import { runPipeline } from '@/lib/pipeline'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { topic?: string }

  try {
    const result = await runPipeline({ topic: body.topic })
    return NextResponse.json(result, {
      status: result.published ? 201 : 200,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Pipeline failed',
      },
      { status: 500 }
    )
  }
}
