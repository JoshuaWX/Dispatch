'use client'

import Link from 'next/link'
import { Menu, Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { setTheme, resolvedTheme, theme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  const currentTheme = theme === 'system' ? resolvedTheme : theme
  const todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="border-b border-border bg-foreground text-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-8 flex items-center justify-between text-[11px] tracking-wide">
          <span className="uppercase font-semibold text-background/80">Global Edition</span>
          <span className="hidden sm:inline text-background/70">{todayLabel}</span>
          <span className="uppercase font-semibold text-primary-foreground bg-primary px-2 py-0.5 rounded-sm">
            Live Desk
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[4.5rem]">
          <Link href="/" className="flex items-center gap-3 no-underline hover:no-underline">
            <div className="bg-primary text-primary-foreground px-3 py-1.5 rounded-sm leading-none">
              <span className="text-base sm:text-lg font-black tracking-[0.18em]">DISPATCH</span>
            </div>
            <span className="hidden lg:inline text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Independent World Report
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            <Link
              href="/"
              className="text-xs lg:text-sm uppercase tracking-[0.18em] font-semibold text-foreground/90 hover:text-foreground transition-colors no-underline hover:underline decoration-2 underline-offset-[10px]"
            >
              Front Page
            </Link>
            <Link
              href="/explore"
              className="text-xs lg:text-sm uppercase tracking-[0.18em] font-semibold text-foreground/90 hover:text-foreground transition-colors no-underline hover:underline decoration-2 underline-offset-[10px]"
            >
              Explore
            </Link>
            <Link
              href="/pipeline"
              className="text-xs lg:text-sm uppercase tracking-[0.18em] font-semibold text-foreground/90 hover:text-foreground transition-colors no-underline hover:underline decoration-2 underline-offset-[10px]"
            >
              Pipeline
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Toggle color theme"
                  title="Theme"
                >
                  {mounted && currentTheme === 'dark' ? (
                    <Moon className="w-4 h-4" />
                  ) : (
                    <Sun className="w-4 h-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuRadioGroup
                  value={theme ?? 'system'}
                  onValueChange={(value) => setTheme(value)}
                >
                  <DropdownMenuRadioItem value="light">
                    <Sun className="w-4 h-4" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="w-4 h-4" />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor className="w-4 h-4" />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex uppercase tracking-wider"
            >
              Sign In
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <nav className="md:hidden pb-4 pt-2 space-y-1 border-t border-border">
            <Link
              href="/"
              className="block px-3 py-2 text-xs uppercase tracking-[0.16em] font-semibold text-foreground hover:bg-muted rounded-md no-underline"
            >
              Front Page
            </Link>
            <Link
              href="/explore"
              className="block px-3 py-2 text-xs uppercase tracking-[0.16em] font-semibold text-foreground hover:bg-muted rounded-md no-underline"
            >
              Explore
            </Link>
            <Link
              href="/pipeline"
              className="block px-3 py-2 text-xs uppercase tracking-[0.16em] font-semibold text-foreground hover:bg-muted rounded-md no-underline"
            >
              Pipeline
            </Link>
          </nav>
        )}
      </div>
    </header>
  )
}
