'use client'

import { Badge } from '@/components/ui/badge'
import {
  CheckCircle,
  AlertCircle,
  Clock,
  TrendingUp,
  Database,
  Filter as FilterIcon,
} from 'lucide-react'
import { useState } from 'react'

export interface PipelineFeedProps {
  stories: Array<{
    id: string
    title: string
    stage: 'discovery' | 'verification' | 'analysis' | 'published'
    sources: number
    confidence: number
    timestamp: string
    category: string
  }>
}

const STAGE_CONFIG = {
  discovery: {
    icon: Clock,
    color: 'text-primary',
    bg: 'bg-primary/10',
    label: 'Discovery',
    description: 'Story being researched',
  },
  verification: {
    icon: AlertCircle,
    color: 'text-foreground/85',
    bg: 'bg-foreground/10',
    label: 'Verification',
    description: 'Sources being confirmed',
  },
  analysis: {
    icon: Database,
    color: 'text-muted-foreground',
    bg: 'bg-muted/80',
    label: 'Analysis',
    description: 'Content being analyzed',
  },
  published: {
    icon: CheckCircle,
    color: 'text-primary',
    bg: 'bg-primary/10',
    label: 'Published',
    description: 'Story published',
  },
}

export function PipelineFeed({ stories }: PipelineFeedProps) {
  const [filterStage, setFilterStage] = useState<string | null>(null)

  const filteredStories = filterStage
    ? stories.filter((s) => s.stage === filterStage)
    : stories

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-foreground">Pipeline Feed</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time view of stories through production stages
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Database className="w-4 h-4" />
          <span>{stories.length} stories in pipeline</span>
        </div>
      </div>

      {/* Stage Filters */}
      <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b border-border">
        <button
          onClick={() => setFilterStage(null)}
          className={`text-sm px-3 py-1.5 rounded-full transition-all ${
            filterStage === null
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          All
        </button>
        {Object.entries(STAGE_CONFIG).map(([stage, config]) => (
          <button
            key={stage}
            onClick={() => setFilterStage(stage)}
            className={`text-sm px-3 py-1.5 rounded-full transition-all ${
              filterStage === stage
                ? `${config.bg} ${config.color}`
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {config.label}
          </button>
        ))}
      </div>

      {/* Stories List */}
      <div className="space-y-3">
        {filteredStories.map((story) => {
          const stageConfig = STAGE_CONFIG[story.stage]
          const Icon = stageConfig.icon

          return (
            <div
              key={story.id}
              className="p-4 border border-border rounded-lg hover:border-primary/50 hover:bg-muted/50 transition-all group"
            >
              <div className="flex items-start gap-4">
                {/* Stage Icon */}
                <div
                  className={`p-2.5 rounded-lg ${stageConfig.bg} shrink-0`}
                >
                  <Icon className={`w-5 h-5 ${stageConfig.color}`} />
                </div>

                {/* Content */}
                <div className="grow min-w-0">
                  <div className="flex items-start gap-2 mb-2">
                    <h4 className="font-semibold text-foreground line-clamp-1">
                      {story.title}
                    </h4>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {story.category}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span className={`font-medium ${stageConfig.color}`}>
                      {stageConfig.label}
                    </span>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Database className="w-3.5 h-3.5" />
                      <span>{story.sources} sources</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>{story.confidence}% confidence</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {story.timestamp}
                    </span>
                  </div>
                </div>

                {/* Confidence Bar */}
                <div className="hidden sm:flex flex-col items-end gap-2">
                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${story.confidence}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {story.confidence}%
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
