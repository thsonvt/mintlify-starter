#!/usr/bin/env node
/**
 * Generate MDX files for all Knowledge Base articles from Supabase
 * This creates:
 *   - Article MDX files with related articles section
 *   - Author index MDX files listing their articles
 *   - Topic index MDX files listing articles by topic
 *   - Search index JSON for offline Fuse.js search
 *
 * Usage:
 *   node scripts/generate-kb-mdx.mjs
 *
 * Environment variables required:
 *   SUPABASE_URL - Your Supabase project URL
 *   SUPABASE_ANON_KEY - Your Supabase anon key
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env files (for local development)
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../docs-assistant/.env') });
dotenv.config({ path: path.join(__dirname, '../docs-assistant/apps/api/.env') });
dotenv.config({ path: path.join(__dirname, '../docs-assistant/apps/api/.dev.vars') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables required');
  console.error('For local dev: Set in .env or docs-assistant/.env');
  console.error('For GitHub Actions: Set as repository secrets');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuration
const RELATED_ARTICLES_COUNT = 3;
const RELATED_ARTICLES_THRESHOLD = 0.3;

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[-\s]+/g, '-')
    .slice(0, 60);
}

/**
 * Detect and wrap code-like content in proper code fences.
 * This handles content from Sanity CMS that uses custom codeBlock components
 * which markdownify can't convert to standard markdown code blocks.
 */
