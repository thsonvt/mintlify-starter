# Highlights & Annotations Feature Design

**Date:** 2026-02-12
**Status:** Approved

## Overview

Medium-style text highlighting and annotation system for the Knowledge Base. Users can highlight passages, add notes, and access their highlights across devices. Private by default with optional sharing via link.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Auth | Supabase Auth (email/password) |
| Database | Supabase (new `highlights` table) |
| API | Hono on Cloudflare Workers (extend existing) |
| Frontend | Vanilla JS via Mintlify customJs |
| My Highlights | Iframe widget on Vercel |

## Data Model

```sql
-- User highlights and notes
CREATE TABLE highlights (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id      text NOT NULL,

  -- Position anchoring
  xpath           text NOT NULL,
  start_offset    int NOT NULL,
  end_offset      int NOT NULL,

  -- Content
  selected_text   text NOT NULL,
  note            text,

  -- Sharing
  share_id        text UNIQUE,

  -- Timestamps
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_highlights_user_article ON highlights(user_id, article_id);
CREATE INDEX idx_highlights_share ON highlights(share_id) WHERE share_id IS NOT NULL;

-- Row Level Security
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;

-- Users can manage their own highlights
CREATE POLICY "Users manage own highlights" ON highlights
  FOR ALL USING (auth.uid() = user_id);

-- Anyone can view shared highlights
CREATE POLICY "Public can view shared" ON highlights
  FOR SELECT USING (share_id IS NOT NULL);
```

## API Endpoints

```
Authentication (via Supabase JS client):
  - Handled client-side, API validates JWT from Authorization header

Highlights CRUD:
  GET  /api/highlights?article_id=xxx   — User's highlights for an article
  GET  /api/highlights                  — All user's highlights
  POST /api/highlights                  — Create highlight
  PATCH /api/highlights/:id             — Update note or share status
  DELETE /api/highlights/:id            — Delete highlight

Sharing:
  POST /api/highlights/:id/share        — Generate share_id
  GET  /api/shared/:share_id            — Public highlight view
```

## Frontend Components

### 1. Auth UI (`highlights-auth.js`)
- Sign in button in navbar
- Modal for login/signup
- Session management via Supabase client

### 2. Selection Tooltip (`highlights-tooltip.js`)
- Appears on text selection (mouseup event)
- Two buttons: "Highlight" and "Add Note"
- Posts to API with optimistic UI update

### 3. Highlight Renderer (`highlights-render.js`)
- Fetches highlights on article load
- Wraps text in `<mark class="user-highlight">` spans
- Click popover: view note, delete, share

### 4. Sidebar Panel (`highlights-sidebar.js`)
- Toggle via bookmark icon in margin
- Lists highlights for current article
- Click to scroll, inline note editing

## My Highlights Page

**Location:** `/kb/highlights.mdx`

**Implementation:** Iframe widget (consistent with gap analysis pattern)

**Features:**
- Search and filter highlights
- Filter by article, date, "with notes only"
- List view with article context
- Click to navigate to highlight in article

## UX Decisions

| Aspect | Decision |
|--------|----------|
| Trigger | Tooltip on text selection (Medium-style) |
| Colors | Single highlight color |
| Privacy | Private by default |
| Sharing | Optional via generated link |
| Views | Article sidebar + My Highlights page |

## Edge Cases

**Content drift:** If article updates and XPath target text doesn't match, show warning icon with original text.

**Long selections:** Cap at 500 characters.

**Overlapping highlights:** Allow, render with nested marks.

**Offline:** v1 requires connectivity; offline queue deferred.

**Auth expiry:** Show toast prompting re-login.

## Implementation Phases

### Phase 1 — Foundation
1. Create Supabase `highlights` table + RLS
2. Build auth UI (sign in/up modal)
3. Add CRUD API endpoints

### Phase 2 — Core Experience
4. Selection tooltip + highlight creation
5. Highlight renderer on articles
6. Article sidebar panel

### Phase 3 — Cross-Article View
7. My Highlights widget (Vercel)
8. Add highlights page to KB navigation

### Phase 4 — Sharing
9. Share link generation
10. Public shared highlight view

## Future Considerations (Out of Scope)

- Community highlights ("X people highlighted this")
- Export highlights to Notion/Readwise
- Highlight colors/categories
- Offline highlight queue
