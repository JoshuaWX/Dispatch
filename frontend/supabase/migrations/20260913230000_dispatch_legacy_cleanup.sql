-- Remove the retired plaintext scheduler API and harden the cache trigger left by
-- the legacy schema. The trigger itself remains in use by the Virlo cache table.
drop function if exists public.configure_dispatch_scheduler(text, text, text);

do $cleanup$
begin
  if to_regprocedure('public.dispatch_virlo_daily_cache_set_updated_at()') is not null then
    execute $sql$alter function public.dispatch_virlo_daily_cache_set_updated_at() set search_path = ''$sql$;
    execute 'revoke execute on function public.dispatch_virlo_daily_cache_set_updated_at() from public, anon, authenticated';
  end if;
end
$cleanup$;
