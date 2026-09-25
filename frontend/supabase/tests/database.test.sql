begin;
create extension if not exists pgtap with schema extensions;
select plan(40);
-- Production and staging have different persistent caps; the test transaction
-- uses a one-dollar fixture and rolls it back with every inserted test row.
update public.dispatch_operator_settings set monthly_budget_usd = 1.00 where id = true;

select has_table('public', 'dispatch_articles', 'articles table exists');
select has_table('public', 'dispatch_pipeline_runs', 'pipeline runs table exists');
select has_table('public', 'dispatch_ai_reservations', 'AI reservations table exists');
select has_table('public', 'dispatch_article_sources', 'normalized evidence table exists');
select has_table('public', 'dispatch_material_claims', 'material claims table exists');
select has_table('public', 'dispatch_claim_sources', 'claim-source mappings table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.dispatch_articles'::regclass),
  'RLS is enabled on articles'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.dispatch_pipeline_runs'::regclass),
  'RLS is enabled on pipeline runs'
);
select ok(not has_table_privilege('anon', 'public.dispatch_articles', 'INSERT'), 'anon cannot insert articles');
select ok(not has_table_privilege('authenticated', 'public.dispatch_articles', 'UPDATE'), 'authenticated cannot update articles');
select ok(not has_table_privilege('anon', 'public.dispatch_articles', 'SELECT'), 'anon cannot read the base article table');
select ok(not has_table_privilege('authenticated', 'public.dispatch_articles', 'SELECT'), 'authenticated cannot read the base article table');
select ok(has_table_privilege('service_role', 'public.dispatch_articles', 'SELECT'), 'service role can read articles');
select ok(
  not has_function_privilege('anon', 'public.dispatch_publish_article(jsonb,text,text,date,jsonb)', 'EXECUTE'),
  'anon cannot execute publication RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.dispatch_reserve_ai_budget(uuid,numeric,text,date)', 'EXECUTE'),
  'authenticated cannot reserve AI budget'
);
select ok(
  has_function_privilege('service_role', 'public.dispatch_publish_article(jsonb,text,text,date,jsonb)', 'EXECUTE'),
  'service role can execute the publication RPC'
);
select ok(
  not has_function_privilege('anon', 'public.dispatch_public_article_facets(text)', 'EXECUTE'),
  'anon cannot execute the internal public-facet RPC directly'
);
select ok(
  has_function_privilege('service_role', 'public.dispatch_public_article_facets(text)', 'EXECUTE'),
  'service role can execute the public-facet RPC'
);
select is(
  (select publishing_enabled from public.dispatch_operator_settings where id = true),
  false,
  'publishing is paused by default'
);
select is(
  (select monthly_budget_usd from public.dispatch_operator_settings where id = true),
  1.000000::numeric,
  'the test transaction has a one-dollar AI budget fixture'
);
select is(
  (select budget_warning_usd from public.dispatch_operator_settings where id = true),
  0.800000::numeric,
  'budget warning defaults to eighty cents'
);

select is(
  public.dispatch_claim_pipeline_run(
    '00000000-0000-4000-8000-000000000001', 'manual', 'Test topic', 'test-idempotency', 'request-test-0001'
  )->>'acquired',
  'true',
  'first pipeline claim acquires the lease'
);
select is(
  public.dispatch_claim_pipeline_run(
    '00000000-0000-4000-8000-000000000002', 'manual', 'Test topic', 'test-idempotency', 'request-test-0002'
  )->>'acquired',
  'false',
  'duplicate idempotency key cannot acquire another run'
);
select is(
  (select request_id from public.dispatch_pipeline_runs where id = '00000000-0000-4000-8000-000000000001'),
  'request-test-0001',
  'pipeline run stores a durable request correlation ID'
);

select is(
  public.dispatch_reserve_ai_budget(
    '00000000-0000-4000-8000-000000000001', 0.01,
    '2099-01', '2099-01-01'::date
  )->>'reserved',
  'true',
  'budget can be reserved below the daily allowance'
);
select lives_ok(
  $$select public.dispatch_settle_ai_budget(
    (select id from public.dispatch_ai_reservations
      where run_id = '00000000-0000-4000-8000-000000000001'
      order by created_at desc limit 1),
    0.000725, 500, 400
  )$$,
  'budget settlement records a Gemini 3.1 Flash-Lite usage record'
);
select is(
  (select model from public.dispatch_ai_usage
    where run_id = '00000000-0000-4000-8000-000000000001'
    order by created_at desc limit 1),
  'gemini-3.1-flash-lite',
  'new AI usage is attributed to Gemini 3.1 Flash-Lite'
);

