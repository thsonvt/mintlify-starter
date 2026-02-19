# Unified Content Pipeline Design

**Date:** 2026-02-19
**Status:** Approved
**Goal:** Consolidate the two-repo content pipeline into a single repo (mintlify-starter) with sources managed in Supabase.

## Problem

The current pipeline spans two repositories:

- **ai-thought-leadership** (Python): scraper with site-specific handlers, GPT-4 metadata extraction, Supabase sync, weekly digests. Sources defined in `config/sources.yaml`.
- **mintlify-starter** (JS/TS): docs site, Hono API, source suggestions workflow, MDX generation, chunk indexing.

A manual bridge (`sync-source-suggestions.mjs`) promotes approved suggestions from Supabase to `sources.yaml` in the other repo. The Python scraper's GitHub Actions have stopped producing new articles. The handoff between repos is fragile and hard to debug.

## Decisions

| Decision | Choice |
|---|---|
| Consolidation direction | Everything into mintlify-starter |
| Scraper runtime | Node.js script, triggered by GitHub Actions |
| Source config storage | Supabase `sources` table (no YAML) |
| Content extraction | RSS-first, `@extractus/article-extractor` fallback |
| Digests & notifications | Dropped (can add later) |
| GPT-4 metadata fields | summary, topics, diataxis_type, key_quotes |

## Architecture

```
Supabase `sources` table
        |
scripts/scrape-sources.mjs  (GitHub Actions daily 8am UTC)
  |-- RSS feeds --> rss-parser
  |-- Web pages --> @extractus/article-extractor
        |
  GPT-4 metadata extraction
        |
  OpenAI embeddings (text-embedding-3-small)
        |
Supabase `articles` table
        |
scripts/index-chunks.mjs  (existing)
        |
Supabase `article_chunks` table
        |
scripts/generate-kb-mdx.mjs  (existing)
        |
MDX files committed to git --> Mintlify deploys
```

## Database: `sources` Table

Migration: `supabase/migrations/005_sources_table.sql`

```sql
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
```

Seeded with the 8 existing sources from the Python repo's `sources.yaml`.

RLS: public read (scraper needs unauthenticated access), admin-only insert/update.

### Source lifecycle

1. User submits suggestion --> `source_suggestions` (pending)
2. Admin approves --> `source_suggestions.status = 'approved'`
3. Admin activates --> new row in `sources` table (with `suggestion_id` link)
4. Next daily scrape picks it up automatically

## Scraper: `scripts/scrape-sources.mjs`

Single Node.js script, ~300-400 lines.

### Dependencies

Added to `scripts/package.json`:

- `rss-parser` -- RSS feed parsing
- `@extractus/article-extractor` -- generic web article extraction
- `openai` -- GPT-4 metadata + embeddings
- `@supabase/supabase-js` -- database

### Core loop

```
1. Fetch active sources from `sources` table
2. For each source:
   a. If rss_url exists --> fetch RSS, get last 10 entries
   b. If no rss_url --> fetch URL, extract article links, get last 10
   c. For each article URL:
      - Skip if URL already exists in `articles` table
      - Extract content (RSS body or article-extractor)
      - Convert to clean markdown
      - Call GPT-4: extract summary, topics, diataxis_type, key_quotes
      - Generate embedding (text-embedding-3-small, 1536 dims)
      - Insert into `articles` table
3. Log summary: "3 new articles from 8 sources"
```

### Differences from Python version

- No `--days-back` filter -- deduplicates by URL (simpler, no missed articles)
- No site-specific handlers -- `article-extractor` handles layout detection
- No local file storage -- writes directly to Supabase
- No digest generation

### Error handling

Per-source try/catch. One broken source does not stop others. Non-zero exit only if all sources fail.

## GitHub Actions: `daily-pipeline.yml`

Single unified workflow replaces separate scrape/generate workflows.

```yaml
name: Daily Content Pipeline
on:
  schedule:
    - cron: '0 8 * * *'
  workflow_dispatch:

jobs:
  pipeline:
    runs-on: ubuntu-latest
    steps:
      - Checkout repo
      - Setup Node.js 20
      - Install dependencies (cd scripts && npm install)
      - Run scraper:   node scripts/scrape-sources.mjs
      - Run chunker:   node scripts/index-chunks.mjs
      - Run MDX gen:   node scripts/generate-kb-mdx.mjs
      - Commit & push if files changed
```

Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OPENAI_API_KEY`.

Commit message: `chore(kb): daily pipeline -- N new articles, M chunks indexed`

Only commits when `generate-kb-mdx.mjs` produces file changes.

## API Changes

### New: `POST /api/admin/sources`

Create a source from an approved suggestion or from scratch.

```
Input:  { name, url, type?, rss_url?, tags?, active?, suggestion_id? }
Output: { success: true, source: { id, name, url, ... } }
```

The `id` slug is auto-generated from name. Checks URL uniqueness.

### New: `PATCH /api/admin/sources/:id`

Toggle `active`, update `rss_url`, `tags`, etc.

### Modified: `PATCH /api/admin/suggestions/:id`

When status changes to `approved`, response includes `ready_to_activate: true`. Admin UI shows "Activate as source" button.

### Unchanged

- `POST /api/suggestions` (user submission)
- `GET /api/admin/suggestions` (listing)
- All search, highlights, filters endpoints

## Migration Plan

### Phase 1: Database

Run `005_sources_table.sql`. Seeds 8 existing sources. No disruption -- nothing reads this table yet.

### Phase 2: Build scraper

Add `scrape-sources.mjs` and dependencies. Test locally -- verify it skips existing articles as duplicates, then test with a new source.

### Phase 3: API endpoints

Add `POST /api/admin/sources` and `PATCH /api/admin/sources/:id`. Update admin UI with "Activate as source" button.

### Phase 4: Switch workflow

Add `daily-pipeline.yml`. Delete old `generate-kb.yml`. Run manually once to verify.

### Phase 5: Archive

Disable GitHub Actions in `ai-thought-leadership`. Add README redirecting to mintlify-starter. Remove `sync-source-suggestions.mjs`.

### Rollback

Re-enable old GitHub Actions if needed. Both systems write to the same `articles` table.

## What Gets Removed

- `ai-thought-leadership` repo (archived, not deleted)
- `scripts/sync-source-suggestions.mjs` (YAML bridge)
- `config/sources.yaml` concept
- Weekly digest generation
- Email/Slack notifications
- Site-specific HTML handlers

## Files to Create/Modify

| File | Action |
|---|---|
| `supabase/migrations/005_sources_table.sql` | Create |
| `scripts/scrape-sources.mjs` | Create |
| `scripts/package.json` | Add dependencies |
| `.github/workflows/daily-pipeline.yml` | Create |
| `docs-assistant/apps/api/src/index.ts` | Add source management endpoints |
| `scripts/sync-source-suggestions.mjs` | Delete |
