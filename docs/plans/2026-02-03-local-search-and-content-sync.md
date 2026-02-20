# Design: Local Search & Content Sync for Mintlify

**Date**: 2026-02-03
**Status**: ✅ Complete (All Phases)
**Author**: Claude (with Son Le)

## Overview

Enable offline-capable search and local article viewing for the Mintlify documentation site, removing dependency on Mintlify Pro for search functionality.

## Goals

1. **Local Cmd+K Search** - Bypass Mintlify's "Not available on local preview" restriction
2. **Supabase → MDX Sync** - Pull content from Supabase to generate searchable MDX files
3. **Local Article Viewing** - Browse content by author/topic links to local MDX files instead of external URLs

## Architecture

### Search Fallback Chain

```
Cmd+K pressed
     │
     ▼
┌─────────────────────┐
│ Is localhost:3000?  │
└─────────┬───────────┘
     Yes  │  No
     ▼    ▼
localhost:8787    production API
(wrangler dev)    (workers.dev)
     │                 │
     └────────┬────────┘
              │
         API works?
         Yes │  No (offline/error)
             │  ▼
             │  Local Fuse.js index
             │  (search-index.json)
             ▼
       Results → link to /kb/articles/[slug]
```

### API URL Detection

```javascript
const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8787'
  : 'https://thought-leadership-api.thsonvt.workers.dev';
```

## Content Pipeline

### Source Flow

```
ai-thought-leadership repo (daily GitHub Action)
     │
     ├─ sources.yaml (configured content sources)
     ├─ scraper.py (fetches via RSS/web scraping)
     │    └─ markdownify (HTML → Markdown, preserves code blocks)
     └─ supabase_sync.py → Supabase
          ├─ title, author, url
          ├─ content (FULL markdown)
          ├─ summary, topics, key_quotes
          ├─ diataxis_type
          └─ embedding (1536 dims)
```

### MDX Generation (this repo)

```
scripts/generate-kb-mdx.mjs
     │
     ├─► /kb/articles/{slug}-{hash}.mdx
     │     - Frontmatter (title, author, topics, etc.)
     │     - Summary section
     │     - Key Insights (quotes)
     │     - Topics list
     │     - ## Full Article ← FULL CONTENT
     │     - Related Articles
     │
     ├─► /kb/authors/{author-id}.mdx
     │     - Author index page
     │     - Links to all their articles
     │
     ├─► /kb/browse/topics/{topic-slug}.mdx
     │     - Static topic index (works offline)
     │     - Links to dynamic search when online
     │
     └─► /kb/search-index.json
           - Lightweight index for offline Fuse.js search
           - title, summary, path, author, topics
```

## File Structure

```
kb/
├── search.mdx                    # Semantic search page
├── browse.mdx                    # Browse page (updated links)
├── content-gaps.mdx              # Gap analysis
├── search-index.json             # NEW: Offline search index
│
├── articles/                     # NEW: Generated article MDX
│   ├── stop-coding-start-directing-6a8b2c1d.mdx
│   └── ...
│
├── authors/                      # NEW: Author index pages
│   ├── anthropic-engineering.mdx
│   ├── dan-shipper-every.mdx
│   └── ...
│
└── topics/                       # NEW: Topic index pages
    ├── ai-agents.mdx
    ├── claude-code.mdx
    └── ...
```

## Navigation

**Left sidebar (docs.json)** - stays minimal:
```
Research
├── Semantic Search
└── Browse Content

Planning
└── Content Gaps
```

**Hidden pages** (accessible via URL, not in nav):
- `/kb/articles/*` - 100+ articles
- `/kb/authors/*` - 10+ authors
- `/kb/topics/*` - 20+ topics

**Discovery paths:**
1. Cmd+K search → article
2. Browse → Author/Topic card → index page → article
3. Content Sources section → author page → article
4. Related articles → article

## Implementation Tasks

### Phase 1: Fix Broken Search Page (Quick Wins) ✅
- [x] Remove broken iframe from `kb/search.mdx` (points to deleted `thought-leadership-widget.vercel.app`)
- [x] Add Cmd+K prompt message to guide users to search
- [x] Update Content Sources cards with `href` links to author pages:
  - `Anthropic Engineering` → `/kb/authors/anthropic-engineering`
  - `Dan Shipper (Every)` → `/kb/authors/dan-shipper-every`
  - `Simon Willison` → `/kb/authors/simon-willison`

### Phase 2: Setup Scripts ✅
- [x] Copy `generate-kb-mdx.mjs` from reference repo to `scripts/`
- [x] Add search index generation to the script (outputs `search-index.json`)
- [x] Add topic page generation to the script (outputs `/kb/topics/*.mdx`)
- [x] Add author page generation with article listings
- [x] Create `package.json` with dependencies (@supabase/supabase-js, dotenv)
- [x] Create `.env.example` with required variables

### Phase 3: Search Enhancement ✅
- [x] Copy `keyword-search.js` from reference repo to `scripts/`
- [x] Update API URL detection (localhost:8787 vs production)
- [x] Add offline fallback using Fuse.js with `search-index.json`
- [x] Update result links to use `mdx_path` (local) instead of external URLs
- [x] Inject script into Mintlify via docs.json `js` config

### Phase 4: Browse Pages ✅
- [x] Update `kb/browse.mdx` author accordions to link to local author pages
- [x] Update `kb/browse.mdx` topic cards to link to local topic pages
- [x] Ensure "View all X articles →" links go to `/kb/authors/{id}`

### Phase 5: Local API Setup ✅
- [x] Copy `docs-assistant/` folder structure from reference repo
- [x] Document local development workflow:
  1. `cd docs-assistant/apps/api && pnpm dev` (starts API on :8787)
  2. `mint dev` (starts docs on :3000)
  3. `node scripts/generate-kb-mdx.mjs` (generates content)

### Phase 6: Testing & Documentation ✅
- [x] Update CLAUDE.md with new commands
- [x] Document the content sync workflow
- [ ] Test offline search with airplane mode (manual testing required)
- [ ] Test local article viewing (manual testing required)

## Dependencies

### Required Environment Variables
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
OPENAI_API_KEY=sk-...  # For semantic search embeddings
```

### NPM Packages (for scripts)
```json
{
  "@supabase/supabase-js": "^2.45.0",
  "dotenv": "^16.0.0",
  "fuse.js": "^7.0.0"
}
```

## Known Issues (Identified)

### Issue 1: DEPLOYMENT_NOT_FOUND on Search Page
**Location:** `kb/search.mdx` lines 11-16
**Root Cause:** Iframe points to deleted Vercel deployment:
```jsx
<iframe src="https://thought-leadership-widget.vercel.app/?tab=search" />
```
**Resolution:** Remove iframe, add Cmd+K prompt, rely on custom search modal

### Issue 2: Content Sources Cards Not Clickable
**Location:** `kb/search.mdx` lines 32-42
**Root Cause:** Cards have no `href` attribute - informational only
**Resolution:** Add href links to author pages:
```jsx
<Card title="Anthropic Engineering" icon="robot" href="/kb/authors/anthropic-engineering">
```

### Issue 3: Browse Page Links to External URLs
**Location:** `kb/browse.mdx`
**Root Cause:** "View all X articles →" links go to external websites
**Resolution:** Link to local `/kb/authors/{id}` pages

## Notes

- Articles contain FULL content from original sources, properly formatted
- Content is scraped using `markdownify` which preserves code blocks, headings, lists
- MDX special characters are escaped outside code blocks
- Related articles are computed using embedding similarity from Supabase
