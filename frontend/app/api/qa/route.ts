import { NextResponse } from 'next/server'
import { answerReporterQuestion } from '@/lib/pipeline'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    articleId?: string
    question?: string
  }

  if (!body.articleId || !body.question?.trim()) {
    return NextResponse.json(
      { error: 'articleId and question are required' },
      { status: 400 }
    )
  }

  const answer = await answerReporterQuestion({
    articleId: body.articleId,
    question: body.question,
  })

  if (!answer) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  return NextResponse.json(answer)
}
