import { InfoPageLinks } from '@/components/info-page-links'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Legal</p>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground">Terms of Service</h1>

        <div className="space-y-5 text-muted-foreground">
          <p>
            By using Dispatch, you agree to use the platform lawfully and in a way that does not
            interfere with service integrity, availability, or security.
          </p>
          <p>
            Dispatch content is provided for informational purposes. We apply automated quality and
            sourcing checks, but users remain responsible for independent verification where needed.
          </p>
          <p>
            Dispatch currently does not require signup. If authenticated features are added in the
            future, these terms will be revised to reflect any new user responsibilities.
          </p>
        </div>

        <InfoPageLinks />
      </section>
    </main>
  )
}
