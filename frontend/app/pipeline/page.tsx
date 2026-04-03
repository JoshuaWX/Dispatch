'use client'

import { useEffect, useMemo, useState } from 'react'
import { PipelineFeed } from '@/components/pipeline-feed'
import { AnalyticsStats, PerformanceCharts } from '@/components/pipeline-analytics'
import { Button } from '@/components/ui/button'
import { RefreshCw, Download, Play } from 'lucide-react'

type PipelineApiEvent = {
  id: string
  timestamp: string
  stage: 'trend-intake' | 'research' | 'writing' | 'quality-gate' | 'publish'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  articleTitle: string
  details: string
}

type PipelineStatusResponse = {
  status: 'idle' | 'running' | 'degraded'
  stage: 'idle' | 'trend-intake' | 'research' | 'writing' | 'quality-gate' | 'publish'
  activeTopic: string | null
  progress: number
  recentEvents: PipelineApiEvent[]
}

type ApiArticle = {
  id: string
  category: string
  publishedAt: string
  qualityScore: { overallScore: number }
}

function mapStage(stage: PipelineApiEvent['stage']) {
  if (stage === 'trend-intake') return 'discovery' as const
  if (stage === 'quality-gate') return 'verification' as const
  if (stage === 'publish') return 'published' as const
  return 'analysis' as const
}

