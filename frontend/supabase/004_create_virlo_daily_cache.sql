-- Stores one Virlo snapshot per UTC day so all app instances share the same daily fetch state.

create table if not exists public.dispatch_virlo_daily_cache (
  day_key text primary key,
  topics jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  attempted_at timestamptz not null default now(),
  success boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.dispatch_virlo_daily_cache_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_dispatch_virlo_daily_cache_updated_at
on public.dispatch_virlo_daily_cache;

create trigger trg_dispatch_virlo_daily_cache_updated_at
before update on public.dispatch_virlo_daily_cache
for each row
execute function public.dispatch_virlo_daily_cache_set_updated_at();
