import { NextResponse } from 'next/server'
import { getTrendDigest } from '@/lib/pipeline'

export async function GET() {
  const topics = await getTrendDigest()
  return NextResponse.json({
    trends: topics,
    topics,
  })
}
