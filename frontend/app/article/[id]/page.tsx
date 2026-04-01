import { ArticleReader } from '@/components/article-reader'

export default function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // In a real app, you would fetch article data based on params.id
  // For now, we'll use mock data from the ArticleReader component
  
  return <ArticleReader articleId="1" />
}
