/**
 * index-chunks.mjs
 *
 * Splits each article into paragraph-level chunks and stores embeddings
 * in the article_chunks table. Run after generate-kb-mdx.mjs.
 *
 * Usage:
 *   cd scripts && node index-chunks.mjs
 *
 * Requires .env with:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   OPENAI_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !OPENAI_API_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY, OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const MIN_WORDS = 50;
const MAX_WORDS = 400;
const EMBED_BATCH_SIZE = 100; // OpenAI allows up to 2048, stay conservative

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * Strip MDX/markdown syntax from text before embedding.
 * Keeps prose, removes code fences, JSX, frontmatter, link syntax.
 */
function stripMdx(text) {
  return text
    .replace(/^---[\s\S]*?---/m, '')          // frontmatter
    .replace(/```[\s\S]*?```/g, '')            // code blocks
    .replace(/`[^`]+`/g, '')                   // inline code
    .replace(/<[^>]+>/g, '')                   // JSX/HTML tags
    .replace(/!\[.*?\]\(.*?\)/g, '')           // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // links → text
    .replace(/^#+\s+/gm, '')                   // headings (strip #)
    .replace(/^\s*[-*>]\s+/gm, '')             // bullets, blockquotes
    .replace(/\*\*([^*]+)\*\*/g, '$1')         // bold
    .replace(/\*([^*]+)\*/g, '$1')             // italic
    .replace(/\n{3,}/g, '\n\n')               // collapse extra newlines
    .trim();
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Split article content into chunks.
 *
 * Priority order:
 *   1. Heading boundaries (## / ###) — each section = one chunk
 *   2. Paragraph breaks (\n\n) — if section > MAX_WORDS
 *   3. Sentence boundaries — if paragraph > MAX_WORDS
 *
 * Chunks < MIN_WORDS are merged into the previous chunk.
 */
function splitIntoChunks(content) {
  // Extract everything after "## Full Article"
  const fullArticleMatch = content.match(/##\s+Full Article\s*\n([\s\S]*)/i);
  const body = fullArticleMatch ? fullArticleMatch[1] : content;

  if (!body.trim()) return [];

  // Split on ## / ### headings
  const sections = body.split(/(?=^#{2,3}\s)/m).filter(s => s.trim());

  const rawChunks = [];
  for (const section of sections) {
    if (wordCount(section) <= MAX_WORDS) {
      rawChunks.push(section.trim());
    } else {
      // Split by paragraph breaks
      const paragraphs = section.split(/\n\n+/).filter(p => p.trim());
      for (const para of paragraphs) {
        if (wordCount(para) <= MAX_WORDS) {
          rawChunks.push(para.trim());
        } else {
          // Split by sentences
          const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
          let current = '';
          for (const sentence of sentences) {
            if (wordCount(current + ' ' + sentence) > MAX_WORDS && current) {
              rawChunks.push(current.trim());
              current = sentence;
            } else {
              current += ' ' + sentence;
            }
          }
          if (current.trim()) rawChunks.push(current.trim());
        }
      }
    }
  }

  // Merge chunks below MIN_WORDS into previous
  const chunks = [];
  for (const chunk of rawChunks) {
    if (wordCount(chunk) < MIN_WORDS && chunks.length > 0) {
      chunks[chunks.length - 1] += '\n\n' + chunk;
    } else if (wordCount(chunk) >= MIN_WORDS) {
      chunks.push(chunk);
    }
    // discard very short orphan chunks with no predecessor
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Embedding
// ---------------------------------------------------------------------------

/**
 * Embed a batch of strings using text-embedding-3-small.
 * Returns embeddings in the same order as inputs.
 */
async function embedBatch(inputs) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: inputs,
    dimensions: 1536,
  });
  return response.data.map(d => d.embedding);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Fetching articles from Supabase...');
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, content')
    .order('id');

  if (error) {
    console.error('Failed to fetch articles:', error.message);
    process.exit(1);
  }

  console.log(`Found ${articles.length} articles`);

  let totalChunks = 0;
  let skippedArticles = 0;
  const allUpserts = [];

  for (const article of articles) {
    const content = article.content || '';
    const rawChunks = splitIntoChunks(content);

    if (rawChunks.length === 0) {
      // Fallback: embed the whole article as one chunk
      const summary = content.slice(0, 1000).trim();
      if (summary) rawChunks.push(summary);
      else { skippedArticles++; continue; }
    }

    // Prepare inputs for embedding: prepend title for context
    const embedInputs = rawChunks.map(c =>
      `${article.title} — ${stripMdx(c)}`
    );

    // Batch embed in groups
    const embeddings = [];
    for (let i = 0; i < embedInputs.length; i += EMBED_BATCH_SIZE) {
      const batch = embedInputs.slice(i, i + EMBED_BATCH_SIZE);
      const batchEmbeddings = await embedBatch(batch);
      embeddings.push(...batchEmbeddings);
    }

    // Build upsert rows (keep original chunk text, not stripped version)
    rawChunks.forEach((chunk, idx) => {
      allUpserts.push({
        article_id: article.id,
        content: chunk,
        chunk_index: idx,
        embedding: embeddings[idx],
      });
    });

    totalChunks += rawChunks.length;
    process.stdout.write(`  ✓ ${article.title.slice(0, 60)} → ${rawChunks.length} chunks\n`);
  }

  if (allUpserts.length === 0) {
    console.log('No chunks to upsert.');
    return;
  }

  console.log(`\nUpserting ${totalChunks} chunks into article_chunks...`);

  // Upsert in batches (Supabase has row limits per request)
  const UPSERT_BATCH = 200;
  for (let i = 0; i < allUpserts.length; i += UPSERT_BATCH) {
    const batch = allUpserts.slice(i, i + UPSERT_BATCH);
    const { error: upsertError } = await supabase
      .from('article_chunks')
      .upsert(batch, { onConflict: 'article_id,chunk_index' });

    if (upsertError) {
      console.error('Upsert failed:', upsertError.message);
      process.exit(1);
    }
  }

  console.log(`\nDone. ${articles.length - skippedArticles} articles → ${totalChunks} chunks indexed.`);
  if (skippedArticles > 0) {
    console.log(`Skipped ${skippedArticles} articles with no content.`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
