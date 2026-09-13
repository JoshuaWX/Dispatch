# DISPATCH

DISPATCH is an evidence-linked, AI-authored newsroom. Its publishing pipeline is fail-closed: only verified `published` records are public, and any provider, budget, evidence, or persistence failure publishes nothing.

## Editorial pipeline

- Editorial model: only `gemini-2.5-flash` through `@google/genai`; there is no alternate-model fallback.
- Evidence gate: at least four fetched article pages across three domains, two recent sources, one high-reliability source, and independently corroborated material claims.
- Verification: a second Gemini request checks the finished article against the original evidence before the database publication transaction.
- Safety: authenticated operator and scheduler routes, idempotent runs, distributed leases, per-attempt AI budget reservations, DNS-pinned SSRF-safe retrieval, RLS, and service-role-only writes.
- Containment: publishing defaults to disabled in both environment and database settings.

## Local development

Requirements are Node.js 24, Docker, and the Supabase CLI. Copy `frontend/.env.example` to a local environment file and keep all secrets server-side.

```bash
cd frontend
npm ci
npx supabase start
npx supabase db reset --local
npm run dev
```

Do not add a real Gemini or news-provider key to automated tests. CI uses recorded/local fixtures and must make no live provider calls.

## Quality gates

```bash
cd frontend
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:e2e
npm run test:lighthouse
npm run audit
npm run build
```

Production and staging rollout steps are in [RELEASE_RUNBOOK.md](RELEASE_RUNBOOK.md). Publishing must remain paused until the paid Gemini smoke test, isolated staging migration, 48-hour soak, reviewed GitHub pull request, production backup, and deployed-SHA verification are complete.
