import { ArticleReader } from '@/components/article-reader'

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ArticleReader articleId={id} />
}
