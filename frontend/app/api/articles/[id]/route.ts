import { NextResponse } from 'next/server'
import { getPublishedArticle } from '@/lib/pipeline'
import { getArticleViewCount, incrementArticleViewCount } from '@/lib/store'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const article = await getPublishedArticle(id)

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  return NextResponse.json({
    ...article,
    viewCount: getArticleViewCount(id),
  })
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const article = await getPublishedArticle(id)

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  const viewCount = incrementArticleViewCount(id)
  return NextResponse.json({ id, viewCount })
}
