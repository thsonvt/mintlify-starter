/**
 * scrape-sources.mjs
 *
 * Daily content scraper. Fetches articles from active sources in Supabase,
 * extracts metadata via GPT-4, generates embeddings, and stores in the
 * articles table. Deduplicates by URL.
 *
 * Usage:
 *   cd scripts && node scrape-sources.mjs
 *
 * Requires .env with:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   OPENAI_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import Parser from 'rss-parser';
import { extract } from '@extractus/article-extractor';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import crypto from 'crypto';

// Load .env from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !OPENAI_API_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY, OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const rssParser = new Parser();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUrlHash(url) {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 8);
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[-\s]+/g, '-')
    .slice(0, 60);
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, maxLen) {
  if (!text || text.length <= maxLen) return text || '';
  return text.slice(0, maxLen) + '...';
}

// ---------------------------------------------------------------------------
// RSS feed fetching
// ---------------------------------------------------------------------------

async function fetchRssArticles(source) {
  try {
    const feed = await rssParser.parseURL(source.rss_url);
    const items = (feed.items || []).slice(0, 10);

    return items.map(item => ({
      url: item.link,
      title: item.title || 'Untitled',
      published: item.isoDate || item.pubDate || null,
      content: item['content:encoded'] || item.content || item.contentSnippet || '',
    })).filter(a => a.url);
  } catch (err) {
    console.error(`  RSS fetch failed for ${source.name}: ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Web page extraction
// ---------------------------------------------------------------------------

async function fetchWebArticles(source) {
  try {
    const article = await extract(source.url);
    if (!article) return [];

    // For a blog index page, article-extractor may return the page itself.
    // We treat it as a single article if it has content.
    if (article.url && article.content) {
      return [{
        url: article.url,
        title: article.title || 'Untitled',
        published: article.published || null,
        content: article.content || '',
      }];
    }

    return [];
  } catch (err) {
    console.error(`  Web extract failed for ${source.name}: ${err.message}`);
    return [];
  }
}

async function extractFullArticle(url) {
  try {
    const article = await extract(url);
    if (!article) return null;
    return {
      title: article.title || 'Untitled',
      content: article.content || '',
      published: article.published || null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GPT-4 metadata extraction
// ---------------------------------------------------------------------------

async function extractMetadata(title, content, authorName) {
  const cleanContent = stripHtml(content);
  const truncatedContent = truncate(cleanContent, 6000);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      messages: [{
        role: 'system',
        content: `You extract metadata from articles. Return valid JSON only.`
      }, {
        role: 'user',
        content: `Extract metadata from this article.

Title: ${title}
Author: ${authorName}
Content (truncated):
${truncatedContent}

Return JSON with:
- summary: 1-2 sentence summary (max 200 chars)
- topics: array of 2-5 topic slugs (lowercase, hyphenated, e.g. "ai-agents", "prompt-engineering")
- diataxis_type: one of "tutorial", "how-to", "reference", "explanation"
- key_quotes: array of 1-3 objects with {text, context} — notable quotes from the article`
      }],
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0].message.content);

    return {
      summary: truncate(result.summary || '', 500),
      topics: Array.isArray(result.topics) ? result.topics.slice(0, 5) : [],
      diataxis_type: ['tutorial', 'how-to', 'reference', 'explanation'].includes(result.diataxis_type)
        ? result.diataxis_type
        : 'explanation',
      key_quotes: Array.isArray(result.key_quotes) ? result.key_quotes.slice(0, 3) : [],
    };
  } catch (err) {
    console.error(`  GPT-4 metadata extraction failed: ${err.message}`);
    return {
      summary: truncate(stripHtml(content), 200),
      topics: [],
      diataxis_type: 'explanation',
      key_quotes: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Embedding generation
// ---------------------------------------------------------------------------

async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: truncate(text, 8000),
      dimensions: 1536,
    });
    return response.data[0].embedding;
  } catch (err) {
    console.error(`  Embedding generation failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main scraper loop
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Content Scraper ===\n');

  // 1. Fetch active sources
  const { data: sources, error: srcError } = await supabase
    .from('sources')
    .select('*')
    .eq('active', true);

  if (srcError) {
    console.error('Failed to fetch sources:', srcError.message);
    process.exit(1);
  }

  console.log(`Found ${sources.length} active sources\n`);

  let totalNew = 0;
  let totalSkipped = 0;
  let failedSources = 0;

  for (const source of sources) {
    console.log(`\n📰 ${source.name} (${source.id})`);

    try {
      // 2a. Fetch candidate articles
      let candidates = [];

      if (source.rss_url) {
        candidates = await fetchRssArticles(source);
        console.log(`  RSS: ${candidates.length} items`);
      } else {
        candidates = await fetchWebArticles(source);
        console.log(`  Web: ${candidates.length} items`);
      }

      if (candidates.length === 0) {
        console.log('  No articles found');
        continue;
      }

      // 2b. Filter out duplicates (already in articles table)
      const urls = candidates.map(a => a.url).filter(Boolean);
      const { data: existing } = await supabase
        .from('articles')
        .select('url')
        .in('url', urls);

      const existingUrls = new Set((existing || []).map(a => a.url));
      const newCandidates = candidates.filter(a => !existingUrls.has(a.url));

      const skipped = candidates.length - newCandidates.length;
      if (skipped > 0) console.log(`  Skipped ${skipped} existing articles`);

      if (newCandidates.length === 0) {
        totalSkipped += skipped;
        continue;
      }

      // 2c. Process each new article
      for (const candidate of newCandidates) {
        console.log(`  → ${truncate(candidate.title, 60)}`);

        // If content is thin (from RSS summary), try full extraction
        let content = candidate.content;
        let title = candidate.title;
        const cleanContent = stripHtml(content);

        if (cleanContent.length < 500 && candidate.url) {
          console.log('    Fetching full article...');
          const full = await extractFullArticle(candidate.url);
          if (full) {
            content = full.content || content;
            title = full.title || title;
            if (!candidate.published && full.published) {
              candidate.published = full.published;
            }
          }
        }

        // GPT-4 metadata
        console.log('    Extracting metadata...');
        const metadata = await extractMetadata(title, content, source.name);

        // Embedding
        console.log('    Generating embedding...');
        const embeddingInput = `${title} — ${metadata.summary} — ${stripHtml(content).slice(0, 4000)}`;
        const embedding = await generateEmbedding(embeddingInput);

        if (!embedding) {
          console.log('    ❌ Skipped (no embedding)');
          continue;
        }

        // Build article row
        const urlHash = getUrlHash(candidate.url);
        const slug = generateSlug(title);
        const mdxPath = `/kb/articles/${slug}-${urlHash}`;

        const articleData = {
          url: candidate.url,
          url_hash: urlHash,
          title,
          author: source.name,
          author_id: source.id,
          published: candidate.published || new Date().toISOString().split('T')[0],
          fetched: new Date().toISOString().split('T')[0],
          summary: metadata.summary,
          content: stripHtml(content),
          topics: metadata.topics,
          key_quotes: metadata.key_quotes,
          stance: {},
          evolution_note: '',
          tags: source.tags || [],
          diataxis_type: metadata.diataxis_type,
          mdx_path: mdxPath,
          embedding,
        };

        // Insert (not upsert — we already filtered duplicates)
        const { error: insertError } = await supabase
          .from('articles')
          .insert(articleData);

        if (insertError) {
          // Could be a race condition duplicate
          if (insertError.message?.includes('duplicate')) {
            console.log('    ⏭️  Duplicate (race)');
            totalSkipped++;
          } else {
            console.error(`    ❌ Insert failed: ${insertError.message}`);
          }
          continue;
        }

        console.log('    ✅ Saved');
        totalNew++;
      }

      totalSkipped += skipped;

    } catch (err) {
      console.error(`  ❌ Source failed: ${err.message}`);
      failedSources++;
    }
  }

  // 3. Summary
  console.log('\n' + '='.repeat(50));
  console.log(`✅ Scrape complete: ${totalNew} new articles from ${sources.length} sources`);
  if (totalSkipped > 0) console.log(`   Skipped: ${totalSkipped} existing`);
  if (failedSources > 0) console.log(`   Failed sources: ${failedSources}`);

  // Non-zero exit only if ALL sources failed
  if (failedSources === sources.length && sources.length > 0) {
    console.error('All sources failed!');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
