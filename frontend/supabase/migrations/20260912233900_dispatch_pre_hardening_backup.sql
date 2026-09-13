-- Preserve the pre-hardening Dispatch data and stop legacy schedulers before the
-- schema quarantine runs. The backup schema is intentionally private and is not
-- exposed through the Data API.
create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists dispatch_backup;
revoke all on schema dispatch_backup from public, anon, authenticated;

do $backup$
begin
  if to_regclass('public.dispatch_articles') is not null
     and to_regclass('dispatch_backup.dispatch_articles_20260913') is null then
    execute 'create table dispatch_backup.dispatch_articles_20260913 as table public.dispatch_articles';
  end if;

  if to_regclass('public.dispatch_virlo_daily_cache') is not null
     and to_regclass('dispatch_backup.dispatch_virlo_daily_cache_20260913') is null then
    execute 'create table dispatch_backup.dispatch_virlo_daily_cache_20260913 as table public.dispatch_virlo_daily_cache';
  end if;

  if to_regclass('public.dispatch_scheduler_config') is not null
     and to_regclass('dispatch_backup.dispatch_scheduler_config_20260913') is null then
    execute 'create table dispatch_backup.dispatch_scheduler_config_20260913 as table public.dispatch_scheduler_config';
  end if;
end
$backup$;

create table if not exists dispatch_backup.dispatch_snapshot_20260913 (
  captured_at timestamptz not null default now(),
  article_count bigint not null,
  virlo_cache_count bigint not null,
  scheduler_config_count bigint not null
);

do $snapshot$
declare
  article_count bigint := 0;
  virlo_cache_count bigint := 0;
  scheduler_config_count bigint := 0;
begin
  if exists (select 1 from dispatch_backup.dispatch_snapshot_20260913) then
    return;
  end if;

  if to_regclass('public.dispatch_articles') is not null then
    execute 'select count(*) from public.dispatch_articles' into article_count;
  end if;
  if to_regclass('public.dispatch_virlo_daily_cache') is not null then
    execute 'select count(*) from public.dispatch_virlo_daily_cache' into virlo_cache_count;
  end if;
  if to_regclass('public.dispatch_scheduler_config') is not null then
    execute 'select count(*) from public.dispatch_scheduler_config' into scheduler_config_count;
  end if;

  insert into dispatch_backup.dispatch_snapshot_20260913 (
    article_count,
    virlo_cache_count,
    scheduler_config_count
  ) values (article_count, virlo_cache_count, scheduler_config_count);
end
$snapshot$;

select cron.unschedule(jobid)
from cron.job
where jobname in (
  'dispatch-generate-every-30-minutes',
  'dispatch-generate-every-hour',
  'dispatch-hourly-generate',
  'dispatch-generate-every-two-hours'
);

-- The legacy table stores a scheduler credential in plaintext. Its contents are
-- retained in the private backup above; the active copy must not survive rollout.
drop table if exists public.dispatch_scheduler_config;

revoke all on all tables in schema dispatch_backup from public, anon, authenticated;
