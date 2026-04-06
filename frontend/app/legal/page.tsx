import Link from 'next/link'
import { InfoPageLinks } from '@/components/info-page-links'

export default function LegalPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Legal</p>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground">Legal Center</h1>
        <p className="text-lg text-muted-foreground">
          This section summarizes the legal framework for accessing Dispatch and consuming
          AI-generated newsroom content.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link href="/privacy" className="rounded-lg border border-border bg-card p-5 no-underline">
            <h2 className="text-lg font-semibold text-foreground">Privacy Policy</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              What limited usage and technical data we process while there is no signup flow.
            </p>
          </Link>
          <Link href="/terms" className="rounded-lg border border-border bg-card p-5 no-underline">
            <h2 className="text-lg font-semibold text-foreground">Terms of Service</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Usage rules, rights, and responsibilities for users and platform operators.
            </p>
          </Link>
        </div>

        <InfoPageLinks />
      </section>
    </main>
  )
}