select throws_ok(
  $$select public.dispatch_publish_article(
    '{"id":"00000000-0000-4000-8000-000000000100","pipelineRunId":"00000000-0000-4000-8000-000000000001","storyKind":"official_announcement","publicationStatus":"published","verificationStatus":"passed","grade":"A","qualityScore":{"overallScore":7,"factualConfidence":8,"sourceDiversity":0},"factCheckWarnings":[],"sources":[],"claims":[]}'::jsonb,
    'test-idempotency', repeat('a', 64), current_date,
    '{"status":"published","runId":"00000000-0000-4000-8000-000000000001"}'::jsonb
  )$$,
  'P0001',
  'article evidence is incomplete',
  'publication RPC rejects incomplete evidence'
);

select throws_ok(
  $$select public.dispatch_publish_article(
    jsonb_build_object(
      'id','unlicensed-article','pipelineRunId','00000000-0000-4000-8000-000000000001',
      'storyKind','official_announcement','publicationStatus','published','verificationStatus','passed','grade','A',
      'qualityScore',jsonb_build_object('overallScore',8,'factualConfidence',9,'sourceDiversity',0),
      'factCheckWarnings','[]'::jsonb,
      'sources',jsonb_build_array(jsonb_build_object(
        'id','s1','url','https://www.gov.uk/government/news/unlicensed-test-story',
        'publishedAt',now(),'organisationId','uk-government:test-agency',
        'upstreamOriginId','https://www.gov.uk/government/news/unlicensed-test-story',
        'attribution','Agency release.','discoveryUrl','https://www.gov.uk/search/news-and-communications.atom'
      )),
      'claims',jsonb_build_array('{}'::jsonb,'{}'::jsonb,'{}'::jsonb)
    ),
    'test-idempotency',repeat('e',64),current_date,
    jsonb_build_object('status','published','runId','00000000-0000-4000-8000-000000000001')
  )$$,
  'P0001','article source rights or provenance incomplete',
  'publication RPC rejects an official page without explicit licence evidence'
);

select lives_ok(
  $$select public.dispatch_publish_article(
    jsonb_build_object(
      'id', 'atomic-article',
      'pipelineRunId', '00000000-0000-4000-8000-000000000001',
      'storyKind', 'official_announcement',
      'topic', 'Atomic publication test',
      'headline', 'Agency announces the atomic publication test',
      'subheadline', 'The official record describes the scope of the announcement.',
      'lede', 'The agency announced a material development.',
      'body', 'This brief attributes the announcement to the issuing agency and does not claim independent confirmation.',
      'category', 'World',
      'tags', jsonb_build_array('test'),
      'sources', jsonb_build_array(
        jsonb_build_object(
          'id','s1','name','UK Government',
          'url','https://www.gov.uk/government/news/atomic-test-story-one','domain','www.gov.uk',
          'reliability','high','excerpt','The agency announced the test.','contentHash',repeat('a',64),
          'publishedAt',now(),'organisationId','uk-government:test-agency',
          'upstreamOriginId','https://www.gov.uk/government/news/atomic-test-story-one','isPrimary',true,
          'licenceId','OGL-3.0','licenceUrl','https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
          'licenceEvidence','All content is available under OGL v3.0.','attribution','Contains public sector information licensed under OGL v3.0.',
          'discoveryUrl','https://www.gov.uk/search/news-and-communications.atom'
        )
      ),
      'claims', jsonb_build_array(
        jsonb_build_object('id','c1','text','The agency announced a material development.','sourceIds',jsonb_build_array('s1')),
        jsonb_build_object('id','c2','text','A public report was released.','sourceIds',jsonb_build_array('s1')),
        jsonb_build_object('id','c3','text','The announcement identifies the issuing agency.','sourceIds',jsonb_build_array('s1'))
      ),
      'readingTime', 1,
      'publishedAt', now(),
      'qualityScore', jsonb_build_object('overallScore',8,'factualConfidence',9,'sourceDiversity',0),
      'publicationStatus', 'published',
      'verificationStatus', 'passed',
      'grade', 'A',
      'wordCount', 12,
      'whatWeDoNotKnow', 'Long-term effects remain unknown.',
      'whatHappensNext', 'Further records will be reviewed.',
      'factCheckWarnings', '[]'::jsonb,
      'format', 'brief',
      'trendScore', 42
    ),
    'test-idempotency', repeat('b', 64), current_date,
    jsonb_build_object(
      'status', 'published',
      'runId', '00000000-0000-4000-8000-000000000001',
      'articleId', 'atomic-article',
      'topic', 'Atomic publication test'
    )
  )$$,
  'publication and final run state commit in one database function'
);
select is(
  (select status from public.dispatch_pipeline_runs where id = '00000000-0000-4000-8000-000000000001'),
  'published',
  'atomic publication finalizes the run'
);
select is((select count(*)::integer from public.dispatch_public_articles), 1, 'atomic publication becomes public only after finalization');
select is(
  (select licence_id from public.dispatch_article_sources where article_id = 'atomic-article' and source_id = 's1'),
  'OGL-3.0',
  'source reuse licence is stored with published evidence'
);
select is(
  public.dispatch_increment_article_view('atomic-article', repeat('e', 64)),
  1::bigint,
  'the first client view is counted atomically'
);
select is(
  public.dispatch_increment_article_view('atomic-article', repeat('e', 64)),
  1::bigint,
  'a duplicate client view is idempotent and does not inflate the count'
);

