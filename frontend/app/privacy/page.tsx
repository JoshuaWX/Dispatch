import { InfoPageLinks } from '@/components/info-page-links'

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Legal</p>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground">Privacy Policy</h1>

        <div className="space-y-5 text-muted-foreground">
          <p>
            Dispatch currently has no signup or user account system. We do not collect profile data,
            passwords, or account records because those features are not part of the product yet.
          </p>
          <p>
            We process limited technical and operational telemetry (for example, request metadata,
            basic diagnostics, and aggregate traffic patterns) to keep the service stable,
            troubleshoot incidents, and improve newsroom reliability.
          </p>
          <p>
            We do not sell personal data. If account-based features are introduced in the future,
            this policy will be updated before those features go live.
          </p>
        </div>

        <InfoPageLinks />
      </section>
    </main>
  )
}
