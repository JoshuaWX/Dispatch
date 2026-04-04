-- Schedules DISPATCH generation from Supabase instead of Vercel Cron.
-- Replace placeholders before running:
--   <YOUR_VERCEL_APP_URL>  e.g. https://dispatch-news.vercel.app
--   <YOUR_SCHEDULER_SECRET> must match SCHEDULER_SECRET in Vercel env vars

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove previous job if it already exists.
select cron.unschedule('dispatch-hourly-generate')
where exists (
  select 1
  from cron.job
  where jobname = 'dispatch-hourly-generate'
);

-- Run every hour at minute 0.
select cron.schedule(
  'dispatch-hourly-generate',
  '0 * * * *',
  $$
    select net.http_get(
      url := '<YOUR_VERCEL_APP_URL>/api/cron/generate',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <YOUR_SCHEDULER_SECRET>'
      ),
      timeout_milliseconds := 120000
    );
  $$
);

-- Optional: inspect jobs.
-- select jobid, jobname, schedule, active from cron.job order by jobid desc;
