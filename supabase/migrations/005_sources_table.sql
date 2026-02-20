-- Sources table
-- Stores content sources (blogs, newsletters) that the daily scraper pulls from.
-- Replaces the YAML-based config from the ai-thought-leadership repo.

create table sources (
  id            text primary key,
  name          text not null,
  url           text not null unique,
  type          text default 'blog',
  rss_url       text,
  tags          text[] default '{}',
  active        boolean default true,
  suggestion_id uuid references source_suggestions(id),
  created_at    timestamptz default now()
);

-- RLS: public read (scraper needs unauthenticated access), admin-only write
alter table sources enable row level security;

create policy "Public read access"
  on sources for select
  using (true);

-- Seed with 8 existing sources from sources.yaml
insert into sources (id, name, url, type, rss_url, tags) values
  ('jesse-chen', 'Jesse Chen', 'https://blog.fsck.com/', 'blog', null, '{ai-coding,cursor,claude-code}'),
  ('naveen-naidu', 'Naveen Naidu', 'https://www.naveennaidu.com/writing/', 'blog', null, '{agent-native,architecture,read-later}'),
  ('kieran-klaassen', 'Kieran Klaassen', 'https://www.kieranklaassen.com/', 'blog', null, '{ai-tools,development,rails}'),
  ('dan-shipper-every', 'Dan Shipper (Every)', 'https://every.to/source-code/', 'blog', 'https://every.to/source-code/feed', '{claude-code,ai-workflow,productivity}'),
  ('anthropic-engineering', 'Anthropic Engineering', 'https://www.anthropic.com/engineering/', 'blog', null, '{claude,ai-safety,engineering,tools-for-agents}'),
  ('simon-willison', 'Simon Willison', 'https://simonwillison.net/', 'blog', 'https://simonwillison.net/atom/everything/', '{ai,llm,tools}'),
  ('swyx', 'Swyx', 'https://www.latent.space/', 'blog', 'https://www.latent.space/feed', '{ai-engineering,latent-space}'),
  ('lenny-rachitsky', 'Lenny Rachitsky', 'https://www.lennysnewsletter.com/', 'newsletter', 'https://www.lennysnewsletter.com/feed', '{product-management,ai-product,growth,engineering}');
