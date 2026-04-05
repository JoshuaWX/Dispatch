-- Adds extended article metadata for the upgraded DISPATCH pipeline.

alter table if exists public.dispatch_articles
  add column if not exists grade text check (grade in ('A', 'B', 'C')),
  add column if not exists grade_badge text,
  add column if not exists word_count integer,
  add column if not exists quality_score_value numeric,
  add column if not exists what_we_do_not_know text,
  add column if not exists what_happens_next text,
  add column if not exists pipeline_run_id text,
  add column if not exists fact_check_warnings jsonb not null default '[]'::jsonb;

-- Backfill numeric editorial score for older rows when available.
update public.dispatch_articles
set quality_score_value = nullif(quality_score->>'overallScore', '')::numeric
where quality_score_value is null
  and quality_score ? 'overallScore';

create index if not exists idx_dispatch_articles_pipeline_run_id
  on public.dispatch_articles (pipeline_run_id);
