import { NextResponse } from 'next/server'
import { researchTopic } from '@/lib/pipeline'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { topic?: string }
  const topic = body.topic?.trim()

  if (!topic) {
    return NextResponse.json({ error: 'topic is required' }, { status: 400 })
  }

  const research = await researchTopic(topic)
  return NextResponse.json(research)
}
