'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Calendar, Eye } from 'lucide-react'

export interface ArticleCardProps {
  id: string
  title: string
  description: string
  category: string
  categoryColor?: 'default' | 'secondary' | 'destructive' | 'outline'
  imageUrl?: string
  publishedAt: string
  viewCount?: number
  sources?: string[]
  featured?: boolean
}

export function ArticleCard({
  id,
  title,
  description,
  category,
  categoryColor = 'default',
  imageUrl,
  publishedAt,
  viewCount,
  sources,
  featured = false,
}: ArticleCardProps) {
  return (
    <Link href={`/article/${id}`} className="block no-underline hover:no-underline">
      <article
        className={`group cursor-pointer h-full transition-all duration-300 hover:shadow-md rounded-sm overflow-hidden border border-border/90 hover:border-primary/55 ${
          featured
            ? 'bg-linear-to-br from-primary/8 via-foreground/3 to-transparent ring-1 ring-primary/25'
            : 'bg-card hover:bg-muted/35'
        }`}
      >
        {/* Image Container */}
        {imageUrl && (
          <div className="relative h-44 sm:h-52 overflow-hidden bg-muted">
            <Image
              src={imageUrl}
              alt={title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
            <div className="absolute top-0 left-0 h-1.5 w-full bg-primary/90" />
            {featured && (
              <div className="absolute inset-0 bg-linear-to-t from-black/30 to-transparent dark:from-black/55" />
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-4 sm:p-5 flex flex-col h-full">
          <div className="flex items-start justify-between gap-2 mb-3">
            <Badge variant={categoryColor} className="text-[11px] uppercase tracking-[0.12em] whitespace-nowrap">
              {category}
            </Badge>
            {featured && (
              <Badge variant="default" className="text-[11px] uppercase tracking-[0.12em]">
                Featured
              </Badge>
            )}
          </div>

          <h3 className="text-xl sm:text-[1.4rem] leading-tight font-bold text-foreground mb-2 line-clamp-3 transition-colors group-hover:text-primary/90 group-hover:underline decoration-2 underline-offset-4">
            {title}
          </h3>

          <p className="text-sm text-muted-foreground mb-4 line-clamp-3 grow">
            {description}
          </p>

          {/* Metadata */}
          <div className="flex flex-col gap-3 text-xs text-muted-foreground border-t border-border/70 pt-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>{publishedAt}</span>
              </div>
              {viewCount !== undefined && (
                <div className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  <span>{viewCount.toLocaleString()}</span>
                </div>
              )}
            </div>

            {sources && sources.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold">Sources:</span>
                <div className="flex gap-1 flex-wrap">
                  {sources.slice(0, 2).map((source, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs py-0 px-2">
                      {source}
                    </Badge>
                  ))}
                  {sources.length > 2 && (
                    <Badge variant="outline" className="text-xs py-0 px-2">
                      +{sources.length - 2}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </article>
    </Link>
  )
}
