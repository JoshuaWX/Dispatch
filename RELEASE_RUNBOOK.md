# DISPATCH hardening release runbook

The application is deliberately fail-closed. Production publishing stays disabled until every staging and release condition below is recorded as complete.

## 1. Containment

1. Set `PIPELINE_PUBLISHING_ENABLED=false` in Production and Preview environments.
2. Rotate the old scheduler/provider credentials and remove Groq, OpenRouter, and Anthropic variables.
3. Back up the production Supabase database and record the backup identifier outside this repository.
4. Confirm `/api/generate`, `/api/research`, and `/api/qa` return `404`; Cron and operator routes must return `401` without their distinct bearer tokens.

## 2. Staging provisioning

1. Create an isolated Supabase staging project and apply `supabase/migrations/20260912234028_dispatch_hardening_schema.sql`.
2. Store `dispatch_app_url` and `dispatch_scheduler_secret` in Supabase Vault. Never place their values in SQL or source control.
3. Configure the server-only variables listed in `frontend/.env.example`. `GEMINI_MODEL` must equal `gemini-2.5-flash`.
4. Keep both the database operator setting and `PIPELINE_PUBLISHING_ENABLED` false while smoke testing.
5. Run `npm run check`, `npm run test:db`, `npm run test:e2e`, and `npm run test:lighthouse` with recorded fixtures. CI and browser tests must not contact Gemini or live news providers.

## 3. Paid Gemini smoke test

1. Confirm the paid Google project can call the exact stable `gemini-2.5-flash` endpoint.
2. Perform one staging manual run with a unique `Idempotency-Key` and review its evidence, claim mappings, usage metadata, and rejection/publication result.
3. If access, structured output, usage metadata, or the pricing review date fails, leave publishing paused. Do not configure another model.

## 4. Soak and production release

1. Enable staging publication and observe twelve scheduled two-hour windows (48 hours).
2. Require one claimed run per window, no overlapping leases, no duplicate topics, no budget overrun, no private record in public APIs, and no secret-bearing logs.
3. Open and review the GitHub pull request from `codex/dispatch-hardening`; require all branch checks.
4. Back up production again, pause Supabase Cron, and record `select count(*) from public.dispatch_articles` before applying the migration. After migration, require the same count, require zero rows from `public.dispatch_public_articles`, and require every pre-migration ID to have `publication_status = 'quarantined'`, `verification_status = 'failed'`, and `rejection_reason = 'legacy_record_requires_reverification'`.
5. Deploy the reviewed commit, verify the deployed SHA, and run public/operator/Cron smoke tests while publishing remains disabled.
6. Resume Cron, set the operator control to resume, then set `PIPELINE_PUBLISHING_ENABLED=true`.
7. Observe for 24 hours. Alert at `$0.80`; the transactional hard cap is `$1.00` per UTC month.

## 5. Rollback

Set `PIPELINE_PUBLISHING_ENABLED=false` first, pause Cron, and redeploy the safe containment release. Do not reverse the quarantine migration or delete audit records. Restore the database backup only for confirmed migration corruption, under a separate reviewed change record.
