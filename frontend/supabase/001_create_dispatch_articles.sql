-- Durable article storage for DISPATCH
create table if not exists public.dispatch_articles (
  id text primary key,
  topic text not null,
  headline text not null,
  subheadline text not null,
  lede text not null,
  body text not null,
  image_url text,
  image_credit text,
  category text not null check (category in ('World', 'Tech', 'Business', 'Science')),
  tags jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  reading_time integer not null,
  published_at timestamptz not null,
  quality_score jsonb not null,
  verification_status text not null check (verification_status in ('verified', 'pending', 'unverified')),
  created_at timestamptz not null default now()
);

create index if not exists idx_dispatch_articles_published_at
  on public.dispatch_articles (published_at desc);
