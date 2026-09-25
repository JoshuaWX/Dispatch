-- Rights-cleared first-party evidence and two distinct editorial story kinds.
-- Existing quarantined articles and source rows remain intact for audit.
alter table public.dispatch_articles
  add column if not exists story_kind text;
alter table public.dispatch_articles
  add constraint dispatch_articles_story_kind_check
  check (story_kind is null or story_kind in ('official_announcement', 'developing'));

alter table public.dispatch_article_sources
  add column if not exists organisation_id text,
  add column if not exists upstream_origin_id text,
  add column if not exists is_primary boolean,
  add column if not exists licence_id text,
  add column if not exists licence_url text,
  add column if not exists licence_evidence text,
  add column if not exists attribution text,
  add column if not exists discovery_url text,
  add column if not exists retrieved_at timestamptz,
  add column if not exists rights_checked_at timestamptz,
  add column if not exists source_updated_at timestamptz;

create index if not exists dispatch_article_sources_url_idx
  on public.dispatch_article_sources (source_url);

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
  v_kind text := p_article->>'storyKind';
  source jsonb;
  claim jsonb;
  source_id text;
  source_count integer;
  claim_count integer;
  recent_count integer;
  required_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dispatch-publish-' || p_day_key::text));
  if p_result->>'status' <> 'published' or p_result->>'runId' <> v_run_id::text then
    raise exception 'publication result does not match article run';
  end if;
  if v_kind not in ('official_announcement', 'developing') or v_kind is null then
    raise exception 'invalid story kind';
  end if;
  if p_article->>'publicationStatus' <> 'published'
    or p_article->>'verificationStatus' <> 'passed'
    or p_article->>'grade' <> 'A'
    or coalesce((p_article->'qualityScore'->>'overallScore')::numeric, 0) < 7
    or coalesce((p_article->'qualityScore'->>'factualConfidence')::numeric, 0) < 8
    or (v_kind = 'developing' and coalesce((p_article->'qualityScore'->>'sourceDiversity')::numeric, 0) < 7)
    or jsonb_array_length(coalesce(p_article->'factCheckWarnings', '[]'::jsonb)) > 0 then
    raise exception 'article did not pass publication state gates';
  end if;
  source_count := jsonb_array_length(coalesce(p_article->'sources', '[]'::jsonb));
  claim_count := jsonb_array_length(coalesce(p_article->'claims', '[]'::jsonb));
  required_count := case when v_kind = 'official_announcement' then 1 else 2 end;
  if source_count < required_count or claim_count < 3 then
    raise exception 'article evidence is incomplete';
  end if;
  if (select count(*) from public.dispatch_articles
      where publication_status = 'published' and verification_status = 'passed' and publication_day = p_day_key) >= 4 then
    raise exception 'daily publication limit reached';
  end if;

  for source in select value from jsonb_array_elements(p_article->'sources') loop
    if nullif(btrim(source->>'organisationId'), '') is null
      or nullif(btrim(source->>'upstreamOriginId'), '') is null
      or nullif(btrim(source->>'attribution'), '') is null
      or nullif(btrim(source->>'licenceEvidence'), '') is null
      or coalesce(source->>'discoveryUrl' ~ '^https://', false) = false
      or coalesce(source->>'url' ~ '^https://', false) = false
      or (source->>'publishedAt')::timestamptz > now()
      or (source->>'publishedAt')::timestamptz < now() - interval '72 hours'
      or coalesce((
        (source->>'licenceId' = 'OGL-3.0' and source->>'licenceUrl' = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/')
        or (source->>'licenceId' = 'CC-BY-4.0' and source->>'licenceUrl' = 'https://creativecommons.org/licenses/by/4.0/')
        or (source->>'licenceId' = 'US-PD' and source->>'licenceUrl' ~ '^https://www\.(usgs|nih)\.gov/')
      ), false) = false then
      raise exception 'article source rights or provenance incomplete';
    end if;
  end loop;

  insert into public.dispatch_articles(
    id, topic, headline, subheadline, lede, body, category, tags, sources,
    reading_time, published_at, quality_score, verification_status, publication_status,
    grade, word_count, quality_score_value, what_we_do_not_know, what_happens_next,
    pipeline_run_id, fact_check_warnings, article_format, trend_score, view_count,
    topic_fingerprint, publication_day, story_kind
  ) values (
    v_article_id, p_article->>'topic', p_article->>'headline', p_article->>'subheadline',
    p_article->>'lede', p_article->>'body', p_article->>'category', p_article->'tags', p_article->'sources',
    (p_article->>'readingTime')::integer, (p_article->>'publishedAt')::timestamptz,
    p_article->'qualityScore', 'passed', 'published', 'A', (p_article->>'wordCount')::integer,
    (p_article->'qualityScore'->>'overallScore')::numeric, p_article->>'whatWeDoNotKnow',
    p_article->>'whatHappensNext', p_article->>'pipelineRunId', coalesce(p_article->'factCheckWarnings', '[]'::jsonb),
    p_article->>'format', coalesce((p_article->>'trendScore')::numeric, 0), 0,
    p_topic_fingerprint, p_day_key, v_kind
  );

  for source in select value from jsonb_array_elements(p_article->'sources') loop
    insert into public.dispatch_article_sources(
      article_id, source_id, publisher_name, source_url, source_domain,
      reliability, excerpt, content_hash, published_at,
      organisation_id, upstream_origin_id, is_primary, licence_id, licence_url,
      licence_evidence, attribution, discovery_url, retrieved_at, rights_checked_at, source_updated_at
    ) values (
      v_article_id, source->>'id', source->>'name', source->>'url', lower(source->>'domain'),
      source->>'reliability', source->>'excerpt', source->>'contentHash', (source->>'publishedAt')::timestamptz,
      source->>'organisationId', source->>'upstreamOriginId', (source->>'isPrimary')::boolean,
      source->>'licenceId', source->>'licenceUrl', source->>'licenceEvidence', source->>'attribution',
      source->>'discoveryUrl', coalesce((source->>'retrievedAt')::timestamptz, now()),
      coalesce((source->>'rightsCheckedAt')::timestamptz, now()), (source->>'updatedAt')::timestamptz
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

  select count(*) into recent_count
  from public.dispatch_article_sources evidence
  where evidence.article_id = v_article_id
    and evidence.published_at >= now() - interval '72 hours'
    and evidence.published_at <= now();
  if recent_count < required_count
    or not exists (select 1 from public.dispatch_article_sources evidence
      where evidence.article_id = v_article_id and evidence.reliability = 'high') then
    raise exception 'article source freshness or reliability gates failed';
  end if;
  if v_kind = 'official_announcement' then
    if not exists (select 1 from public.dispatch_article_sources evidence
      where evidence.article_id = v_article_id and evidence.reliability = 'high' and evidence.is_primary) then
      raise exception 'official announcement lacks a primary source';
    end if;
  else
    if (select count(distinct evidence.organisation_id) from public.dispatch_article_sources evidence
        where evidence.article_id = v_article_id) < 2
      or (select count(distinct evidence.upstream_origin_id) from public.dispatch_article_sources evidence
        where evidence.article_id = v_article_id) < 2 then
      raise exception 'developing story lacks independent organisations or origins';
    end if;
    if not exists (
      select 1 from public.dispatch_claim_sources mapping
      join public.dispatch_article_sources evidence
        on evidence.article_id = mapping.article_id and evidence.source_id = mapping.source_id
      where mapping.article_id = v_article_id
      group by mapping.claim_id
      having count(distinct evidence.organisation_id) >= 2
        and count(distinct evidence.upstream_origin_id) >= 2
    ) then
      raise exception 'article lacks independent corroboration';
    end if;
  end if;

  update public.dispatch_pipeline_runs
  set status = 'published', topic = p_result->>'topic', topic_fingerprint = p_topic_fingerprint,
      result = jsonb_set(p_result, '{articleId}', to_jsonb(v_article_id), true),
      rejection_reason = null, finished_at = now()
  where id = v_run_id and idempotency_key = p_idempotency_key and status = 'running';
  if not found then raise exception 'pipeline run does not match publication'; end if;
  insert into public.dispatch_pipeline_events(run_id, event_type, details)
  values (v_run_id, 'published', jsonb_set(p_result, '{articleId}', to_jsonb(v_article_id), true));
  delete from public.dispatch_pipeline_leases where name = 'editorial' and owner_run_id = v_run_id;
  return jsonb_build_object('articleId', v_article_id);
end;
$$;

revoke all on function public.dispatch_publish_article(jsonb, text, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.dispatch_publish_article(jsonb, text, text, date, jsonb) to service_role;

-- An expired lease must not leave a run permanently marked running.
create or replace function public.dispatch_reconcile_stale_pipeline_runs()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  reconciled integer;
begin
  with stale as (
    update public.dispatch_pipeline_runs run
    set status = 'failed',
        result = jsonb_build_object('status', 'failed', 'runId', run.id, 'reason', 'stale_run_expired'),
        rejection_reason = 'stale_run_expired',
        finished_at = now()
    where run.status = 'running'
      and run.started_at < now() - interval '2 minutes'
      and not exists (
        select 1 from public.dispatch_pipeline_leases lease
        where lease.owner_run_id = run.id and lease.expires_at > now()
      )
    returning run.id, run.result
  )
  insert into public.dispatch_pipeline_events(run_id, event_type, details)
  select stale.id, 'failed', stale.result from stale;
  get diagnostics reconciled = row_count;
  return reconciled;
end;
$$;

revoke all on function public.dispatch_reconcile_stale_pipeline_runs() from public, anon, authenticated;
grant execute on function public.dispatch_reconcile_stale_pipeline_runs() to service_role;

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
  perform public.dispatch_reconcile_stale_pipeline_runs();
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
  ) values (
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

revoke all on function public.dispatch_claim_pipeline_run(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.dispatch_claim_pipeline_run(uuid, text, text, text, text) to service_role;

select public.dispatch_reconcile_stale_pipeline_runs();
