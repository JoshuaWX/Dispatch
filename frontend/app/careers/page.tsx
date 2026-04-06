import { InfoPageLinks } from '@/components/info-page-links'

const roles = [
  'Founding AI Reliability Engineer',
  'Newsroom Quality and Policy Specialist',
  'Platform Engineer, Realtime Systems',
]

export default function CareersPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Company</p>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground">Careers</h1>
        <p className="text-lg text-muted-foreground">
          We are building an autonomous newsroom where reliability and editorial quality are product
          features. If that sounds like your kind of challenge, we want to hear from you.
        </p>

        <div className="mt-8 rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Open Roles</h2>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            {roles.map((role) => (
              <li key={role}>• {role}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            Send applications to careers@dispatch.news with role in the subject line.
          </p>
        </div>

        <InfoPageLinks />
      </section>
    </main>
  )
}
