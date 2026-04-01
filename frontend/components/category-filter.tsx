'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

export interface CategoryFilterProps {
  categories: {
    id: string
    label: string
    count?: number
  }[]
  selectedCategories: string[]
  onCategoryChange: (categoryId: string) => void
  onClear?: () => void
}

export function CategoryFilter({
  categories,
  selectedCategories,
  onCategoryChange,
  onClear,
}: CategoryFilterProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Categories</h3>
        {selectedCategories.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-xs"
          >
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.id)}
            className="group"
          >
            <Badge
              variant={
                selectedCategories.includes(category.id) ? 'default' : 'outline'
              }
              className="cursor-pointer transition-all hover:ring-2 ring-primary/50"
            >
              {category.label}
              {category.count !== undefined && (
                <span className="ml-1 text-xs opacity-70">({category.count})</span>
              )}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  )
}
