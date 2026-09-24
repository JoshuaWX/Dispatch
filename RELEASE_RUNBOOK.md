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
   Do not rely on `NEWSAPI_KEY` or `VIRLO_API_KEY`: the free NewsAPI Developer plan is not licensed for staging or production, and metered Virlo use has not been approved. The autonomous path uses NewsData for topic discovery and NewsData plus TheNewsAPI for search until provider permissions are reviewed.
4. Keep both the database operator setting and `PIPELINE_PUBLISHING_ENABLED` false while smoke testing.
   The transactional budget authority is `public.dispatch_operator_settings.monthly_budget_usd`, not the environment variable alone. Verify it directly in each database before enabling publication. For this shared $1.00 allowance, staging is capped at $0.19 and production must be capped at no more than $0.80; keep the remaining cent for paid smoke calls and rounding.
5. Run `npm run check`, `npm run test:db`, `npm run test:e2e`, and `npm run test:lighthouse` with recorded fixtures. CI and browser tests must not contact Gemini or live news providers.

## 3. Paid Gemini smoke test

1. Confirm the paid Google project can call the exact stable `gemini-3.1-flash-lite` endpoint with structured JSON and complete usage metadata. Current paid text rates are $0.25/M input and $1.50/M output tokens, including thinking; recheck official prices before release.
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
