# DISPATCH hardening release runbook

The application is deliberately fail-closed. Production publishing stays disabled until every staging and release condition below is recorded as complete.

## 1. Containment

1. Set `PIPELINE_PUBLISHING_ENABLED=false` in Production and any configured Preview environment.
2. Rotate the old scheduler/provider credentials and remove Groq, OpenRouter, and Anthropic variables.
3. Back up the production Supabase database and record the backup identifier outside this repository.
4. Confirm `/api/generate`, `/api/research`, and `/api/qa` return `404`; Cron and operator routes must return `401` without their distinct bearer tokens.

## 2. Staging provisioning

1. Confirm the cost and create an isolated Supabase staging project; apply every committed migration in order to an empty database. Do not copy production article data or credentials.
2. Store `dispatch_app_url`, `dispatch_scheduler_secret`, and (for a protected Vercel Preview) `dispatch_vercel_bypass_secret` in staging Supabase Vault. The Cron request must send the bypass value as `x-vercel-protection-bypass`; do not disable Preview protection. Never place secret values in SQL or source control.
3. Configure branch-scoped Preview server-only variables listed in `frontend/.env.example`, using distinct staging Supabase and scheduler credentials. `GEMINI_MODEL` must equal `gemini-3.1-flash-lite`.
   The autonomous path now reads the GOV.UK and ECDC first-party feeds, fetches only page-level rights-cleared evidence, and stores licence, attribution, organisation, and upstream origin. NewsAPI, Virlo, NewsData, and TheNewsAPI are not part of autonomous discovery or evidence retrieval. Keep their approval flags disabled and do not treat API keys as a licence.
   A verified official announcement may use one authoritative primary source; a developing story needs two independently originating source organisations and one claim corroborated by both. A second page repeating the same upstream release or measurement is not independent. GOV.UK OGL v3.0 and ECDC CC BY 4.0 are the only currently enabled rights paths; NIH, NASA, and USGS remain disabled pending their page-level checks. See `SOURCE_RIGHTS_FIRST_PARTY_FEEDS.md`.
4. Keep both the database operator setting and `PIPELINE_PUBLISHING_ENABLED` false while smoke testing.
   The transactional budget authority is `public.dispatch_operator_settings.monthly_budget_usd`, not the environment variable alone. Verify it directly in each database before enabling publication. For this shared $1.00 allowance, staging is capped at $0.19 and production must be capped at no more than $0.80; keep the remaining cent for paid smoke calls and rounding.
5. Run `npm run check`, `npm run test:db`, `npm run test:e2e`, and `npm run test:lighthouse` with recorded fixtures. CI and browser tests must not contact Gemini or live news providers.

## 3. Paid Gemini smoke test

1. Confirm the paid Google project can call the exact `gemini-3.1-flash-lite` endpoint with structured JSON and complete usage metadata. Current paid text rates are $0.25/M input and $1.50/M output tokens, including thinking; recheck official prices before release.
   A synthetic model-only smoke may run before an end-to-end test if its maximum cost fits the shared budget margin and it sends no publisher content. Run the end-to-end staging smoke only with a current rights-cleared first-party page; do not fabricate a source to claim editorial readiness.
   On 2026-09-24, a **local-key-only** synthetic smoke passed: 13 input tokens, 235 output tokens including thinking, structured JSON and complete usage metadata. At the paid rates above its estimated charge is $0.000356. The billing tier, branch-scoped Vercel Preview key, and staging publication remain unverified; conservatively count this amount in the shared monthly budget.
2. Perform a staging manual run with a unique `Idempotency-Key` and review its evidence, claim mappings, usage metadata, and rejection/publication result. Safe source-gate rejections spend no Gemini budget; investigate repeated rejections before the soak.
3. If access, structured output, usage metadata, or the pricing review date fails, leave publishing paused. Do not configure another model.

## 4. Soak and production release

