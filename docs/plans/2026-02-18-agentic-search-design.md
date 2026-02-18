# Agentic Search: Paragraph-Level Results with Deep Linking

**Date**: 2026-02-18
**Status**: Approved for implementation
**Branch**: feature/agentic-search

## Problem

Current semantic search embeds at the article level (title + summary). A query like "what are the common pitfalls with vibe coding" returns the right article, but the user still has to scan the whole page to find the relevant passage. The search feels keyword-matched rather than answer-focused.

## Goal

When a user searches a question, the search modal shows the exact paragraph that answers it. Clicking navigates to the article and the browser scrolls to and highlights that paragraph natively.

## Architecture

```
[User types query]
       ↓
[API: embed query → search article_chunks table]
       ↓
[Return: article title + matching paragraph text]
       ↓
[Search modal: shows excerpt preview in result card]
       ↓
[Click → /kb/articles/slug#:~:text=first+words+of+chunk]
       ↓
[Browser scrolls + highlights matched paragraph natively]
```

## Data Model

### New table: `article_chunks`

```sql
create table article_chunks (
  id           uuid primary key default gen_random_uuid(),
  article_id   uuid references articles(id) on delete cascade,
  content      text not null,
  chunk_index  int not null,
  embedding    vector(1536),
  created_at   timestamptz default now(),
  unique (article_id, chunk_index)
);

create index on article_chunks
  using hnsw (embedding vector_cosine_ops);
```

### New RPC: `match_chunks`

```sql
create or replace function match_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
) returns table (
  chunk_id     uuid,
  article_id   uuid,
  content      text,
  chunk_index  int,
  similarity   float,
  title        text,
  author       text,
  mdx_path     text
) language sql as $$
  select c.id, c.article_id, c.content, c.chunk_index,
         1 - (c.embedding <=> query_embedding) as similarity,
         a.title, a.author, a.mdx_path
  from article_chunks c
  join articles a on a.id = c.article_id
  where 1 - (c.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;
```

## Chunking Strategy

Articles are split from the `## Full Article` section downward using this priority order:

1. **Heading boundaries** (`##`, `###`) — each section becomes one chunk
2. **Paragraph breaks** (`\n\n`) — if a section exceeds 400 words, split further
3. **Sentence boundaries** — if a paragraph exceeds 400 words, split at `.`

Constraints:
- Minimum chunk size: 50 words (discard or merge with next)
- Target chunk size: 150–400 words
- Strip MDX syntax before embedding, keep original text for display

Each chunk is embedded as:
```
`${article.title} — ${chunk.content}`
```

Prepending the title improves relevance — the model understands the chunk in the context of its article.

## Indexing Script: `scripts/index-chunks.mjs`

```
1. Fetch all articles from Supabase (id, title, content)
2. For each article:
   a. Extract text after "## Full Article" marker
   b. Split into chunks per rules above
   c. Batch embed all chunks (OpenAI: up to 2048 inputs per call)
3. Upsert into article_chunks on (article_id, chunk_index)
4. Log: X articles → Y chunks indexed
```

Safe to re-run — upserts on the unique constraint.

## API Changes: `POST /api/search`

Updated flow:

```
1. Embed the query (unchanged)
2. Call match_chunks RPC → top 20 chunks
3. Group by article_id, keep highest-similarity chunk per article
4. Return top 5 articles, each with:
   - title, author, mdx_path, similarity
   - matching_excerpt: chunk text trimmed to 200 chars
   - fragment: first 8 words URL-encoded for Text Fragment API
```

Updated response shape per result:

```json
{
  "title": "The rise of the professional vibe coder",
  "author": "Lenny Rachitsky",
  "mdx_path": "/kb/articles/the-rise-of-the-professional-vibe-coder-abc123",
  "similarity": 0.82,
  "matching_excerpt": "The most common pitfall is skipping the planning phase entirely. Vibe coders tend to...",
  "fragment": "The%20most%20common%20pitfall%20is%20skipping"
}
```

## UI Changes: `scripts/keyword-search.js`

### Result card layout

```
┌─────────────────────────────────────────────────────┐
│ 📄 The rise of the professional vibe coder     82%  │
│    Lenny Rachitsky                                  │
│    "The most common pitfall is skipping the         │
│     planning phase entirely. Vibe coders tend..."   │
└─────────────────────────────────────────────────────┘
```

### Navigation URL on click

```
/kb/articles/the-rise-of-the-professional-vibe-coder-abc123
  #:~:text=The%20most%20common%20pitfall%20is%20skipping
```

The browser handles scroll and highlight natively via the Text Fragment API.

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Article has no `## Full Article` section | Fall back to embedding the summary |
| Chunk text contains MDX/markdown syntax | Strip before embedding, preserve original for display |
| Text Fragment not supported (Firefox) | URL still works — navigates to article top |
| API unavailable / offline | Fuse.js fallback returns article-level results, no excerpt shown |
| Re-indexing after new articles | Upsert on `(article_id, chunk_index)` — safe to re-run |
| Very short articles (< 50 words) | Embed whole article as single chunk |

## Implementation Order

1. Run Supabase migration (create table + RPC)
2. Write and run `scripts/index-chunks.mjs`
3. Update `POST /api/search` to use `match_chunks`
4. Update search result card in `keyword-search.js` to show excerpt
5. Add Text Fragment URL construction on result click
6. Test with Firefox fallback (no fragment support)
