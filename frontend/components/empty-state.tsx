'use client'

import { Search } from 'lucide-react'

export function EmptyState({ title, description, icon: Icon = Search }: { title: string; description?: string; icon?: any }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="text-muted-foreground mb-4">
        <Icon size={48} />
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>
      {description && <p className="text-muted-foreground text-center max-w-md">{description}</p>}
    </div>
  )
}
