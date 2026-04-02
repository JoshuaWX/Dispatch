'use client'

import { useEffect, useMemo, useState } from 'react'
import { SearchBar, FilterPanel } from '@/components/search-bar'
import { ArticleCard } from '@/components/article-card'
import { CategoryFilter } from '@/components/category-filter'

type ApiArticle = {
  id: string
  topic: string
  headline: string
  subheadline: string
  lede: string
  category: string
  sources: Array<{ name: string }>
  publishedAt: string
  qualityScore: { overallScore: number }
}

const ALL_ARTICLES = [
  {
    id: '1',
    title: 'Breakthrough in Quantum Computing Achieved',
    description:
      'Scientists announce a major advancement in quantum error correction, bringing practical quantum computing closer to reality.',
    category: 'Technology',
    categoryColor: 'secondary' as const,
    imageUrl:
      'https://images.unsplash.com/photo-1635070041078-e72b99c00b61?w=600&h=400&fit=crop',
    publishedAt: '2 hours ago',
    viewCount: 45230,
    sources: ['Nature', 'MIT News'],
    featured: false,
  },
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
    sources: ['Bloomberg', 'Reuters'],
  },
  {
    id: '3',
    title: 'Climate Summit Reaches Historic Agreement',
    description:
      'Nations commit to ambitious new targets for greenhouse gas emissions reduction by 2030.',
    category: 'Environment',
    categoryColor: 'default' as const,
    imageUrl:
      'https://images.unsplash.com/photo-1574482620811-1aa16ffe3c82?w=600&h=400&fit=crop',
    publishedAt: '6 hours ago',
    viewCount: 32150,
    sources: ['UN News'],
  },
  {
    id: '4',
    title: 'AI Reshapes Healthcare Diagnostics',
    description:
      'New AI model shows 95% accuracy in identifying rare diseases, potentially saving thousands of lives.',
    category: 'Health',
    categoryColor: 'default' as const,
    imageUrl:
      'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=600&h=400&fit=crop',
    publishedAt: '8 hours ago',
    viewCount: 41280,
    sources: ['Medical Research Today'],
  },
  {
    id: '5',
    title: 'Space Agency Launches New Mars Mission',
    description:
      'Historic launch marks beginning of next phase in Mars exploration and potential human missions.',
    category: 'Science',
    categoryColor: 'default' as const,
    imageUrl:
      'https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=600&h=400&fit=crop',
    publishedAt: '10 hours ago',
    viewCount: 38920,
    sources: ['NASA', 'Science Daily'],
  },
  {
    id: '6',
    title: 'New Political Coalition Formed',
    description:
      'Alliance brings together 12 parties in historic political realignment for policy reforms.',
    category: 'Politics',
    categoryColor: 'default' as const,
    imageUrl:
      'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop',
    publishedAt: '12 hours ago',
    viewCount: 21540,
    sources: ['Political News Network'],
  },
  {
    id: '7',
    title: 'Major Sports Championship Results',
    description:
      'Record-breaking performance leads team to first championship victory in 20 years.',
    category: 'Sports',
    categoryColor: 'default' as const,
    imageUrl:
      'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=600&h=400&fit=crop',
    publishedAt: '14 hours ago',
    viewCount: 55230,
    sources: ['Sports Today'],
  },
  {
    id: '8',
    title: 'Technology Startup Reaches Unicorn Status',
    description:
      'AI company valued at $1 billion following successful Series C funding round.',
    category: 'Business',
    categoryColor: 'default' as const,
    imageUrl:
      'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop',
    publishedAt: '16 hours ago',
    viewCount: 18760,
    sources: ['TechCrunch', 'Venture Beat'],
  },
]