select is(
  public.dispatch_claim_pipeline_run(
    '00000000-0000-4000-8000-000000000003', 'manual', 'Rollback topic', 'rollback-idempotency', 'request-test-0003'
  )->>'acquired',
  'true',
  'a second run can acquire the released publication lease'
);
select throws_ok(
  $$select public.dispatch_publish_article(
    jsonb_build_object(
      'id','shared-origin-article','pipelineRunId','00000000-0000-4000-8000-000000000003',
      'storyKind','developing','topic','Shared origin test','headline','Two agencies repeat one measurement',
      'subheadline','The pages refer to the same upstream release.','lede','Both agencies linked one measurement.',
      'body','A developing story cannot count two pages repeating the same underlying measurement as independent confirmation.',
      'category','World','tags',jsonb_build_array('test'),
      'sources',jsonb_build_array(
        (select sources->0 from public.dispatch_articles where id='atomic-article'),
        (select (sources->0) || jsonb_build_object(
          'id','s2','name','Another agency',
          'url','https://www.gov.uk/government/news/another-page-about-the-same-release',
          'organisationId','uk-government:another-agency'
        ) from public.dispatch_articles where id='atomic-article')
      ),
      'claims',jsonb_build_array(
        jsonb_build_object('id','c1','text','Both pages repeat one measurement.','sourceIds',jsonb_build_array('s1','s2')),
        jsonb_build_object('id','c2','text','The original agency issued the release.','sourceIds',jsonb_build_array('s1')),
        jsonb_build_object('id','c3','text','The second agency links the same release.','sourceIds',jsonb_build_array('s2'))
      ),
      'readingTime',1,'publishedAt',now(),
      'qualityScore',jsonb_build_object('overallScore',8,'factualConfidence',9,'sourceDiversity',9),
      'publicationStatus','published','verificationStatus','passed','grade','A','wordCount',12,
      'whatWeDoNotKnow','Independent measurement is not yet available.',
      'whatHappensNext','Review new independent data if published.',
      'factCheckWarnings','[]'::jsonb,'format','brief','trendScore',42
    ),
    'rollback-idempotency',repeat('d',64),current_date,
    jsonb_build_object('status','published','runId','00000000-0000-4000-8000-000000000003')
  )$$,
  'P0001','developing story lacks independent organisations or origins',
  'two organisations repeating one upstream release do not establish independent corroboration'
);
select throws_ok(
  $$select public.dispatch_publish_article(
    (
      select jsonb_build_object(
        'id', 'rolled-back-article',
        'pipelineRunId', '00000000-0000-4000-8000-000000000003',
        'topic', topic,
        'storyKind', story_kind,
        'headline', headline,
        'subheadline', subheadline,
        'lede', lede,
        'body', body,
        'category', category,
        'tags', tags,
        'sources', sources,
        'claims', (
          select jsonb_agg(jsonb_build_object(
            'id', material.claim_id,
            'text', material.claim_text,
            'sourceIds', (
              select jsonb_agg(mapping.source_id)
              from public.dispatch_claim_sources mapping
              where mapping.article_id = material.article_id and mapping.claim_id = material.claim_id
            )
          ))
          from public.dispatch_material_claims material
          where material.article_id = article.id
        ),
        'readingTime', reading_time,
        'publishedAt', published_at,
        'qualityScore', quality_score,
        'publicationStatus', 'published',
        'verificationStatus', 'passed',
        'grade', 'A',
        'wordCount', word_count,
        'whatWeDoNotKnow', what_we_do_not_know,
        'whatHappensNext', what_happens_next,
        'factCheckWarnings', fact_check_warnings,
        'format', article_format,
        'trendScore', trend_score
      )
      from public.dispatch_articles article where id = 'atomic-article'
    ),
    'wrong-idempotency', repeat('c', 64), current_date,
    jsonb_build_object(
      'status', 'published',
      'runId', '00000000-0000-4000-8000-000000000003',
      'articleId', 'rolled-back-article',
      'topic', 'Rollback topic'
    )
  )$$,
  'P0001',
  'pipeline run does not match publication',
  'a late run-finalization failure aborts the publication transaction'
);
select is(
  (select count(*)::integer from public.dispatch_articles where id = 'rolled-back-article'),
  0,
  'a late transaction failure never leaves a public article behind'
);

delete from public.dispatch_articles where id = 'atomic-article';

select is((select count(*)::integer from public.dispatch_public_articles), 0, 'no unverified article is public');

select * from finish();
rollback;
