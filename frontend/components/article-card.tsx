'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Eye } from 'lucide-react'

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
  imageUrl,
  publishedAt,
  viewCount,
  sources,
  featured = false,
}: ArticleCardProps) {
  return (
    <Link href={`/article/${id}`} className="block group h-full">
      <article
        className={`flex flex-col h-full bg-card transition-colors ${
          featured 
            ? 'border-t-[6px] border-t-primary bg-muted/10' 
            : 'border-b border-border/60 sm:border-none'
        }`}
      >
        {/* Image Container - Square, no padding */}
        {imageUrl && (
          <div className="relative h-48 sm:h-[14rem] w-full overflow-hidden mb-3">
            <Image
              src={imageUrl}
              alt={title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
        )}

        {/* Content */}
        <div className={`flex flex-col flex-1 ${featured && !imageUrl ? 'pt-4' : ''} ${featured ? 'px-4 pb-5' : 'pb-4 sm:pb-0'}`}>
          <h3 className="text-[1.35rem] sm:text-2xl leading-tight font-bold text-foreground mb-3 group-hover:text-primary group-hover:underline decoration-2 underline-offset-4">
            {title}
          </h3>

          <p className="text-[15px] leading-relaxed text-muted-foreground mb-4 line-clamp-3 grow">
            {description}
          </p>

          {/* Metadata - Clean, inline, pipe-separated */}
          <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-border/40">
            <div className="flex items-center text-[13px] text-muted-foreground pt-1 divide-x divide-border">
              <span className="font-bold text-primary pr-3 capitalize">
                {category}
              </span>
              <span className="px-3">
                {publishedAt}
              </span>
              {viewCount !== undefined && (
                <span className="flex items-center gap-1.5 pl-3">
                  <Eye className="w-3.5 h-3.5" />
                  {viewCount.toLocaleString()}
                </span>
              )}
            </div>

            {sources && sources.length > 0 && (
              <div className="mt-1 text-[12px] text-muted-foreground">
                <span className="font-medium">Sources: </span>
                {sources.join(', ')}
              </div>
            )}
          </div>
        </div>
      </article>
    </Link>
  )
}
