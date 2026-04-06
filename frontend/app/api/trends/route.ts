import { NextResponse } from 'next/server'
import { getTrendDigest } from '@/lib/pipeline'
import { getDailyVirloSnapshot } from '@/lib/virlo'

export async function GET() {
  const topics = await getTrendDigest()
  const virloSnapshot = await getDailyVirloSnapshot()
  const cleanedVirloTopics = virloSnapshot.topics
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 0)
    .filter((topic) => !/^trends\s+for\b/i.test(topic))

  const fallbackTopics = topics
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 0)

  const displayTopTopics = (cleanedVirloTopics.length > 0 ? cleanedVirloTopics : fallbackTopics).slice(0, 3)

  return NextResponse.json({
    trends: topics,
    topics,
    virloSnapshot: {
      dayKey: virloSnapshot.dayKey,
      source: virloSnapshot.calledApi ? 'api' : virloSnapshot.fromCache ? 'cache' : 'none',
      topTopics: displayTopTopics,
      success: virloSnapshot.success,
    },
  })
}
