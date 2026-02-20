# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Mintlify documentation starter kit - a template for creating beautiful, customizable documentation sites. The project is primarily content-focused, using MDX (Markdown + JSX) for documentation pages.

## Development Commands

### Local Development
```bash
# Install Mintlify CLI globally (requires Node.js v19+)
npm i -g mint

# Start local development server (runs on http://localhost:3000)
mint dev

# Run on custom port
mint dev --port 3333

# Update CLI to latest version
npm mint update

# Validate all links in documentation
mint broken-links
```

### Knowledge Base Content Generation
```bash
# Generate MDX files from Supabase (requires .env with SUPABASE_URL and SUPABASE_ANON_KEY)
cd scripts && npm install && node generate-kb-mdx.mjs
```

This generates:
- `/kb/articles/*.mdx` - Article pages with full content
- `/kb/authors/*.mdx` - Author index pages
- `/kb/topics/*.mdx` - Topic index pages
- `/kb/search-index.json` - Offline search index for Fuse.js

### Local Search API (Semantic Search)
```bash
# Start the Hono API on localhost:8787
cd docs-assistant/apps/api
cp .dev.vars.example .dev.vars  # Add your keys
pnpm install && pnpm dev
```

The custom search (Cmd+K) automatically routes:
- **localhost:3000** → `localhost:8787` (local Hono API)
- **Production** → `thought-leadership-api.thsonvt.workers.dev`
- **Offline** → Falls back to Fuse.js with `/kb/search-index.json`

### Full Development Workflow
```bash
# 1. Generate content from Supabase
cd scripts && node generate-kb-mdx.mjs

# 2. Start local search API (optional, for semantic search)
cd docs-assistant/apps/api && pnpm dev

# 3. Start Mintlify docs (in another terminal)
mint dev
```

### Prerequisites
- Node.js version 19 or higher
- A `docs.json` file in the repository root
- For KB generation: `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env`
- For semantic search: `OPENAI_API_KEY` in `docs-assistant/apps/api/.dev.vars`

### Troubleshooting
- If the dev environment isn't running: `mint update`
- If encountering unknown errors: Delete `~/.mintlify` folder and run `mint dev` again
- For "sharp" module errors on darwin-arm64: Remove CLI (`npm remove -g mint`), upgrade to Node v19+, reinstall CLI

## Architecture

### Configuration Hub: docs.json

The `docs.json` file is the central configuration that defines:
- **Theme & branding**: Colors, logo (light/dark variants), favicon
- **Navigation structure**: Tabs, groups, and page hierarchy
- **Contextual features**: AI tool integrations (ChatGPT, Claude, Cursor, etc.)
- **External links**: Navbar links, footer socials, global anchors

**Key navigation concepts:**
- **Tabs**: Top-level navigation sections (e.g., "Guides", "API reference")
- **Groups**: Organizational units within tabs (e.g., "Getting started", "Customization")
- **Pages**: Individual MDX files referenced by their path (without `.mdx` extension)

### Content Organization

```
/
├── docs.json              # Central configuration file
├── index.mdx              # Homepage/landing page
│
├── framework/             # AI Conductor Framework modules
│   ├── introduction/      # Module 1: Introduction
│   ├── rehearsal/         # Module 2: The Rehearsal
│   ├── performance/       # Module 3: Performance & Polish
│   └── scaling/           # Module 4: Scaling to Teams
│
├── kb/                    # Knowledge Base (generated + static)
│   ├── search.mdx         # Search page with Cmd+K prompt
│   ├── browse.mdx         # Browse by author/topic
│   ├── content-gaps.mdx   # Gap analysis dashboard
│   ├── search-index.json  # Generated: offline search index
│   ├── articles/          # Generated: article MDX files
│   ├── authors/           # Generated: author index pages
│   └── topics/            # Generated: topic index pages
│
├── scripts/               # Build scripts
│   ├── generate-kb-mdx.mjs  # Generates KB content from Supabase
│   └── keyword-search.js    # Custom Cmd+K search modal
│
├── docs-assistant/        # Local API for semantic search
│   └── apps/api/          # Hono API on Cloudflare Workers
│
├── images/                # Static image assets
└── logo/                  # Logo files (light.svg, dark.svg)
```

### MDX File Structure

All content pages use MDX with frontmatter:

```mdx
---
title: 'Page Title'
description: 'Brief description for SEO and previews'
icon: 'icon-name'  # Optional Font Awesome icon
---

# Content goes here with standard markdown + Mintlify components
```

### API Documentation Approach

This starter kit uses **OpenAPI-based API documentation**:
- API spec defined in `api-reference/openapi.json` (OpenAPI 3.1.0)
- Individual endpoint pages in `api-reference/endpoint/` reference the spec
- Authentication uses Bearer tokens defined in the OpenAPI security schemes
- Alternative approach: Use MDX components instead of OpenAPI (see Mintlify docs)

### Mintlify Components

The starter kit demonstrates usage of Mintlify's custom MDX components:
- `<Card>`: Link cards with icons
- `<Columns>`: Multi-column layouts
- `<Steps>`: Step-by-step instructions
- `<Accordion>` / `<AccordionGroup>`: Collapsible content
- `<Info>`, `<Tip>`, `<Warning>`, `<Note>`: Callout boxes
- `<Frame>`: Image containers with styling
- `<Latex>`: Mathematical expressions

## Content Development Workflow

1. **Edit MDX files** for content changes
2. **Update docs.json** when adding/removing pages or changing navigation
3. **Run `mint dev`** to preview changes locally at `http://localhost:3000`
4. **Validate links** with `mint broken-links` before committing
5. **Push to main branch** to trigger automatic deployment (requires GitHub app integration)

## Important Patterns

### Navigation References
- Use **root-relative paths** in docs.json: `"index"`, `"essentials/settings"` (no `.mdx`)
- In MDX internal links, use **full root paths**: `[link](/essentials/navigation)` not `../navigation`
- Relative links work but are slower due to optimization limitations

### Asset Paths
- Images: Reference with root-relative paths: `/images/hero-dark.png`
- Logos: `/logo/light.svg` and `/logo/dark.svg` for theme variants
- Favicon: `/favicon.svg` in root

### OpenAPI Integration
- Endpoint pages auto-generate from `api-reference/openapi.json`
- Security schemes (Bearer auth) defined in OpenAPI components
- Webhook definitions supported in OpenAPI spec

## Deployment

- Install GitHub app from Mintlify dashboard to enable automatic deployments
- Changes to the default branch (main) automatically deploy to production
- Successful deployments show "All checks have passed" confirmation
