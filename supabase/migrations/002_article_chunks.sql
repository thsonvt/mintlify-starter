-- Article chunks for paragraph-level semantic search
-- Each article is split into chunks; each chunk has its own embedding.
-- This enables search results to point to the exact paragraph that answers the query.

create table if not exists article_chunks (
  id           uuid primary key default gen_random_uuid(),
  article_id   uuid references articles(id) on delete cascade,
  content      text not null,
  chunk_index  int not null,
  embedding    vector(1536),
  created_at   timestamptz default now(),
  unique (article_id, chunk_index)
);

-- HNSW index for fast cosine similarity search
create index if not exists article_chunks_embedding_idx
  on article_chunks
  using hnsw (embedding vector_cosine_ops);

-- RPC: match_chunks
-- Searches article_chunks by embedding similarity, joins articles for metadata.
-- mdx_path is intentionally excluded — the API generates it from title + id.
create or replace function match_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count     int
) returns table (
  chunk_id     uuid,
  article_id   uuid,
  content      text,
  chunk_index  int,
  similarity   float,
  title        text,
  author       text
) language sql as $$
  select
    c.id          as chunk_id,
    c.article_id,
    c.content,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) as similarity,
    a.title,
    a.author
  from article_chunks c
  join articles a on a.id = c.article_id
  where 1 - (c.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;
