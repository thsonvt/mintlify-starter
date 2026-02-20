-- Track whether approved source suggestions have been promoted to sources.yaml

alter table source_suggestions
  add column if not exists promoted_to_sources boolean not null default false,
  add column if not exists promoted_source_id text,
  add column if not exists promoted_at timestamptz;

create index if not exists idx_source_suggestions_status_promoted_created
  on source_suggestions (status, promoted_to_sources, created_at);
