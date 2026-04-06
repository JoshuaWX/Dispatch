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
import { usePathname } from 'next/navigation'

type PipelineStatus = {
  status?: 'idle' | 'running' | 'degraded'
  updatedAt?: string
}

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({ status: 'idle' })
  const { setTheme, resolvedTheme, theme } = useTheme()
  const pathname = usePathname()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    let mounted = true

    const loadPipelineStatus = async () => {
      try {
        const response = await fetch('/api/pipeline/status', { cache: 'no-store' })
        if (!response.ok) {
          return
        }

        const json = (await response.json()) as PipelineStatus
        if (mounted) {
          setPipelineStatus({ status: json.status ?? 'idle', updatedAt: json.updatedAt })
        }
      } catch {
        if (mounted) {
          setPipelineStatus({ status: 'idle' })
        }
      }
    }

    void loadPipelineStatus()
    const timer = window.setInterval(() => {
      void loadPipelineStatus()
    }, 20000)

    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  const currentTheme = theme === 'system' ? resolvedTheme : theme
  const todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())

  const statusLabel = pipelineStatus.status === 'running'
    ? 'Running'
    : pipelineStatus.status === 'degraded'
      ? 'Degraded'
      : 'Idle'

  const statusClassName = pipelineStatus.status === 'running'
    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-300/30'
    : pipelineStatus.status === 'degraded'
      ? 'bg-amber-500/20 text-amber-100 border-amber-300/35'
      : 'bg-primary text-primary-foreground border-primary/40'

  const navLinkClass = (href: string) => {
    const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
    return `text-xs lg:text-sm uppercase tracking-[0.18em] font-semibold transition-colors no-underline decoration-2 underline-offset-10 ${
      isActive
        ? 'text-foreground underline'
        : 'text-foreground/80 hover:text-foreground hover:underline'
    }`
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="border-b border-border bg-foreground text-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-8 flex items-center justify-between text-[11px] tracking-wide">
          <span className="uppercase font-semibold text-background/80">Global Edition</span>
          <span className="hidden sm:inline text-background/70">{todayLabel}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 uppercase font-semibold ${statusClassName}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {`Live Desk ${statusLabel}`}
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18">
          <Link href="/" className="flex items-center gap-3 no-underline hover:no-underline hover:opacity-80 transition-opacity">
            <img src="/dispatch-logo.svg" alt="Dispatch" className="h-8 sm:h-10 w-auto" />
            <span className="hidden lg:inline text-[11px] uppercase tracking-[0.2em] text-muted-foreground border-l border-border pl-3 ml-1">
              Independent World Report
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            <Link
              href="/"
              className={navLinkClass('/')}
            >
              Home
            </Link>
            <Link
              href="/explore"
              className={navLinkClass('/explore')}
            >
              Explore
            </Link>
            <Link
              href="/pipeline"
              className={navLinkClass('/pipeline')}
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
            <Button variant="outline" size="sm" className="hidden sm:inline-flex uppercase tracking-wider" asChild>
              <Link href="/explore">Latest Briefing</Link>
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
              className={`block px-3 py-2 text-xs uppercase tracking-[0.16em] font-semibold rounded-md no-underline ${
                pathname === '/' ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted'
              }`}
            >
              Home
            </Link>
            <Link
              href="/explore"
              className={`block px-3 py-2 text-xs uppercase tracking-[0.16em] font-semibold rounded-md no-underline ${
                pathname.startsWith('/explore') ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted'
              }`}
            >
              Explore
            </Link>
            <Link
              href="/pipeline"
              className={`block px-3 py-2 text-xs uppercase tracking-[0.16em] font-semibold rounded-md no-underline ${
                pathname.startsWith('/pipeline') ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted'
              }`}
            >
              Pipeline
            </Link>
          </nav>
        )}
      </div>
    </header>
  )
}
