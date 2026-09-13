-- DISPATCH hardening: fail-closed persistence, editorial evidence, budget, and scheduling.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.dispatch_articles (
  id text primary key,
  topic text not null,
  headline text not null,
  subheadline text not null,
  lede text not null,
  body text not null,
  image_url text,
  image_credit text,
  category text not null,
  tags jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  reading_time integer not null default 1,
  published_at timestamptz not null default now(),
  quality_score jsonb not null default '{}'::jsonb,
  verification_status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.dispatch_articles drop constraint if exists dispatch_articles_verification_status_check;
alter table public.dispatch_articles drop constraint if exists dispatch_articles_category_check;
alter table public.dispatch_articles drop constraint if exists dispatch_articles_grade_check;
alter table public.dispatch_articles drop constraint if exists dispatch_articles_publication_status_check;
alter table public.dispatch_articles drop constraint if exists dispatch_articles_format_check;
alter table public.dispatch_articles drop constraint if exists dispatch_articles_view_count_check;
alter table public.dispatch_articles
  add column if not exists publication_status text not null default 'draft',
  add column if not exists rejection_reason text,
  add column if not exists grade text,
  add column if not exists grade_badge text,
  add column if not exists word_count integer,
  add column if not exists quality_score_value numeric,
  add column if not exists what_we_do_not_know text,
  add column if not exists what_happens_next text,
  add column if not exists pipeline_run_id text,
  add column if not exists fact_check_warnings jsonb not null default '[]'::jsonb,
  add column if not exists article_format text,
  add column if not exists trend_score numeric not null default 0,
  add column if not exists view_count bigint not null default 0,
  add column if not exists topic_fingerprint text,
  add column if not exists publication_day date,
  add column if not exists search_document tsvector generated always as (
    to_tsvector('english', coalesce(headline, '') || ' ' || coalesce(subheadline, '') || ' ' || coalesce(lede, '') || ' ' || coalesce(topic, ''))
  ) stored,
  add column if not exists updated_at timestamptz not null default now();

-- Existing records cannot prove the new evidence contract. Preserve every byte and ID,
-- but make the complete legacy corpus private pending explicit re-evaluation.
update public.dispatch_articles
set publication_status = 'quarantined',
    verification_status = 'failed',
    rejection_reason = 'legacy_record_requires_reverification',
    updated_at = now();

alter table public.dispatch_articles
  add constraint dispatch_articles_category_check check (category in ('World', 'Tech', 'Business', 'Science')),
  add constraint dispatch_articles_publication_status_check check (publication_status in ('draft', 'published', 'quarantined', 'retracted')),
  add constraint dispatch_articles_verification_status_check check (verification_status in ('pending', 'passed', 'failed')),
  add constraint dispatch_articles_grade_check check (grade is null or grade in ('A', 'B', 'C')),
  add constraint dispatch_articles_format_check check (article_format is null or article_format in ('brief', 'article')),
  add constraint dispatch_articles_view_count_check check (view_count >= 0);

create table if not exists public.dispatch_operator_settings (
  id boolean primary key default true check (id),
  publishing_enabled boolean not null default false,
  monthly_budget_usd numeric(10,6) not null default 1.00 check (monthly_budget_usd > 0 and monthly_budget_usd <= 1.00),
  budget_warning_usd numeric(10,6) not null default 0.80 check (budget_warning_usd >= 0 and budget_warning_usd <= 0.80),
  updated_at timestamptz not null default now()
);
insert into public.dispatch_operator_settings (id, publishing_enabled)
values (true, false) on conflict (id) do nothing;

create table if not exists public.dispatch_pipeline_runs (
  id uuid primary key,
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 240),
  trigger text not null check (trigger in ('scheduled', 'manual')),
  requested_topic text,
  topic text,
  topic_fingerprint text,
  status text not null default 'running' check (status in ('running', 'published', 'rejected', 'skipped', 'failed')),
  result jsonb,
  rejection_reason text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  request_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.dispatch_pipeline_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.dispatch_pipeline_runs(id) on delete cascade,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dispatch_pipeline_leases (
  name text primary key,
  owner_run_id uuid not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.dispatch_ai_reservations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.dispatch_pipeline_runs(id) on delete cascade,
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  day_key date not null,
  reserved_usd numeric(10,6) not null check (reserved_usd > 0),
  actual_usd numeric(10,6),
  status text not null default 'reserved' check (status in ('reserved', 'settled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create table if not exists public.dispatch_ai_usage (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.dispatch_ai_reservations(id) on delete cascade,
  run_id uuid not null references public.dispatch_pipeline_runs(id) on delete cascade,
  model text not null check (model = 'gemini-2.5-flash'),
  input_tokens bigint not null check (input_tokens >= 0),
  output_tokens bigint not null check (output_tokens >= 0),
  cost_usd numeric(10,6) not null check (cost_usd >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.dispatch_rate_limits (
  bucket_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null,
  primary key (bucket_key, window_started_at)
);

create table if not exists public.dispatch_article_sources (
  article_id text not null references public.dispatch_articles(id) on delete cascade,
  source_id text not null,
  publisher_name text not null,
  source_url text not null check (source_url ~ '^https://'),
  source_domain text not null,
  reliability text not null check (reliability in ('high', 'medium', 'low')),
  excerpt text not null check (length(excerpt) between 1 and 2000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (article_id, source_id)
);

create table if not exists public.dispatch_material_claims (
  article_id text not null references public.dispatch_articles(id) on delete cascade,
  claim_id text not null,
  claim_text text not null,
  created_at timestamptz not null default now(),
  primary key (article_id, claim_id)
);

create table if not exists public.dispatch_claim_sources (
  article_id text not null,
  claim_id text not null,
  source_id text not null,
  created_at timestamptz not null default now(),
  primary key (article_id, claim_id, source_id),
  foreign key (article_id, claim_id) references public.dispatch_material_claims(article_id, claim_id) on delete cascade,
  foreign key (article_id, source_id) references public.dispatch_article_sources(article_id, source_id) on delete cascade
);

create table if not exists public.dispatch_virlo_daily_cache (
  day_key text primary key,
  topics jsonb not null default '[]'::jsonb,
  fetched_at timestamptz,
  attempted_at timestamptz,
  success boolean not null default false,
  error text,
  refresh_owner uuid,
  refresh_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.dispatch_virlo_daily_cache
  add column if not exists refresh_owner uuid,
  add column if not exists refresh_expires_at timestamptz;

create index if not exists dispatch_articles_public_recent_idx
  on public.dispatch_articles (published_at desc, id desc)
  where publication_status = 'published' and verification_status = 'passed';
create index if not exists dispatch_articles_public_category_idx
  on public.dispatch_articles (category, published_at desc, id desc)
  where publication_status = 'published' and verification_status = 'passed';
create index if not exists dispatch_articles_trending_idx
  on public.dispatch_articles (trend_score desc, published_at desc, id desc)
  where publication_status = 'published' and verification_status = 'passed';
create unique index if not exists dispatch_articles_topic_per_day_uidx
  on public.dispatch_articles (publication_day, topic_fingerprint)
  where publication_day is not null and topic_fingerprint is not null;
create index if not exists dispatch_articles_search_idx on public.dispatch_articles using gin (search_document);
create index if not exists dispatch_pipeline_events_run_idx on public.dispatch_pipeline_events(run_id, created_at);
create index if not exists dispatch_ai_reservations_month_idx on public.dispatch_ai_reservations(month_key, status);
create index if not exists dispatch_ai_reservations_day_idx on public.dispatch_ai_reservations(day_key, status);
create index if not exists dispatch_ai_reservations_run_idx on public.dispatch_ai_reservations(run_id);
create index if not exists dispatch_ai_usage_run_idx on public.dispatch_ai_usage(run_id);
create index if not exists dispatch_rate_limits_expiry_idx on public.dispatch_rate_limits(expires_at);
create index if not exists dispatch_claim_sources_source_fk_idx on public.dispatch_claim_sources(article_id, source_id);

create or replace view public.dispatch_public_articles
with (security_invoker = true)
as
select
  article.*,
  round((
    article.trend_score
    +
    greatest(0, 1 - extract(epoch from (now() - article.published_at)) / 259200) * 30
    + ln(article.view_count + 1) * 2
  )::numeric, 6) as calculated_trending_score,
  (select count(*)::integer from public.dispatch_article_sources evidence where evidence.article_id = article.id) as source_count
from public.dispatch_articles article
where article.publication_status = 'published' and article.verification_status = 'passed';

create or replace function public.dispatch_public_article_facets(p_query text)
returns table(category text, article_count bigint)
language sql stable security definer set search_path = ''
as $$
  select article.category, count(*)
  from public.dispatch_articles article
  where article.publication_status = 'published'
    and article.verification_status = 'passed'
    and (nullif(btrim(p_query), '') is null
      or article.search_document @@ websearch_to_tsquery('english', p_query))
  group by article.category;
$$;

create or replace function public.dispatch_claim_pipeline_run(
  p_run_id uuid,
  p_trigger text,
  p_topic text,
  p_idempotency_key text,
  p_request_id text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  existing public.dispatch_pipeline_runs%rowtype;
  acquired_lease boolean := false;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dispatch-pipeline'));
  select * into existing from public.dispatch_pipeline_runs where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'acquired', false,
      'runId', existing.id,
      'existingResult', existing.result
    );
  end if;

  insert into public.dispatch_pipeline_leases(name, owner_run_id, acquired_at, expires_at)
  values ('editorial', p_run_id, now(), now() + interval '2 minutes')
  on conflict (name) do update
    set owner_run_id = excluded.owner_run_id,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
    where public.dispatch_pipeline_leases.expires_at <= now()
  returning true into acquired_lease;

  insert into public.dispatch_pipeline_runs(
    id, idempotency_key, trigger, requested_topic, status, result, rejection_reason, request_id
  )
  values (
    p_run_id, p_idempotency_key, p_trigger, nullif(btrim(p_topic), ''),
    case when acquired_lease then 'running' else 'skipped' end,
    case when acquired_lease then null else jsonb_build_object('status', 'skipped', 'runId', p_run_id, 'reason', 'concurrent_run') end,
    case when acquired_lease then null else 'concurrent_run' end,
    p_request_id
  );

  return jsonb_build_object(
    'acquired', acquired_lease,
    'runId', p_run_id,
    'existingResult', case when acquired_lease then null else jsonb_build_object('status', 'skipped', 'runId', p_run_id, 'reason', 'concurrent_run') end
  );
end;
$$;

create or replace function public.dispatch_finish_pipeline_run(p_run_id uuid, p_result jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.dispatch_pipeline_runs
  set status = coalesce(p_result->>'status', 'failed'),
      topic = p_result->>'topic',
      result = p_result,
      rejection_reason = p_result->>'reason',
      finished_at = now()
  where id = p_run_id;

  insert into public.dispatch_pipeline_events(run_id, event_type, details)
  values (p_run_id, coalesce(p_result->>'status', 'failed'), p_result);

  delete from public.dispatch_pipeline_leases where name = 'editorial' and owner_run_id = p_run_id;
end;
$$;

create or replace function public.dispatch_reserve_ai_budget(
  p_run_id uuid,
  p_amount_usd numeric,
  p_month_key text,
  p_day_key date
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  reservation_id uuid;
  month_total numeric;
  day_total numeric;
  month_cap numeric;
  remaining_month numeric;
  remaining_days integer;
  daily_allowance numeric;
begin
  if p_amount_usd <= 0 then raise exception 'invalid reservation'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dispatch-budget-' || p_month_key));

  select monthly_budget_usd into month_cap from public.dispatch_operator_settings where id = true;
  if month_cap is null then raise exception 'budget settings unavailable'; end if;

  select coalesce(sum(case when status = 'settled' then actual_usd else reserved_usd end), 0)
  into month_total from public.dispatch_ai_reservations where month_key = p_month_key;
  select coalesce(sum(case when status = 'settled' then actual_usd else reserved_usd end), 0)
  into day_total from public.dispatch_ai_reservations where day_key = p_day_key;

  remaining_month := greatest(0, month_cap - month_total);
  remaining_days := greatest(1, (date_trunc('month', p_day_key) + interval '1 month')::date - p_day_key);
  daily_allowance := least(0.04, remaining_month / remaining_days);

  if month_total + p_amount_usd > month_cap or day_total + p_amount_usd > daily_allowance then
    return jsonb_build_object('reserved', false);
  end if;

  insert into public.dispatch_ai_reservations(run_id, month_key, day_key, reserved_usd)
  values (p_run_id, p_month_key, p_day_key, p_amount_usd)
  returning id into reservation_id;
  return jsonb_build_object('reserved', true, 'reservationId', reservation_id);
end;
$$;

create or replace function public.dispatch_settle_ai_budget(
  p_reservation_id uuid,
  p_actual_usd numeric,
  p_input_tokens bigint,
  p_output_tokens bigint
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  reservation public.dispatch_ai_reservations%rowtype;
begin
  select * into reservation from public.dispatch_ai_reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation not found'; end if;
  if reservation.status = 'settled' then return; end if;
  if p_actual_usd < 0 or p_actual_usd > reservation.reserved_usd then raise exception 'actual cost exceeds reservation'; end if;

  update public.dispatch_ai_reservations
  set actual_usd = p_actual_usd, status = 'settled', settled_at = now()
  where id = p_reservation_id;
  insert into public.dispatch_ai_usage(reservation_id, run_id, model, input_tokens, output_tokens, cost_usd)
  values (p_reservation_id, reservation.run_id, 'gemini-2.5-flash', p_input_tokens, p_output_tokens, p_actual_usd);
end;
$$;

create or replace function public.dispatch_publish_article(
  p_article jsonb,
  p_idempotency_key text,
  p_topic_fingerprint text,
  p_day_key date,
  p_result jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_article_id text := p_article->>'id';
  v_run_id uuid := (p_article->>'pipelineRunId')::uuid;
  source jsonb;
  claim jsonb;
  source_id text;
  source_count integer;
  claim_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dispatch-publish-' || p_day_key::text));
  if p_result->>'status' <> 'published' or p_result->>'runId' <> v_run_id::text then
    raise exception 'publication result does not match article run';
  end if;
  if p_article->>'publicationStatus' <> 'published'
    or p_article->>'verificationStatus' <> 'passed'
    or p_article->>'grade' <> 'A'
    or coalesce((p_article->'qualityScore'->>'overallScore')::numeric, 0) < 7
    or coalesce((p_article->'qualityScore'->>'factualConfidence')::numeric, 0) < 8
    or coalesce((p_article->'qualityScore'->>'sourceDiversity')::numeric, 0) < 7
    or jsonb_array_length(coalesce(p_article->'factCheckWarnings', '[]'::jsonb)) > 0 then
    raise exception 'article did not pass publication state gates';
  end if;
  source_count := jsonb_array_length(coalesce(p_article->'sources', '[]'::jsonb));
  claim_count := jsonb_array_length(coalesce(p_article->'claims', '[]'::jsonb));
  if source_count < 4 or claim_count < 3 then raise exception 'article evidence is incomplete'; end if;
  if (select count(*) from public.dispatch_articles
      where publication_status = 'published' and verification_status = 'passed' and publication_day = p_day_key) >= 4 then
    raise exception 'daily publication limit reached';
  end if;

  insert into public.dispatch_articles(
    id, topic, headline, subheadline, lede, body, category, tags, sources,
    reading_time, published_at, quality_score, verification_status, publication_status,
    grade, word_count, quality_score_value, what_we_do_not_know, what_happens_next,
    pipeline_run_id, fact_check_warnings, article_format, trend_score, view_count,
    topic_fingerprint, publication_day
  ) values (
    v_article_id, p_article->>'topic', p_article->>'headline', p_article->>'subheadline',
    p_article->>'lede', p_article->>'body', p_article->>'category', p_article->'tags', p_article->'sources',
    (p_article->>'readingTime')::integer, (p_article->>'publishedAt')::timestamptz,
    p_article->'qualityScore', 'passed', 'published', 'A', (p_article->>'wordCount')::integer,
    (p_article->'qualityScore'->>'overallScore')::numeric, p_article->>'whatWeDoNotKnow',
    p_article->>'whatHappensNext', p_article->>'pipelineRunId', coalesce(p_article->'factCheckWarnings', '[]'::jsonb),
    p_article->>'format', coalesce((p_article->>'trendScore')::numeric, 0), 0,
    p_topic_fingerprint, p_day_key
  );

  for source in select value from jsonb_array_elements(p_article->'sources') loop
    insert into public.dispatch_article_sources(
      article_id, source_id, publisher_name, source_url, source_domain,
      reliability, excerpt, content_hash, published_at
    ) values (
      v_article_id, source->>'id', source->>'name', source->>'url',
      lower(source->>'domain'),
      source->>'reliability', source->>'excerpt', source->>'contentHash', (source->>'publishedAt')::timestamptz
    );
  end loop;

  for claim in select value from jsonb_array_elements(p_article->'claims') loop
    insert into public.dispatch_material_claims(article_id, claim_id, claim_text)
    values (v_article_id, claim->>'id', claim->>'text');
    for source_id in select jsonb_array_elements_text(claim->'sourceIds') loop
      insert into public.dispatch_claim_sources(article_id, claim_id, source_id)
      values (v_article_id, claim->>'id', source_id);
    end loop;
  end loop;

  if (select count(distinct evidence.source_domain)
      from public.dispatch_article_sources evidence
      where evidence.article_id = v_article_id) < 3
    or (select count(*)
        from public.dispatch_article_sources evidence
        where evidence.article_id = v_article_id
          and evidence.published_at >= now() - interval '72 hours') < 2
    or not exists (
      select 1
      from public.dispatch_article_sources evidence
      where evidence.article_id = v_article_id and evidence.reliability = 'high'
    ) then
    raise exception 'article source diversity gates failed';
  end if;
  if not exists (
    select 1
    from public.dispatch_claim_sources mapping
    join public.dispatch_article_sources evidence
      on evidence.article_id = mapping.article_id and evidence.source_id = mapping.source_id
    where mapping.article_id = v_article_id
    group by mapping.claim_id
    having count(distinct evidence.source_domain) >= 2
  ) then
    raise exception 'article lacks independent corroboration';
  end if;

  update public.dispatch_pipeline_runs
  set status = 'published',
      topic = p_result->>'topic',
      topic_fingerprint = p_topic_fingerprint,
      result = jsonb_set(p_result, '{articleId}', to_jsonb(v_article_id), true),
      rejection_reason = null,
      finished_at = now()
  where id = v_run_id and idempotency_key = p_idempotency_key and status = 'running';
  if not found then raise exception 'pipeline run does not match publication'; end if;

  insert into public.dispatch_pipeline_events(run_id, event_type, details)
  values (v_run_id, 'published', jsonb_set(p_result, '{articleId}', to_jsonb(v_article_id), true));
  delete from public.dispatch_pipeline_leases where name = 'editorial' and owner_run_id = v_run_id;

  return jsonb_build_object('articleId', v_article_id);
end;
$$;

create or replace function public.dispatch_increment_article_view(p_article_id text, p_client_key text)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  article_window timestamptz := to_timestamp(floor(extract(epoch from now()) / 21600) * 21600);
  global_window timestamptz := date_trunc('hour', now());
  current_count integer;
  next_views bigint;
begin
  if p_client_key !~ '^[0-9a-f]{64}$' then raise exception 'invalid client key'; end if;
  delete from public.dispatch_rate_limits where expires_at < now();

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dispatch-view-client-' || p_client_key));
  insert into public.dispatch_rate_limits(bucket_key, window_started_at, request_count, expires_at)
  values ('view:client:' || p_client_key, global_window, 1, global_window + interval '2 hours')
  on conflict (bucket_key, window_started_at) do update
    set request_count = public.dispatch_rate_limits.request_count + 1
  returning request_count into current_count;
  if current_count > 60 then raise exception 'rate limit exceeded'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dispatch-view-article-' || p_article_id || '-' || p_client_key));
  insert into public.dispatch_rate_limits(bucket_key, window_started_at, request_count, expires_at)
  values ('view:article:' || p_article_id || ':' || p_client_key, article_window, 1, article_window + interval '12 hours')
  on conflict (bucket_key, window_started_at) do update
    set request_count = public.dispatch_rate_limits.request_count + 1
  returning request_count into current_count;
  if current_count > 1 then
    select article.view_count into next_views
    from public.dispatch_articles article
    where article.id = p_article_id
      and article.publication_status = 'published'
      and article.verification_status = 'passed';
    if not found then raise exception 'article not found'; end if;
    return next_views;
  end if;

  update public.dispatch_articles set view_count = view_count + 1, updated_at = now()
  where id = p_article_id and publication_status = 'published' and verification_status = 'passed'
  returning view_count into next_views;
  if not found then raise exception 'article not found'; end if;
  return next_views;
end;
$$;

create or replace function public.dispatch_take_rate_limit(
  p_bucket_key text, p_limit integer, p_window_seconds integer
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  window_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  current_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dispatch-rate-' || p_bucket_key));
  insert into public.dispatch_rate_limits(bucket_key, window_started_at, request_count, expires_at)
  values (p_bucket_key, window_start, 1, window_start + make_interval(secs => p_window_seconds * 2))
  on conflict (bucket_key, window_started_at) do update
    set request_count = public.dispatch_rate_limits.request_count + 1
  returning request_count into current_count;
  return current_count <= p_limit;
end;
$$;

create or replace function public.dispatch_claim_virlo_refresh(p_day_key text, p_owner uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  cache public.dispatch_virlo_daily_cache%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dispatch-virlo-' || p_day_key));
  select * into cache from public.dispatch_virlo_daily_cache where day_key = p_day_key for update;
  if found and cache.success and jsonb_array_length(cache.topics) > 0 then
    return jsonb_build_object('acquired', false, 'cached', true, 'topics', cache.topics, 'fetchedAt', cache.fetched_at);
  end if;
  if found and cache.refresh_expires_at > now() and cache.refresh_owner is distinct from p_owner then
    return jsonb_build_object('acquired', false, 'cached', false, 'topics', cache.topics);
  end if;

  insert into public.dispatch_virlo_daily_cache(
    day_key, topics, fetched_at, attempted_at, success, refresh_owner, refresh_expires_at, updated_at
  ) values (p_day_key, '[]'::jsonb, now(), now(), false, p_owner, now() + interval '30 seconds', now())
  on conflict (day_key) do update set
    attempted_at = now(), refresh_owner = p_owner, refresh_expires_at = now() + interval '30 seconds', updated_at = now();
  return jsonb_build_object('acquired', true, 'cached', false, 'topics', coalesce(cache.topics, '[]'::jsonb));
end;
$$;

create or replace function public.dispatch_finish_virlo_refresh(
  p_day_key text, p_owner uuid, p_topics jsonb, p_success boolean, p_error text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.dispatch_virlo_daily_cache set
    topics = case when p_success then p_topics else topics end,
    fetched_at = now(), attempted_at = now(), success = p_success,
    error = left(p_error, 500), refresh_owner = null, refresh_expires_at = null, updated_at = now()
  where day_key = p_day_key and refresh_owner = p_owner;
  if not found then raise exception 'Virlo refresh lease was lost'; end if;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'dispatch_articles', 'dispatch_operator_settings', 'dispatch_pipeline_runs',
    'dispatch_pipeline_events', 'dispatch_pipeline_leases', 'dispatch_ai_reservations',
    'dispatch_ai_usage', 'dispatch_rate_limits', 'dispatch_article_sources',
    'dispatch_material_claims', 'dispatch_claim_sources', 'dispatch_virlo_daily_cache'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end $$;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
revoke all on table public.dispatch_public_articles from public, anon, authenticated;
grant select on table public.dispatch_public_articles to service_role;

revoke all on function public.dispatch_claim_pipeline_run(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.dispatch_finish_pipeline_run(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.dispatch_reserve_ai_budget(uuid, numeric, text, date) from public, anon, authenticated;
revoke all on function public.dispatch_settle_ai_budget(uuid, numeric, bigint, bigint) from public, anon, authenticated;
revoke all on function public.dispatch_publish_article(jsonb, text, text, date, jsonb) from public, anon, authenticated;
revoke all on function public.dispatch_increment_article_view(text, text) from public, anon, authenticated;
revoke all on function public.dispatch_take_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.dispatch_claim_virlo_refresh(text, uuid) from public, anon, authenticated;
revoke all on function public.dispatch_finish_virlo_refresh(text, uuid, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public.dispatch_public_article_facets(text) from public, anon, authenticated;
grant execute on function public.dispatch_claim_pipeline_run(uuid, text, text, text, text) to service_role;
grant execute on function public.dispatch_finish_pipeline_run(uuid, jsonb) to service_role;
grant execute on function public.dispatch_reserve_ai_budget(uuid, numeric, text, date) to service_role;
grant execute on function public.dispatch_settle_ai_budget(uuid, numeric, bigint, bigint) to service_role;
grant execute on function public.dispatch_publish_article(jsonb, text, text, date, jsonb) to service_role;
grant execute on function public.dispatch_increment_article_view(text, text) to service_role;
grant execute on function public.dispatch_take_rate_limit(text, integer, integer) to service_role;
grant execute on function public.dispatch_claim_virlo_refresh(text, uuid) to service_role;
grant execute on function public.dispatch_finish_virlo_refresh(text, uuid, jsonb, boolean, text) to service_role;
grant execute on function public.dispatch_public_article_facets(text) to service_role;

-- The job reads its destination and scheduler bearer token from Vault at execution time.
-- Provision named secrets dispatch_app_url and dispatch_scheduler_secret before enabling publishing.
select cron.unschedule(jobid) from cron.job where jobname = 'dispatch-generate-every-two-hours';
select cron.schedule(
  'dispatch-generate-every-two-hours',
  '17 */2 * * *',
  $cron$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'dispatch_app_url' limit 1), '/') || '/api/cron/generate',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'dispatch_scheduler_secret' limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 90000
    );
  $cron$
);
