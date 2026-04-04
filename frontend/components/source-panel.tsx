'use client'

import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { ExternalLink } from 'lucide-react'

export interface SourcePanelProps {
  sources: Array<{
    id: string
    name: string
    logo?: string
    reliability?: 'high' | 'medium' | 'low'
    excerpt: string
    url: string
    publishedAt: string
  }>
  title?: string
}

export function SourcePanel({ sources, title = 'Sources' }: SourcePanelProps) {
  const reliabilityConfig = {
    high: 'bg-primary/10 text-primary',
    medium: 'bg-muted text-muted-foreground',
    low: 'bg-foreground/15 text-foreground',
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>

      <div className="space-y-4">
        {sources.map((source) => (
          <div key={source.id} className="pb-4 border-b border-border last:border-0">
            <div className="flex items-start gap-3 mb-3">
              {source.logo && (
                <div className="relative w-8 h-8 shrink-0 bg-muted rounded">
                  <Image
                    src={source.logo}
                    alt={source.name}
                    fill
                    className="object-cover rounded"
                    sizes="32px"
                  />
                </div>
              )}
              <div className="grow min-w-0">
                <p className="text-sm font-medium text-foreground">{source.name}</p>
                <p className="text-xs text-muted-foreground">{source.publishedAt}</p>
              </div>
              {source.reliability && (
                <Badge
                  className={reliabilityConfig[source.reliability]}
                  variant="secondary"
                >
                  {source.reliability}
                </Badge>
              )}
            </div>

            <p className="text-sm text-foreground mb-3 leading-relaxed">
              {source.excerpt}
            </p>

            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Read full article
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
