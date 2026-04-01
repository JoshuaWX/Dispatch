'use client'

import { useState } from 'react'
import { PipelineFeed } from '@/components/pipeline-feed'
import { AnalyticsStats, PerformanceCharts } from '@/components/pipeline-analytics'
import { Button } from '@/components/ui/button'
import { RefreshCw, Download } from 'lucide-react'

const MOCK_STORIES = [
  {
    id: '1',
    title: 'Global Tech Summit Announces Major AI Initiatives',
    stage: 'published' as const,
    sources: 12,
    confidence: 98,
    timestamp: '2 hours ago',
    category: 'Technology',
  },
  {
    id: '2',
    title: 'Healthcare Reform Bill Passes Committee Vote',
    stage: 'analysis' as const,
    sources: 8,
    confidence: 87,
    timestamp: '1 hour ago',
    category: 'Politics',
  },
  {
    id: '3',
    title: 'Stock Market Reaches New All-Time High',
    stage: 'verification' as const,
    sources: 15,
    confidence: 94,
    timestamp: '30 minutes ago',
    category: 'Business',
  },
  {
    id: '4',
    title: 'New Species Discovered in Amazon Rainforest',
    stage: 'discovery' as const,
    sources: 3,
    confidence: 72,
    timestamp: '15 minutes ago',
    category: 'Environment',
  },
  {
    id: '5',
    title: 'Olympic Committee Selects Host City for 2032',
    stage: 'published' as const,
    sources: 10,
    confidence: 99,
    timestamp: '1 day ago',
    category: 'Sports',
  },
]

const VERIFICATION_DATA = [
  { name: 'Mon', value: 45 },
  { name: 'Tue', value: 52 },
  { name: 'Wed', value: 48 },
  { name: 'Thu', value: 61 },
  { name: 'Fri', value: 55 },
  { name: 'Sat', value: 43 },
  { name: 'Sun', value: 38 },
]

const STORY_METRICS = [
  { name: 'Week 1', published: 45, pending: 12 },
  { name: 'Week 2', published: 52, pending: 8 },
  { name: 'Week 3', published: 48, pending: 15 },
  { name: 'Week 4', published: 61, pending: 10 },
]

const CATEGORY_DATA = [
  { name: 'Technology', value: 145 },
  { name: 'Business', value: 98 },
  { name: 'Politics', value: 87 },
  { name: 'Environment', value: 72 },
  { name: 'Other', value: 56 },
]

export default function PipelinePage() {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setIsRefreshing(false)
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-4xl sm:text-5xl font-bold text-foreground">
                Editorial Pipeline
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
                Real-time transparency into story production and verification
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          {/* Stats */}
          <AnalyticsStats
            stats={[
              {
                label: 'Stories in Pipeline',
                value: MOCK_STORIES.length,
                change: 12,
              },
              {
                label: 'Avg. Verification Time',
                value: '2.5h',
                change: -8,
              },
              {
                label: 'Source Quality',
                value: '99.2%',
                change: 2,
              },
              {
                label: 'Published This Week',
                value: '156',
                change: 18,
              },
            ]}
          />
        </div>

        {/* Pipeline Feed */}
        <div className="mb-12">
          <PipelineFeed stories={MOCK_STORIES} />
        </div>

        {/* Charts Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-foreground mb-6">
            Performance Analytics
          </h2>
          <PerformanceCharts
            verificationData={VERIFICATION_DATA}
            storyMetricsData={STORY_METRICS}
            categoryData={CATEGORY_DATA}
          />
        </div>

        {/* Key Insights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Recent Improvements
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="text-green-600 dark:text-green-400 mt-1">✓</span>
                <span className="text-sm text-foreground">
                  Verification speed increased 23% this month
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-600 dark:text-green-400 mt-1">✓</span>
                <span className="text-sm text-foreground">
                  Source accuracy improved to 99.2%
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-600 dark:text-green-400 mt-1">✓</span>
                <span className="text-sm text-foreground">
                  Reader trust score reached 9.2/10
                </span>
              </li>
            </ul>
          </div>

          <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Current Challenges
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="text-amber-600 dark:text-amber-400 mt-1">!</span>
                <span className="text-sm text-foreground">
                  5 stories pending verification due to conflicting sources
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-amber-600 dark:text-amber-400 mt-1">!</span>
                <span className="text-sm text-foreground">
                  Processing delay on image verification system
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-amber-600 dark:text-amber-400 mt-1">!</span>
                <span className="text-sm text-foreground">
                  Backlog of 3 stories awaiting expert review
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  )
}
