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

### Prerequisites
- Node.js version 19 or higher
- A `docs.json` file in the repository root

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
├── quickstart.mdx         # Quickstart guide
├── development.mdx        # Development instructions
│
├── essentials/            # Core documentation topics
│   ├── settings.mdx       # Site customization
│   ├── navigation.mdx     # Navigation setup
│   ├── markdown.mdx       # Markdown syntax guide
│   ├── code.mdx           # Code block examples
│   ├── images.mdx         # Image handling
│   └── reusable-snippets.mdx
│
├── ai-tools/              # AI tool integration guides
│   ├── cursor.mdx
│   ├── claude-code.mdx
│   └── windsurf.mdx
│
├── api-reference/         # API documentation
│   ├── introduction.mdx
│   ├── openapi.json       # OpenAPI 3.1 specification
│   └── endpoint/          # Individual endpoint docs
│       ├── get.mdx
│       ├── create.mdx
│       ├── delete.mdx
│       └── webhook.mdx
│
├── snippets/              # Reusable content snippets
│   └── snippet-intro.mdx
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
