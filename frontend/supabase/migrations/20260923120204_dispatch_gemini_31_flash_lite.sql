-- Keep historical model labels for audit, but attribute every new settlement
-- to the sole configured editorial model: Gemini 3.1 Flash-Lite.
alter table public.dispatch_ai_usage
  drop constraint if exists dispatch_ai_usage_model_check;

alter table public.dispatch_ai_usage
  add constraint dispatch_ai_usage_model_check
  check (model in ('gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'));

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
  values (p_reservation_id, reservation.run_id, 'gemini-3.1-flash-lite', p_input_tokens, p_output_tokens, p_actual_usd);
end;
$$;
