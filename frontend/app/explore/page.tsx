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
  imageUrl?: string
  category: string
  sources: Array<{ name: string }>
  publishedAt: string
  qualityScore: { overallScore: number }
}

const MIN_IMAGE_CONFIDENCE = 7

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
        if (mounted && Array.isArray(json.articles)) {
          setApiArticles(json.articles)
        }
      } catch {
        setApiArticles([])
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
      apiArticles.map((article, index) => ({
        id: article.id,
        title: article.headline,
        description: article.subheadline || article.lede,
        category: article.category,
        categoryColor: (index % 3 === 0 ? 'secondary' : 'default') as const,
        imageUrl:
          article.qualityScore.overallScore >= MIN_IMAGE_CONFIDENCE
            ? article.imageUrl
            : undefined,
        publishedAt: article.publishedAt,
        viewCount: Math.round(article.qualityScore.overallScore * 5000),
        sources: article.sources.map((source) => source.name),
      })),
    [apiArticles]
  )

  const categories = useMemo(() => {
    const counts = new Map<string, number>()

    displayArticles.forEach((article) => {
      counts.set(article.category, (counts.get(article.category) ?? 0) + 1)
    })

    return Array.from(counts.entries())
      .map(([label, count]) => ({
        id: label.toLowerCase().replace(/\s+/g, '-'),
        label,
        count,
      }))
      .sort((left, right) => right.count - left.count)
  }, [displayArticles])

  const filteredArticles = displayArticles.filter((article) => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.description.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory =
      selectedCategories.length === 0 ||
      selectedCategories.some((cat) =>
        article.category.toLowerCase().replace(/\s+/g, '-') === cat.toLowerCase()
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
                categories={categories}
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
