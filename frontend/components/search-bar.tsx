'use client'

import { Search, Filter, X } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export interface SearchBarProps {
  onSearch: (query: string) => void
  onFilterClick?: () => void
  placeholder?: string
}

export function SearchBar({
  onSearch,
  onFilterClick,
  placeholder = 'Search stories...',
}: SearchBarProps) {
  const [query, setQuery] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(query)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative flex items-center">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 pr-4 py-2.5 rounded-lg"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onFilterClick}
          className="ml-2"
        >
          <Filter className="w-5 h-5" />
        </Button>
      </div>
    </form>
  )
}

export interface FilterPanelProps {
  isOpen: boolean
  onClose: () => void
  selectedFilters: Record<string, string[]>
  onFilterChange: (filterType: string, values: string[]) => void
}

export function FilterPanel({
  isOpen,
  onClose,
  selectedFilters,
  onFilterChange,
}: FilterPanelProps) {
  const filters = {
    category: [
      'Technology',
      'Business',
      'Science',
      'Health',
      'Environment',
      'Politics',
    ],
    source: ['Verified', 'Pending', 'Unverified'],
    date: ['Last 24 hours', 'Last 7 days', 'Last 30 days', 'Last year', 'All time'],
    language: ['English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese'],
  }

  const handleToggle = (filterType: string, value: string) => {
    const current = selectedFilters[filterType] || []
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    onFilterChange(filterType, updated)
  }

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity ${
        isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div
        className={`absolute right-0 top-0 h-full w-full max-w-md bg-background border-l border-border shadow-lg transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur">
          <h3 className="font-semibold text-foreground">Filters</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-3.5rem)] p-4 space-y-6">
          {Object.entries(filters).map(([filterType, options]) => (
            <div key={filterType}>
              <h4 className="text-sm font-semibold text-foreground mb-3 capitalize">
                {filterType}
              </h4>
              <div className="space-y-2">
                {options.map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={
                        (selectedFilters[filterType] || []).includes(option)
                      }
                      onChange={() => handleToggle(filterType, option)}
                      className="w-4 h-4 rounded border-border"
                    />
                    <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                      {option}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur p-4 space-y-2">
          <Button
            onClick={() => {
              Object.keys(selectedFilters).forEach((key) => {
                onFilterChange(key, [])
              })
            }}
            variant="outline"
            className="w-full"
          >
            Clear All
          </Button>
          <Button onClick={onClose} className="w-full">
            Apply Filters
          </Button>
        </div>
      </div>
    </div>
  )
}