function detectAndWrapCodeBlocks(text) {
  if (!text) return '';

  // Already has code blocks? Return as-is
  if (text.includes('```')) return text;

  const lines = text.split('\n');
  const result = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let codeLanguage = '';

  // Patterns that indicate start of code
  const codeStartPatterns = [
    /^(import|export|const|let|var|function|class|interface|type|async|await)\s/,
    /^(def|from|import|class|async|await)\s/,  // Python
    /^(package|import|public|private|func|type)\s/,  // Go/Java
    /^\s*(\/\/|\/\*|\*|#)\s/,  // Comments
    /^[a-zA-Z_]\w*\s*[({=:]/,  // Variable/function definitions
    /^\s*\{/,  // Object start
    /^\s*\[/,  // Array start
    /^servers$/,  // File tree patterns
    /^[├└│─\s]+/,  // Tree characters
  ];

  // Patterns that indicate we're in code
  const codePatterns = [
    /[{}\[\]();]$/,  // Ends with code punctuation
    /^\s{2,}/,  // Indented content
    /^[├└│─\s]+/,  // Tree characters
    /=>/,  // Arrow functions
    /\(\s*\)/,  // Empty parens
    /:\s*(string|number|boolean|any|void|Promise)/,  // TypeScript types
  ];

  // Detect language from content
  function detectLanguage(line) {
    if (/^(import|export|const|interface|type)\s/.test(line)) return 'typescript';
    if (/^(def|from|import)\s.*:/.test(line) || /^\s+def\s/.test(line)) return 'python';
    if (/^(package|func)\s/.test(line)) return 'go';
    if (/^<[a-zA-Z]/.test(line)) return 'html';
    return '';
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip "Copy" button artifacts
    if (trimmedLine === 'Copy') {
      if (inCodeBlock && codeBuffer.length > 0) {
        // End the code block before Copy
        result.push('```' + codeLanguage);
        result.push(...codeBuffer);
        result.push('```');
        codeBuffer = [];
        inCodeBlock = false;
        codeLanguage = '';
      }
      continue;
    }

    // Check if this line looks like code
    const looksLikeCodeStart = codeStartPatterns.some(p => p.test(trimmedLine));
    const looksLikeCode = codePatterns.some(p => p.test(line)) || trimmedLine.includes('  ');

    if (!inCodeBlock && looksLikeCodeStart) {
      // Start a new code block
      inCodeBlock = true;
      codeLanguage = detectLanguage(trimmedLine);
      codeBuffer = [line];
    } else if (inCodeBlock) {
      // Check if we should continue the code block
      if (trimmedLine === '' && codeBuffer.length > 0) {
        // Empty line - might be end of code or just spacing
        const nextLine = lines[i + 1]?.trim() || '';
        if (nextLine === 'Copy' || (!looksLikeCode && !codeStartPatterns.some(p => p.test(nextLine)))) {
          // End code block
          result.push('```' + codeLanguage);
          result.push(...codeBuffer);
          result.push('```');
          result.push('');
          codeBuffer = [];
          inCodeBlock = false;
          codeLanguage = '';
        } else {
          codeBuffer.push(line);
        }
      } else if (looksLikeCode || looksLikeCodeStart || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
        codeBuffer.push(line);
      } else {
        // End code block
        if (codeBuffer.length > 0) {
          result.push('```' + codeLanguage);
          result.push(...codeBuffer);
          result.push('```');
        }
        result.push(line);
        codeBuffer = [];
        inCodeBlock = false;
        codeLanguage = '';
      }
    } else {
      result.push(line);
    }
  }

  // Flush any remaining code
  if (codeBuffer.length > 0) {
    result.push('```' + codeLanguage);
    result.push(...codeBuffer);
    result.push('```');
  }

  return result.join('\n');
}

/**
 * Escape special characters in content to prevent MDX parsing errors.
 */
function escapeForMdx(text) {
  if (!text) return '';

  const codeBlockPattern = /(```[^\n]*\n[\s\S]*?```)/g;
  const parts = text.split(codeBlockPattern);

  const knownComponents = [
    'Info', 'Note', 'Tip', 'Warning', 'Card', 'CardGroup',
    'Tabs', 'Tab', 'Accordion', 'AccordionGroup', 'Frame',
    'Steps', 'Step'
  ];

  function escapeTag(match, tag) {
    if (knownComponents.includes(tag)) {
      return match;
    }
    return '&lt;' + tag;
  }

  const resultParts = parts.map(part => {
    if (part.startsWith('```')) {
      return part;
    } else {
      let escaped = part
        .replace(/\{/g, '&#123;')
        .replace(/\}/g, '&#125;');
      // Escape < followed by numbers (like <10)
      escaped = escaped.replace(/<(\d)/g, '&lt;$1');
      // Escape closing tags </tag>
      escaped = escaped.replace(/<\/([A-Za-z])/g, '&lt;/$1');
      // Escape opening tags <tag (but not known Mintlify components)
      escaped = escaped.replace(/<([A-Za-z][A-Za-z0-9]*)/g, escapeTag);
      // Escape any remaining < that aren't followed by letters (handles truncated tags at end of line)
      escaped = escaped.replace(/<(?![A-Za-z])/g, '&lt;');
      return escaped;
    }
  });

  return resultParts.join('');
}

function escapeTitle(title) {
  // For YAML single-quoted strings: only single quotes need escaping (doubled)
  return title ? title.replace(/'/g, "''") : '';
}

function escapeTitleAttr(title) {
  // For JSX double-quoted attributes: escape double quotes as HTML entity
  return title ? title.replace(/"/g, '&quot;') : '';
}

/**
 * Strip HTML tags from text for use in frontmatter.
 */
function stripHtml(text) {
  if (!text) return '';
  let clean = text
    // Remove complete HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove escaped HTML tags
    .replace(/&lt;[^;]*?(?:&gt;|$)/g, '')
    // Remove any remaining < or > or partial tags
    .replace(/<[^>]*$/g, '') // Incomplete opening tag at end
    .replace(/^[^<]*>/g, '') // Incomplete closing tag at start
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '') // Remove numeric entities
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Final cleanup - remove any stray < or > that might cause issues
  clean = clean.replace(/[<>]/g, '');

  return clean;
}

function getArticleMdxPath(article) {
  const slug = generateSlug(article.title);
  const urlHash = article.id.slice(0, 8);
  return `/kb/articles/${slug}-${urlHash}`;
}

function generateArticleMdx(article, relatedArticles = []) {
  // Strip HTML from summary first, THEN escape for MDX
  // This ensures no raw HTML tags appear in the rendered output
  const cleanSummary = stripHtml(article.summary || '');
  const summary = escapeForMdx(cleanSummary);
  // First detect and wrap code blocks, then escape special chars
  const contentWithCodeBlocks = detectAndWrapCodeBlocks(article.content || '');
  const content = escapeForMdx(contentWithCodeBlocks);

  // Use the same clean summary for description
  const cleanDescription = cleanSummary.slice(0, 150);

  let mdx = `---
title: '${escapeTitle(article.title)}'
description: '${escapeTitle(cleanDescription)}'
icon: 'newspaper'
author: '${article.author}'
authorId: '${article.author_id}'
published: '${article.published}'
sourceUrl: '${article.url}'
topics: ${JSON.stringify(article.topics || [])}
diataxisType: '${article.diataxis_type || 'explanation'}'
---

<Info>
**Original**: [${article.author}](${article.url}) · ${article.published}
</Info>

## Summary

${summary}

`;

  if (article.key_quotes && article.key_quotes.length > 0) {
    mdx += `## Key Insights\n\n`;
    for (const quote of article.key_quotes) {
      const quoteText = escapeForMdx(quote.text);
      const quoteContext = escapeForMdx(quote.context);
      mdx += `> "${quoteText}"\n>\n`;
      mdx += `> — ${quoteContext}\n\n`;
    }
  }

  if (article.topics && article.topics.length > 0) {
    mdx += `## Topics\n\n`;
    for (const topic of article.topics) {
      const topicSlug = generateSlug(topic);
      mdx += `- [${topic}](/kb/topics/${topicSlug})\n`;
    }
    mdx += '\n';
  }

  mdx += `---\n\n`;
  mdx += `## Full Article\n\n`;
  mdx += content || '_Content not available_';
  mdx += `\n\n`;

  if (relatedArticles.length > 0) {
    mdx += `---\n\n`;
    mdx += `## Related Articles\n\n`;
    mdx += `<CardGroup cols={1}>\n`;
    for (const related of relatedArticles) {
      const relatedPath = getArticleMdxPath(related);
      const similarity = Math.round((related.similarity || 0) * 100);
      mdx += `  <Card
    title="${escapeTitleAttr(related.title)}"
    icon="newspaper"
    href="${relatedPath}"
  >
    ${related.author} · ${related.diataxis_type || 'Explanation'} · ${similarity}% similar
  </Card>\n`;
    }
    mdx += `</CardGroup>\n\n`;
  }

  mdx += `---\n\n`;
  mdx += `<Note>\nOriginally published at [${article.url}](${article.url}).\n</Note>\n`;

  return mdx;
}

function generateAuthorMdx(authorId, authorName, articles) {
  const sortedArticles = [...articles].sort((a, b) =>
    new Date(b.published) - new Date(a.published)
  );

  const latestDate = sortedArticles[0]?.published || 'Unknown';
  const articleCount = articles.length;

  const allTopics = articles.flatMap(a => a.topics || []);
  const topicCounts = {};
  allTopics.forEach(t => { topicCounts[t] = (topicCounts[t] || 0) + 1; });
  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic);

  const description = topTopics.length > 0
    ? `Articles about ${topTopics.join(', ')}`
    : 'Thought leadership articles';

  let mdx = `---
title: '${escapeTitle(authorName)}'
description: '${escapeTitle(description)}'
icon: 'user'
---

# ${authorName}

${description}.

<Info>
**${articleCount} article${articleCount !== 1 ? 's' : ''}** · Last updated: ${latestDate}
</Info>

## Articles

<CardGroup cols={1}>
`;

  for (const article of sortedArticles) {
    const articlePath = getArticleMdxPath(article);
    const topics = (article.topics || []).slice(0, 3).join(', ');
    mdx += `  <Card
    title="${escapeTitleAttr(article.title)}"
    icon="newspaper"
    href="${articlePath}"
  >
    ${article.diataxis_type || 'Explanation'} · ${article.published}${topics ? ` · ${topics}` : ''}
  </Card>\n`;
  }

  mdx += `</CardGroup>\n`;

  return mdx;
}

function generateTopicMdx(topic, articles) {
  const sortedArticles = [...articles].sort((a, b) =>
    new Date(b.published) - new Date(a.published)
  );

  const articleCount = articles.length;
  const topicSlug = generateSlug(topic);

  // Get unique authors
  const authors = [...new Set(articles.map(a => a.author))];
  const authorList = authors.slice(0, 3).join(', ');

  let mdx = `---
title: '${escapeTitle(topic)}'
description: 'Articles about ${escapeTitle(topic)}'
icon: 'tag'
---

# ${topic}

${articleCount} article${articleCount !== 1 ? 's' : ''} about ${topic}.

<Info>
Contributors: ${authorList}${authors.length > 3 ? ` and ${authors.length - 3} more` : ''}
</Info>

## Articles

<CardGroup cols={1}>
`;

  for (const article of sortedArticles) {
    const articlePath = getArticleMdxPath(article);
    mdx += `  <Card
    title="${escapeTitleAttr(article.title)}"
    icon="newspaper"
    href="${articlePath}"
  >
    ${article.author} · ${article.diataxis_type || 'Explanation'} · ${article.published}
  </Card>\n`;
  }

  mdx += `</CardGroup>\n\n`;

  // Add link to semantic search for more results
  mdx += `<Tip>\n`;
  mdx += `Want more? [Search for "${topic}" →](/kb/search?topic=${encodeURIComponent(topic)})\n`;
  mdx += `</Tip>\n`;

  return mdx;
}

function generateSearchIndex(articles) {
  return articles.map(article => ({
    id: article.id,
    title: article.title,
    summary: (article.summary || '').slice(0, 300),
    author: article.author,
    authorId: article.author_id,
    published: article.published,
    topics: article.topics || [],
    diataxisType: article.diataxis_type || 'explanation',
    path: getArticleMdxPath(article),
    sourceUrl: article.url,
  }));
}

async function getRelatedArticles(articleId, embedding) {
  if (!embedding) return [];

  try {
    const { data, error } = await supabase.rpc('match_articles', {
      query_embedding: embedding,
      match_threshold: RELATED_ARTICLES_THRESHOLD,
      match_count: RELATED_ARTICLES_COUNT + 1,
      filter_authors: null,
      filter_topics: null,
      filter_diataxis_type: null,
      filter_date_from: null,
      filter_date_to: null,
    });

    if (error) {
      console.error(`    Warning: Error fetching related articles:`, error.message);
      return [];
    }

    return (data || [])
      .filter(a => a.id !== articleId)
      .slice(0, RELATED_ARTICLES_COUNT);
  } catch (err) {
    console.error(`    Warning: Error fetching related articles:`, err.message);
    return [];
  }
}

async function main() {
  console.log('Fetching articles from Supabase...');

  const { data: articles, error } = await supabase
    .from('articles')
    .select('*')
    .order('published', { ascending: false });

  if (error) {
    console.error('Error fetching articles:', error);
    process.exit(1);
  }

  if (!articles || articles.length === 0) {
    console.log('No articles found in Supabase');
    process.exit(0);
  }

  console.log(`Found ${articles.length} articles`);

  // Ensure output directories exist
  const articlesDir = path.join(__dirname, '../kb/articles');
  const authorsDir = path.join(__dirname, '../kb/authors');
  const topicsDir = path.join(__dirname, '../kb/topics');

  for (const dir of [articlesDir, authorsDir, topicsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Group articles by author and topic
  const articlesByAuthor = {};
  const articlesByTopic = {};

  for (const article of articles) {
    // Group by author
    const authorId = article.author_id || 'unknown';
    if (!articlesByAuthor[authorId]) {
      articlesByAuthor[authorId] = {
        name: article.author || 'Unknown',
        articles: []
      };
    }
    articlesByAuthor[authorId].articles.push(article);

    // Group by topic
    for (const topic of article.topics || []) {
      if (!articlesByTopic[topic]) {
        articlesByTopic[topic] = [];
      }
      articlesByTopic[topic].push(article);
    }
  }

  console.log(`Found ${Object.keys(articlesByAuthor).length} authors`);
  console.log(`Found ${Object.keys(articlesByTopic).length} topics`);

  // Generate MDX for each article
  console.log('\nGenerating article MDX files...');
  for (const article of articles) {
    const slug = generateSlug(article.title);
    const urlHash = article.id.slice(0, 8);
    const filename = `${slug}-${urlHash}.mdx`;
    const filepath = path.join(articlesDir, filename);
    const mdxPath = `/kb/articles/${slug}-${urlHash}`;

    console.log(`  ${filename}`);

    const relatedArticles = await getRelatedArticles(article.id, article.embedding);
    const mdx = generateArticleMdx(article, relatedArticles);
    fs.writeFileSync(filepath, mdx);

    // Update mdx_path in Supabase
    const { error: updateError } = await supabase
      .from('articles')
      .update({ mdx_path: mdxPath })
      .eq('id', article.id);

    if (updateError) {
      console.error(`    Warning: Failed to update mdx_path:`, updateError.message);
    }
  }

  // Generate author index pages
  console.log('\nGenerating author MDX files...');
  for (const [authorId, authorData] of Object.entries(articlesByAuthor)) {
    const filename = `${authorId}.mdx`;
    const filepath = path.join(authorsDir, filename);

    console.log(`  ${filename} (${authorData.articles.length} articles)`);

    const mdx = generateAuthorMdx(authorId, authorData.name, authorData.articles);
    fs.writeFileSync(filepath, mdx);
  }

  // Generate topic index pages
  console.log('\nGenerating topic MDX files...');
  for (const [topic, topicArticles] of Object.entries(articlesByTopic)) {
    const slug = generateSlug(topic);
    const filename = `${slug}.mdx`;
    const filepath = path.join(topicsDir, filename);

    console.log(`  ${filename} (${topicArticles.length} articles)`);

    const mdx = generateTopicMdx(topic, topicArticles);
    fs.writeFileSync(filepath, mdx);
  }

  // Generate search index for offline Fuse.js
  console.log('\nGenerating search index...');
  const searchIndex = generateSearchIndex(articles);

  // Write JSON version (backup)
  const searchIndexJsonPath = path.join(__dirname, '../search-index.json');
  fs.writeFileSync(searchIndexJsonPath, JSON.stringify(searchIndex, null, 2));

  // Write JS version (for Mintlify which doesn't serve arbitrary JSON)
  const searchIndexJsPath = path.join(__dirname, 'search-index-data.js');
  fs.writeFileSync(searchIndexJsPath, `window.AI_SEARCH_INDEX = ${JSON.stringify(searchIndex)};`);

  console.log(`  search-index.json (${searchIndex.length} entries)`);

  // Output summary
  console.log('\n' + '='.repeat(50));
  console.log('Generation complete!');
  console.log(`   ${articles.length} article MDX files`);
  console.log(`   ${Object.keys(articlesByAuthor).length} author MDX files`);
  console.log(`   ${Object.keys(articlesByTopic).length} topic MDX files`);
  console.log(`   1 search index file`);
}

main().catch(console.error);
