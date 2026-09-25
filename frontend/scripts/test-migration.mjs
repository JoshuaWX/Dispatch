import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8')
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1]
if (!projectId) throw new Error('Supabase project_id is missing')

const preflightMigration = readFileSync(
  new URL('../supabase/migrations/20260912233900_dispatch_pre_hardening_backup.sql', import.meta.url),
  'utf8',
)
const hardeningMigration = readFileSync(
  new URL('../supabase/migrations/20260912234028_dispatch_hardening_schema.sql', import.meta.url),
  'utf8',
)
const fixture = `
begin;
-- This rollback-only upgrade harness runs against the latest local schema.
-- Recreate the legacy public view before replaying its older definition:
-- the latest schema appends story_kind, which otherwise shifts the view's
-- computed columns and makes CREATE OR REPLACE VIEW reject the replay.
drop view if exists public.dispatch_public_articles;
drop schema if exists dispatch_backup cascade;
insert into public.dispatch_articles(
  id, topic, headline, subheadline, lede, body, category, verification_status, publication_status
)
select
  'legacy-upgrade-' || item,
  'Legacy topic ' || item,
  'Legacy headline ' || item,
  'Legacy subheadline ' || item,
  'Legacy lede ' || item,
  'Legacy body ' || item,
  'World',
  'pending',
  'draft'
from generate_series(1, 124) as item;
`
const assertions = `
do $migration_test$
declare
  preserved integer;
  quarantined integer;
  exposed integer;
  backed_up integer;
begin
  select count(*) into preserved from public.dispatch_articles where id like 'legacy-upgrade-%';
  select count(*) into quarantined from public.dispatch_articles
    where id like 'legacy-upgrade-%' and publication_status = 'quarantined'
      and verification_status = 'failed' and rejection_reason = 'legacy_record_requires_reverification';
  select count(*) into exposed from public.dispatch_public_articles where id like 'legacy-upgrade-%';
  select count(*) into backed_up from dispatch_backup.dispatch_articles_20260913 where id like 'legacy-upgrade-%';
  if preserved <> 124 then raise exception 'migration preserved % of 124 legacy records', preserved; end if;
  if quarantined <> 124 then raise exception 'migration quarantined % of 124 legacy records', quarantined; end if;
  if exposed <> 0 then raise exception 'migration exposed % legacy records', exposed; end if;
  if backed_up <> 124 then raise exception 'migration backed up % of 124 legacy records', backed_up; end if;
end;
$migration_test$;
rollback;
`

const result = spawnSync(
  'docker',
  ['exec', '-i', `supabase_db_${projectId}`, 'psql', '--username', 'postgres', '--dbname', 'postgres', '--set', 'ON_ERROR_STOP=1'],
  { input: `${fixture}\n${preflightMigration}\n${hardeningMigration}\n${assertions}`, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
)
if (result.status !== 0) {
  process.stderr.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  throw new Error('The 124-record migration upgrade test failed')
}
process.stdout.write('Migration upgrade test passed: all 124 legacy records were preserved, quarantined, and kept private.\n')
