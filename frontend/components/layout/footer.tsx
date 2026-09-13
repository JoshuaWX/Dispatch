const links = [
  { href: '/explore', label: 'Explore' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/corrections', label: 'Corrections' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
]

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-7 px-4 py-10 sm:px-6 lg:px-8">
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-6 gap-y-3">
          {links.map((item) => <a key={item.href} href={item.href} className="min-h-11 content-center text-sm font-medium hover:text-primary">{item.label}</a>)}
        </nav>
        <div className="border-t border-border pt-6 text-sm text-muted-foreground">
          <p>DISPATCH · AI-authored reporting with evidence-linked verification.</p>
          <p className="mt-2">No public article is published without passing the stated editorial gate.</p>
        </div>
      </div>
    </footer>
  )
}
