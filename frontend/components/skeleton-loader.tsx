'use client'

export function SkeletonLoader({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 animate-pulse">
          <div className="h-6 bg-muted rounded-lg w-3/4"></div>
          <div className="h-4 bg-muted rounded-lg w-full"></div>
          <div className="h-4 bg-muted rounded-lg w-5/6"></div>
          <div className="flex gap-2 pt-2">
            <div className="h-8 bg-muted rounded-full w-24"></div>
            <div className="h-8 bg-muted rounded-full w-20"></div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function ArticleSkeletonLoader() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-4">
        <div className="h-10 bg-muted rounded-lg w-3/4"></div>
        <div className="h-6 bg-muted rounded-lg w-1/2"></div>
      </div>
      <div className="h-96 bg-muted rounded-lg w-full"></div>
      <div className="space-y-4">
        <div className="h-4 bg-muted rounded-lg w-full"></div>
        <div className="h-4 bg-muted rounded-lg w-full"></div>
        <div className="h-4 bg-muted rounded-lg w-5/6"></div>
      </div>
    </div>
  )
}
