import Link from 'next/link'

const infoLinks = [
  { href: '/careers', label: 'Careers' },
  { href: '/legal', label: 'Legal' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
]

export function InfoPageLinks() {
  return (
    <nav aria-label="Company and legal links" className="mt-10 border-t border-border pt-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        More Information
      </p>
      <div className="flex flex-wrap gap-3">
        {infoLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-sm border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground hover:border-primary/40 no-underline"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