const CATEGORIES = [
  { id: 'technology', label: 'Technology', count: 234 },
  { id: 'business', label: 'Business', count: 189 },
  { id: 'science', label: 'Science', count: 156 },
  { id: 'health', label: 'Health', count: 142 },
  { id: 'environment', label: 'Environment', count: 98 },
  { id: 'politics', label: 'Politics', count: 127 },
  { id: 'sports', label: 'Sports', count: 111 },
]

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const [sortBy, setSortBy] = useState('recent')
  const [apiArticles, setApiArticles] = useState<ApiArticle[]>([])

  useEffect(() => {
    let mounted = true

    const loadArticles = async () => {
      try {
        const response = await fetch('/api/articles', { cache: 'no-store' })
        if (!response.ok) return
        const json = (await response.json()) as { articles?: ApiArticle[] }
        if (mounted && Array.isArray(json.articles) && json.articles.length > 0) {
          setApiArticles(json.articles)
        }
      } catch {
        // Keep fallback catalog when API data is unavailable.
      }
    }

    void loadArticles()
    return () => {
      mounted = false
    }
  }, [])

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((c) => c !== categoryId)
        : [...prev, categoryId]
    )
  }

  const displayArticles = useMemo(
    () =>
      apiArticles.length
        ? apiArticles.map((article, index) => ({
            id: article.id,
            title: article.headline,
            description: article.subheadline || article.lede,
            category: article.category,
            categoryColor: (index % 3 === 0 ? 'secondary' : 'default') as const,
            imageUrl:
              index % 2
                ? 'https://images.unsplash.com/photo-1611974789855-9c2a0a7fbda3?w=600&h=400&fit=crop'
                : 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=600&h=400&fit=crop',
            publishedAt: article.publishedAt,
            viewCount: Math.round(article.qualityScore.overallScore * 5000),
            sources: article.sources.map((source) => source.name),
          }))
        : ALL_ARTICLES,
    [apiArticles]
  )

  const filteredArticles = displayArticles.filter((article) => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.description.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory =
      selectedCategories.length === 0 ||
      selectedCategories.some((cat) =>
        article.category.toLowerCase().includes(cat.toLowerCase())
      )

    return matchesSearch && matchesCategory
  }).sort((a, b) => {
    if (sortBy === 'recent') {
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    } else if (sortBy === 'popular') {
      return (b.viewCount || 0) - (a.viewCount || 0)
    }
    return 0
  })

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
            Explore Stories
          </h1>
          <p className="text-lg text-muted-foreground">
            Search and discover stories across all categories
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-8">
          <SearchBar
            onSearch={setSearchQuery}
            onFilterClick={() => setIsFilterOpen(true)}
            placeholder="Search by title, description, or keywords..."
          />
        </div>

        {/* Filter Panel */}
        <FilterPanel
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          selectedFilters={filters}
          onFilterChange={(type, values) =>
            setFilters((prev) => ({ ...prev, [type]: values }))
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-8">
              {/* Categories */}
              <CategoryFilter
                categories={CATEGORIES}
                selectedCategories={selectedCategories}
                onCategoryChange={handleCategoryChange}
                onClear={() => setSelectedCategories([])}
              />

              {/* Sort Options */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Sort By
                </h3>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground"
                >
                  <option value="recent">Most Recent</option>
                  <option value="popular">Most Popular</option>
                </select>
              </div>

              {/* Active Filters Display */}
              {(selectedCategories.length > 0 || searchQuery) && (
                <div className="bg-accent/10 rounded-lg p-4 border border-accent/20">
                  <p className="text-xs font-semibold text-accent mb-3">
                    Active Filters
                  </p>
                  <div className="space-y-2 text-xs">
                    {searchQuery && (
                      <p className="text-muted-foreground">
                        Search: <span className="font-medium">{searchQuery}</span>
                      </p>
                    )}
                    {selectedCategories.length > 0 && (
                      <p className="text-muted-foreground">
                        Categories: <span className="font-medium">{selectedCategories.length}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Results Count */}
            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-semibold">{filteredArticles.length}</span> stories
              </p>
            </div>

            {/* Articles Grid */}
            {filteredArticles.length > 0 ? (
              <div className="grid gap-6">
                {filteredArticles.map((article) => (
                  <ArticleCard key={article.id} {...article} />
                ))}
              </div>
            ) : (
              <div className="bg-card rounded-lg border border-border p-12 text-center">
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  No stories found
                </h3>
                <p className="text-muted-foreground">
                  Try adjusting your search or filter criteria
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
