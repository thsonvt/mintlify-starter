-- Source suggestions table
-- Lets authenticated users suggest new authors/publications for the knowledge base

create table source_suggestions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id),
  author_name text,
  url         text,
  status      text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz default now(),
  unique (url)
);

-- RLS: users can insert their own rows and read their own rows
alter table source_suggestions enable row level security;

create policy "Users can insert their own suggestions"
  on source_suggestions for insert
  with check (auth.uid() = user_id);

create policy "Users can read their own suggestions"
  on source_suggestions for select
  using (auth.uid() = user_id);
