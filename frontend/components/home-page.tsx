'use client'

import { ArticleCard } from '@/components/article-card'
import { TrustStrip } from '@/components/trust-strip'

const FEATURED_ARTICLE = {
  id: '1',
  title: 'Breakthrough in Quantum Computing Achieved by Leading Research Institute',
  description:
    'Scientists announce a major advancement in quantum error correction, bringing practical quantum computing closer to reality. The breakthrough promises to accelerate development across industries from cryptography to drug discovery.',
  category: 'Technology',
  categoryColor: 'secondary' as const,
  imageUrl:
    'https://images.unsplash.com/photo-1635070041078-e72b99c00b61?w=1200&h=600&fit=crop',
  publishedAt: '2 hours ago',
  viewCount: 45230,
  sources: ['Nature', 'MIT News', 'Science Daily'],
  featured: true,
}

const TRENDING_ARTICLES = [
  {
    id: '2',
    title: 'Global Markets Rally on Economic Growth Signals',
    description:
      'Stock indices reach new highs as positive economic data fuels investor optimism across multiple sectors.',
    category: 'Business',
    categoryColor: 'default' as const,
    imageUrl:
      'https://images.unsplash.com/photo-1611974789855-9c2a0a7fbda3?w=600&h=400&fit=crop',
    publishedAt: '4 hours ago',
    viewCount: 28910,
    sources: ['Bloomberg', 'Reuters', 'CNBC'],
  },
  {
    id: '3',
    title: 'Climate Summit Reaches Historic Agreement on Carbon Reduction',
    description:
      'Nations commit to ambitious new targets for greenhouse gas emissions reduction by 2030.',
    category: 'Environment',
    categoryColor: 'default' as const,
    imageUrl:
      'https://images.unsplash.com/photo-1574482620811-1aa16ffe3c82?w=600&h=400&fit=crop',
    publishedAt: '6 hours ago',
    viewCount: 32150,
    sources: ['UN News', 'Reuters'],
  },
  {
    id: '4',
    title: 'Artificial Intelligence Reshapes Healthcare Diagnostics',
    description:
      'New AI model shows 95% accuracy in identifying rare diseases, potentially saving thousands of lives annually.',
    category: 'Health',
    categoryColor: 'default' as const,
    imageUrl:
      'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=600&h=400&fit=crop',
    publishedAt: '8 hours ago',
    viewCount: 41280,
    sources: ['Medical Research Today', 'Health News'],
  },
]

export function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <div className="mb-12">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-balance mb-4">
            The Future of{' '}
            <span className="text-primary">Autonomous Journalism</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground text-balance max-w-2xl">
            Discover AI-curated news with complete source transparency. Every story, verified.
            Every source, visible. Every claim, trackable.
          </p>
        </div>

        {/* Featured Story */}
        <div className="mb-16">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ArticleCard {...FEATURED_ARTICLE} />
            </div>
            <div className="flex flex-col gap-4">
              <div className="bg-card rounded-lg border border-border p-6">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Verification Status
                </h3>
                <TrustStrip
                  verificationStatus="verified"
                  sourceCount={8}
                  lastUpdated="5 minutes ago"
                  aiGenerated
                />
              </div>
              <div className="bg-card rounded-lg border border-border p-6 flex-grow">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Key Insights
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>Coherence times improved by 1000x</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>Practical applications within 5 years</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>$2B+ in research funding secured</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Trending Section */}
        <div>
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-foreground">Trending Now</h2>
            <p className="text-muted-foreground mt-2">
              Most viewed stories across all categories
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TRENDING_ARTICLES.map((article) => (
              <ArticleCard key={article.id} {...article} />
            ))}
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="bg-muted/30 border-t border-border py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-8">
            Browse by Category
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { name: 'Technology', count: 234 },
              { name: 'Business', count: 189 },
              { name: 'Science', count: 156 },
              { name: 'Health', count: 142 },
              { name: 'Environment', count: 98 },
              { name: 'Politics', count: 127 },
            ].map((cat) => (
              <div
                key={cat.name}
                className="group cursor-pointer p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/5 transition-all text-center"
              >
                <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                  {cat.name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{cat.count} stories</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-primary/10 to-accent/10 border-t border-border py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Get News You Can Trust
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Sign up for personalized news briefings curated by AI with full source transparency.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors">
              Subscribe Now
            </button>
            <button className="px-8 py-3 border border-primary text-primary rounded-lg font-semibold hover:bg-primary/10 transition-colors">
              Learn More
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
