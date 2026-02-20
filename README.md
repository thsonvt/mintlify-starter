# Mintlify Starter Kit

Use the starter kit to get your docs deployed and ready to customize.

Click the green **Use this template** button at the top of this repo to copy the Mintlify starter kit. The starter kit contains examples with

- Guide pages
- Navigation
- Customizations
- API reference pages
- Use of popular components

**[Follow the full quickstart guide](https://starter.mintlify.com/quickstart)**

## Development

Install the [Mintlify CLI](https://www.npmjs.com/package/mint) to preview your documentation changes locally. To install, use the following command:

```
npm i -g mint
```

Run the following command at the root of your documentation, where your `docs.json` is located:

```
mint dev
```

View your local preview at `http://localhost:3000`.

## Publishing changes

Install our GitHub app from your [dashboard](https://dashboard.mintlify.com/settings/organization/github-app) to propagate changes from your repo to your deployment. Changes are deployed to production automatically after pushing to the default branch.

## Need help?

### Troubleshooting

- If your dev environment isn't running: Run `mint update` to ensure you have the most recent version of the CLI.
- If a page loads as a 404: Make sure you are running in a folder with a valid `docs.json`.

### Resources
- [Mintlify documentation](https://mintlify.com/docs)

## Steps to crawl, generate embedding and generate mdx file
### 1 - cd to /ai-thought-leadership

#### by a url
python scripts/scraper.py --url https://every.to/guides/compound-engineering

#### by an author
python scripts/scraper.py --source lenny-rachitsky --days-back=60

### 2 - generate embedding
python scripts/supabase_sync.py --force

### 3 - cd /Users/sonle/Github/mintlify-starter/scripts
node generate-kb-mdx.mjs

`generate-kb-mdx.mjs` also syncs the `kb/browse.mdx` author list from `/Users/sonle/Github/ai-thought-leadership/config/sources.yaml` (or `SOURCES_YAML_PATH` env var).

## Source Suggestions -> sources.yaml Workflow

Submissions from the app are stored in Supabase table `source_suggestions`.
The ingestion system still reads from `/Users/sonle/Github/ai-thought-leadership/config/sources.yaml`.
Use the bridge script below to keep them in sync.
Set `SUPABASE_SERVICE_ROLE_KEY` in your `.env` so the script can review/update suggestions.

### 1. Apply migration (once)

```bash
# in Supabase SQL editor or migration runner
supabase/migrations/004_source_suggestion_sync_tracking.sql
```

### 2. Review suggestions

```bash
cd scripts
npm run suggestions:list -- --status pending
npm run suggestions:set-status -- --status approved --ids <id1,id2>
```

### 3. Promote approved suggestions to sources.yaml

```bash
cd scripts
npm run suggestions:promote -- --sources-file /Users/sonle/Github/ai-thought-leadership/config/sources.yaml
```

Optional flags:
- `--dry-run` preview without writing
- `--activate` writes new sources with `active: true` (default is `false`)
- `--tag <tag-name>` default: `community-submitted`

The script also marks promoted rows in Supabase (`promoted_to_sources`, `promoted_source_id`, `promoted_at`) so they are not reprocessed.

### Admin UI for Source Suggestions

Once API admin env vars are set, open `/kb/admin-suggestions` in the docs app.

Required API env vars (Cloudflare Worker):
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_USER_IDS` (comma-separated Supabase auth user IDs allowed to moderate suggestions)
- `ADMIN_USER_EMAILS` (comma-separated emails; useful when user UUID is unknown)