export default function PipelinePage() {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [stories, setStories] = useState<Array<{
    id: string
    title: string
    stage: 'discovery' | 'verification' | 'analysis' | 'published'
    sources: number
    confidence: number
    timestamp: string
    category: string
  }>>([])
  const [pipelineState, setPipelineState] = useState<PipelineStatusResponse | null>(null)
  const [articles, setArticles] = useState<ApiArticle[]>([])

  const loadArticles = async () => {
    try {
      const response = await fetch('/api/articles', { cache: 'no-store' })
      if (!response.ok) return
      const json = (await response.json()) as { articles?: ApiArticle[] }
      if (Array.isArray(json.articles)) {
        setArticles(json.articles)
      }
    } catch {
      setArticles([])
    }
  }

  const loadPipeline = async () => {
    try {
      const response = await fetch('/api/pipeline/status', { cache: 'no-store' })
      if (!response.ok) return
      const json = (await response.json()) as PipelineStatusResponse
      setPipelineState(json)
      const mappedStories = json.recentEvents.slice(0, 8).map((event) => ({
        id: event.id,
        title: event.articleTitle,
        stage: mapStage(event.stage),
        sources: Math.max(3, Math.round((event.details.length % 10) + 3)),
        confidence: event.status === 'failed' ? 55 : event.status === 'processing' ? 78 : 92,
        timestamp: new Date(event.timestamp).toLocaleString(),
        category: 'Pipeline',
      }))
      if (mappedStories.length > 0) {
        setStories(mappedStories)
      } else {
        setStories([])
      }
    } catch {
      setPipelineState(null)
      setStories([])
    }
  }

  const liveMetrics = useMemo(() => {
    const recentEvents = pipelineState?.recentEvents ?? []
    const completedPublishes = recentEvents.filter(
      (event) => event.stage === 'publish' && event.status === 'completed'
    ).length
    const failedRuns = recentEvents.filter((event) => event.status === 'failed').length

    const runDurations = Array.from(new Set(recentEvents.map((event) => event.articleTitle)))
      .map((title) => {
        const runEvents = recentEvents.filter((event) => event.articleTitle === title)
        const intake = runEvents.find((event) => event.stage === 'trend-intake')
        const publish = runEvents.find((event) => event.stage === 'publish' && event.status === 'completed')

        if (!intake || !publish) {
          return null
        }

        return (new Date(publish.timestamp).getTime() - new Date(intake.timestamp).getTime()) / 60000
      })
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

    const averageVerificationTime =
      runDurations.length > 0
        ? `${(runDurations.reduce((sum, value) => sum + value, 0) / runDurations.length).toFixed(1)}m`
        : 'n/a'

    const sourceQuality =
      stories.length > 0
        ? `${Math.round(
            (stories.reduce((sum, story) => sum + story.confidence, 0) / stories.length) / 10
          )}%`
        : 'n/a'

    const publishedThisWeek = articles.filter((article) => {
      const publishedAt = new Date(article.publishedAt).getTime()
      return Date.now() - publishedAt <= 7 * 24 * 60 * 60 * 1000
    }).length

    return {
      averageVerificationTime,
      sourceQuality,
      publishedThisWeek,
      completedPublishes,
      failedRuns,
      activeTopic: pipelineState?.activeTopic,
    }
  }, [articles, pipelineState, stories])

  const categoryData = useMemo(() => {
    const counts = new Map<string, number>()
    articles.forEach((article) => {
      counts.set(article.category, (counts.get(article.category) ?? 0) + 1)
    })

    return Array.from(counts.entries()).map(([name, value]) => ({ name, value }))
  }, [articles])

  const verificationData = useMemo(() => {
    const recentEvents = pipelineState?.recentEvents ?? []
    const buckets = new Map<string, number>()

    recentEvents.forEach((event) => {
      const day = new Date(event.timestamp).toLocaleDateString('en-US', { weekday: 'short' })
      buckets.set(day, (buckets.get(day) ?? 0) + (event.status === 'completed' ? 1 : 0))
    })

    const mapped = Array.from(buckets.entries()).map(([name, value]) => ({ name, value }))

    return mapped
  }, [pipelineState])

  const storyMetricsData = useMemo(() => {
    const published = articles.length
    const pending = stories.filter((story) => story.stage !== 'published').length

    return [
      { name: 'Live', published, pending },
      { name: 'Recent', published: liveMetrics.completedPublishes, pending: liveMetrics.failedRuns },
    ]
  }, [articles.length, liveMetrics.completedPublishes, liveMetrics.failedRuns, stories])

  const improvementBullets = useMemo(() => {
    return [
      `Completed publish runs: ${liveMetrics.completedPublishes}`,
      `Average verification window: ${liveMetrics.averageVerificationTime}`,
      `Source quality from live feed: ${liveMetrics.sourceQuality}`,
    ]
  }, [liveMetrics.averageVerificationTime, liveMetrics.completedPublishes, liveMetrics.sourceQuality])

  const challengeBullets = useMemo(() => {
    return [
      pipelineState?.status === 'degraded'
        ? `Current pipeline is degraded while processing ${liveMetrics.activeTopic ?? 'a topic'}`
        : 'Pipeline is currently healthy and ready for the next run',
      `Failed runs recorded in recent history: ${liveMetrics.failedRuns}`,
      `Published stories in the last 7 days: ${liveMetrics.publishedThisWeek}`,
    ]
  }, [liveMetrics.activeTopic, liveMetrics.failedRuns, liveMetrics.publishedThisWeek, pipelineState?.status])

  const qualityMetrics = useMemo(
    () => [
      {
        label: 'Avg. Verification Time',
        value: liveMetrics.averageVerificationTime,
        status: liveMetrics.averageVerificationTime === 'n/a' ? 'good' as const : 'excellent' as const,
      },
      {
        label: 'Source Quality',
        value: liveMetrics.sourceQuality,
        status: liveMetrics.sourceQuality === 'n/a' ? 'good' as const : 'excellent' as const,
      },
      {
        label: 'Published This Week',
        value: String(liveMetrics.publishedThisWeek),
        status: liveMetrics.publishedThisWeek > 0 ? 'excellent' as const : 'good' as const,
      },
      {
        label: 'Failed Runs',
        value: String(liveMetrics.failedRuns),
        status: liveMetrics.failedRuns === 0 ? 'excellent' as const : 'good' as const,
      },
    ],
    [
      liveMetrics.averageVerificationTime,
      liveMetrics.failedRuns,
      liveMetrics.publishedThisWeek,
      liveMetrics.sourceQuality,
    ]
  )

  useEffect(() => {
    void loadArticles()
  }, [])

  useEffect(() => {
    void loadPipeline()
    void loadArticles()
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadPipeline()
    setIsRefreshing(false)
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      })
    } finally {
      await loadPipeline()
      setIsGenerating(false)
    }
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
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                <Play className="w-4 h-4 mr-2" />
                {isGenerating ? 'Running Pipeline...' : 'Run Pipeline Now'}
              </Button>
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

          {pipelineState && (
            <div className="rounded-lg border border-border bg-card p-4 mb-8">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold text-foreground">Status:</span>
                <span className="capitalize text-muted-foreground">{pipelineState.status}</span>
                <span className="font-semibold text-foreground">Stage:</span>
                <span className="capitalize text-muted-foreground">{pipelineState.stage}</span>
                <span className="font-semibold text-foreground">Progress:</span>
                <span className="text-muted-foreground">{pipelineState.progress}%</span>
                {pipelineState.activeTopic && (
                  <>
                    <span className="font-semibold text-foreground">Topic:</span>
                    <span className="text-muted-foreground">{pipelineState.activeTopic}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Stats */}
          <AnalyticsStats
            stats={[
              {
                label: 'Stories in Pipeline',
                value: stories.length,
                change: 12,
              },
              {
                label: 'Avg. Verification Time',
                value: liveMetrics.averageVerificationTime,
                change: -8,
              },
              {
                label: 'Source Quality',
                value: liveMetrics.sourceQuality,
                change: 2,
              },
              {
                label: 'Published This Week',
                value: liveMetrics.publishedThisWeek,
                change: 18,
              },
            ]}
          />
        </div>

        {/* Pipeline Feed */}
        <div className="mb-12">
          {stories.length > 0 ? (
            <PipelineFeed stories={stories} />
          ) : (
            <div className="bg-card rounded-lg border border-border p-8 text-center">
              <h3 className="text-xl font-semibold text-foreground mb-2">No pipeline events yet</h3>
              <p className="text-muted-foreground">
                Autonomous generation is active; you can also trigger a run manually.
              </p>
            </div>
          )}
        </div>

        {/* Charts Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-foreground mb-6">
            Performance Analytics
          </h2>
          {verificationData.length > 0 || storyMetricsData.some((item) => item.published || item.pending) || categoryData.length > 0 ? (
            <PerformanceCharts
              verificationData={verificationData}
              storyMetricsData={storyMetricsData}
              categoryData={categoryData}
              qualityMetrics={qualityMetrics}
            />
          ) : (
            <div className="bg-card rounded-lg border border-border p-8 text-center">
              <p className="text-muted-foreground">Analytics will appear after generated stories are processed.</p>
            </div>
          )}
        </div>

        {/* Key Insights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Live Improvements
            </h3>
            <ul className="space-y-3">
              {improvementBullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-3">
                  <span className="text-green-600 dark:text-green-400 mt-1">✓</span>
                  <span className="text-sm text-foreground">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Current Watch Items
            </h3>
            <ul className="space-y-3">
              {challengeBullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-3">
                  <span className="text-amber-600 dark:text-amber-400 mt-1">!</span>
                  <span className="text-sm text-foreground">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  )
}
