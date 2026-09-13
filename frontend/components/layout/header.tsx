import Image from 'next/image'

const navigation = [
  { href: '/', label: 'Home' },
  { href: '/explore', label: 'Explore' },
  { href: '/pipeline', label: 'Method' },
]

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="/" className="inline-flex min-h-11 items-center">
          <Image src="/dispatch-logo.svg" width={177} height={40} priority alt="DISPATCH" className="h-8 w-auto sm:h-9" />
        </a>
        <nav aria-label="Primary navigation" className="hidden items-center gap-7 md:flex">
          {navigation.map((item) => (
            <a key={item.href} href={item.href}
              className="min-h-11 content-center text-sm font-semibold uppercase tracking-[0.14em] hover:text-primary">
              {item.label}
            </a>
          ))}
        </nav>
        <details className="group relative md:hidden">
          <summary aria-label="Navigation menu"
            className="inline-flex size-11 cursor-pointer list-none items-center justify-center border border-border [&::-webkit-details-marker]:hidden">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 group-open:hidden" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="hidden size-5 group-open:block" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </summary>
          <nav aria-label="Mobile navigation"
            className="absolute right-0 top-[calc(100%+0.75rem)] w-56 border border-border bg-background px-4 py-3 shadow-lg">
            {navigation.map((item) => (
              <a key={item.href} href={item.href} className="block min-h-11 content-center font-semibold">
                {item.label}
              </a>
            ))}
          </nav>
        </details>
      </div>
    </header>
  )
}