1. Enable staging publication and observe 24 scheduled two-hour windows (48 hours). A paused production scheduler does not count as a staging soak.
2. Require one claimed run per window, no overlapping leases, no duplicate topics, no budget overrun, no private record in public APIs, and no secret-bearing logs.
3. Review the draft GitHub pull request from `codex/dispatch-production-rollout`; require all protected-branch checks before marking it ready to merge.
4. Back up production again, pause Supabase Cron, and record `select count(*) from public.dispatch_articles` before applying the new model migration. The earlier containment release already quarantined all 124 legacy records; require the same count, zero rows from `public.dispatch_public_articles`, and no loss of the existing audit data afterward.
5. Deploy the reviewed commit, verify the deployed SHA, and run public/operator/Cron smoke tests while publishing remains disabled.
6. Resume Cron, set the operator control to resume, then set `PIPELINE_PUBLISHING_ENABLED=true`.
7. Before enabling production, recheck the staging and production database budget caps and actual usage together, including paid smoke calls outside the databases. Reduce the production cap further if necessary so combined Dispatch AI usage cannot exceed `$1.00`. Observe production for 24 hours; alert at `$0.80` combined usage. Each environment must still fail closed on its own transactional cap.

## 5. Rollback

Set `PIPELINE_PUBLISHING_ENABLED=false` first, pause Cron, and redeploy the safe containment release. Do not reverse the quarantine migration or delete audit records. Restore the database backup only for confirmed migration corruption, under a separate reviewed change record.

## 6. Staging verification log

- 2026-09-24: Protected Preview deployment `dpl_247BtYZQUw8kGyj2h3G75HSFim2m` returned `paused` from `GET /api/pipeline/status`, with no successful run. Its Git SHA matched draft PR #7 (`5273ba5817d67dc8bf356bd4f00d7980401d4566`). This verifies routing and the pause state, not paid-key access or editorial readiness.
- 2026-09-24: Unauthenticated `POST /api/ops/pipeline/run` and `POST /api/cron/generate` each returned application `401` responses with request IDs. Staging database counts before and after remained 12 pipeline runs, 0 articles, and 0 AI reservations; the database publishing setting remained false.
- 2026-09-24: The 12 staging runs comprised 9 `missing_high_reliability_source` rejections, 2 `insufficient_sources` rejections, and 1 `publishing_paused` skip. This does not justify enabling autonomous publication. Staging's transactional AI cap remained `$0.19`.
- 2026-09-24: The Vercel CLI exposed the project's automation-bypass credential in diagnostic output during the protected-route test. The affected credential was immediately revoked/regenerated through Vercel's project API; rotation was verified without printing the replacement. **Before any staging Cron is installed, replace the now-stale `dispatch_vercel_bypass_secret` in staging Supabase Vault** and verify it matches the current project credential through a secret-safe channel. At verification time staging had zero Cron jobs. Do not reuse the verbose CLI diagnostic path for protected requests.
- NewsAPI and Virlo remain disabled: the user confirmed free/unsure NewsAPI status and unapproved Virlo metered use. This does not clear NewsData, TheNewsAPI, or publisher evidence rights. Publishing and the 48-hour soak remain gated on a rights-cleared, coverage-proven source strategy.
- The 2026-09-24 first-party sample in `SOURCE_RIGHTS_CURRENT_PACK.md` did not verify a four-page, three-independent-publisher, current same-topic evidence pack. NASA and NSIDC reported a joint Arctic sea-ice determination, so separate domains did not establish independent corroboration. Do not start Gemini publication smoke or the soak from this sample.
- 2026-09-24: The new first-party policy supersedes that four-page gate. A live GOV.UK feed/page/Content API retrieval passed the local rights-check smoke without Gemini; 89 local tests, lint, typecheck, build, and production dependency audit passed. The isolated staging migration and 40 pgTAP assertions passed; the test transaction left no public article.
- 2026-09-24: Staging Preview's `SUPABASE_SERVICE_ROLE_KEY` is Vercel-sensitive and cannot be read back by `vercel env pull`. A secret-safe direct Vault transfer was attempted but rejected as an invalid key; no Vault secret changed. The temporary service-role rotation RPC was dropped and confirmed absent. Supabase CLI is authenticated to a different account, and computer-use browser initialization failed. Staging Cron remains uninstalled and the 48-hour soak has not started. Reconnect an account with staging project access in the Supabase CLI or update the Vault bypass value through the authenticated dashboard; do not place the bypass value in SQL.
- Production retained all 124 quarantined legacy articles, exposed 0 public articles, had 0 AI reservations, and remained publishing-disabled with a `$0.80` transactional cap. Its dispatch Cron was active at `17 */2 * * *`, but 125 recorded runs were safely skipped as `publishing_paused`. Two runs from 2026-09-14 were still recorded as `running` with no active lease; reconcile these audit rows and ensure `/api/pipeline/status` derives active state from an unexpired lease before production enablement.
