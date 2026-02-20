/**
 * Thought Leadership Knowledge Base API
 * Provides semantic search and content gap analysis
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Types
interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  OPENAI_API_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SERVICE_KEY?: string;
  ADMIN_USER_IDS?: string;
  ADMIN_USER_EMAILS?: string;
}

interface Highlight {
  id: string;
  user_id: string;
  article_id: string;
  xpath: string;
  start_offset: number;
  end_offset: number;
  selected_text: string;
  note: string | null;
  share_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateHighlightRequest {
  article_id: string;
  xpath: string;
  start_offset: number;
  end_offset: number;
  selected_text: string;
  note?: string;
}

interface UpdateHighlightRequest {
  note?: string;
}

interface SearchRequest {
  query: string;
  filters?: {
    authors?: string[];
    topics?: string[];
    diataxis_type?: string;
    date_from?: string;
    date_to?: string;
  };
  limit?: number;
}

interface Article {
  id: string;
  url: string;
  title: string;
  author: string;
  author_id: string;
  published: string;
  summary: string;
  topics: string[];
  key_quotes: { text: string; context: string }[];
  diataxis_type: string;
  tags: string[];
  similarity?: number;
  mdx_path?: string;
  source_type?: string;
  matching_excerpt?: string;
  fragment?: string;
}

interface FilterOptions {
  authors: { id: string; name: string; count: number }[];
  topics: { name: string; count: number }[];
  diataxis_types: { type: string; count: number }[];
  date_range: { min: string; max: string };
}

interface ContentGap {
  topic: string;
  tutorial: number;
  'how-to': number;
  reference: number;
  explanation: number;
}

type SuggestionStatus = 'pending' | 'approved' | 'rejected';
const VALID_SUGGESTION_STATUSES: SuggestionStatus[] = ['pending', 'approved', 'rejected'];

// Initialize Hono app
const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Helper to get authenticated Supabase client and user from JWT token
async function getAuthenticatedClient(
  env: Env,
  authHeader: string | undefined
): Promise<{ supabase: SupabaseClient; user: { id: string; email?: string } } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);

  // Create Supabase client with the user's access token
  // This ensures auth.uid() works correctly in RLS policies
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return { supabase, user: { id: user.id, email: user.email || undefined } };
}

function parseAdminUserIds(raw: string | undefined): Set<string> {
  return new Set(
    (raw || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  );
}

function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw || '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  );
}

function parseJwtRole(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

async function getAdminClient(
  env: Env,
  authHeader: string | undefined
): Promise<
  | { adminSupabase: SupabaseClient; userId: string }
  | { error: { status: 401 | 403 | 500; message: string } }
> {
  const auth = await getAuthenticatedClient(env, authHeader);
  if (!auth) {
    return { error: { status: 401, message: 'Unauthorized' } };
  }

  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!serviceRoleKey) {
    return { error: { status: 500, message: 'Admin API not configured (missing service role key)' } };
  }

  const serviceRole = parseJwtRole(serviceRoleKey);
  if (serviceRole !== 'service_role') {
    return { error: { status: 500, message: 'Admin API not configured (service role key is invalid)' } };
  }

  const adminIds = parseAdminUserIds(env.ADMIN_USER_IDS);
  const adminEmails = parseAdminEmails(env.ADMIN_USER_EMAILS);
  if (adminIds.size === 0 && adminEmails.size === 0) {
    return { error: { status: 500, message: 'Admin API not configured (missing ADMIN_USER_IDS/ADMIN_USER_EMAILS)' } };
  }

  const normalizedEmail = auth.user.email?.toLowerCase();
  const allowedById = adminIds.has(auth.user.id);
  const allowedByEmail = Boolean(normalizedEmail && adminEmails.has(normalizedEmail));
  if (!allowedById && !allowedByEmail) {
    return { error: { status: 403, message: 'Forbidden: admin access required' } };
  }

  const adminSupabase = createClient(env.SUPABASE_URL, serviceRoleKey);
  return { adminSupabase, userId: auth.user.id };
}

// Health check
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'thought-leadership-api',
    version: '0.1.0',
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'healthy' });
});

/**
 * POST /api/search
 * Semantic search with optional filters
 */
app.post('/api/search', async (c) => {
  const env = c.env;

  try {
    const body = await c.req.json<SearchRequest>();
    const { query, filters = {}, limit = 10 } = body;

    if (!query || query.trim().length < 2) {
      return c.json({ error: 'Query must be at least 2 characters' }, 400);
    }

    // Initialize clients
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    // Generate embedding for query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      dimensions: 1536,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Helper to generate MDX path from title and ID
    const generateMdxPath = (title: string, id: string): string => {
      const slug = title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[-\s]+/g, '-')
        .slice(0, 60);
      const urlHash = id.slice(0, 8);
      return `/kb/articles/${slug}-${urlHash}`;
    };

    // Strip markdown syntax from text for clean display
    const stripMarkdown = (text: string): string => {
      return text
        .replace(/^#{1,6}\s+/gm, '')          // headings
        .replace(/\*\*([^*]+)\*\*/g, '$1')    // bold
        .replace(/\*([^*]+)\*/g, '$1')         // italic
        .replace(/`[^`]+`/g, '')               // inline code
        .replace(/!\[.*?\]\(.*?\)/g, '')        // images
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
        .replace(/^\s*[-*>]\s+/gm, '')         // bullets, blockquotes
        .replace(/^\d+\.\s+/gm, '')            // numbered lists
        .replace(/\n{2,}/g, ' ')               // collapse newlines
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Helper to build a Text Fragment from chunk text (first 8 words of cleaned text)
    const buildFragment = (text: string): string => {
      const clean = stripMarkdown(text);
      const words = clean.split(' ').slice(0, 8).join(' ');
      return encodeURIComponent(words);
    };

    // Search at chunk level — returns top 20 chunks across all articles
    const { data: chunks, error } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 20,
    });

    if (error) {
      console.error('Supabase error:', error);
      return c.json({ error: 'Search failed', details: error.message }, 500);
    }

    // Group by article_id — keep the highest-similarity chunk per article
    const bestByArticle = new Map<string, any>();
    for (const chunk of (chunks || [])) {
      const existing = bestByArticle.get(chunk.article_id);
      if (!existing || chunk.similarity > existing.similarity) {
        bestByArticle.set(chunk.article_id, chunk);
      }
    }

    // Fetch full article metadata for the matched articles
    const articleIds = Array.from(bestByArticle.keys()).slice(0, limit);
    const { data: articles, error: articleError } = await supabase
      .from('articles')
      .select('id, url, title, author, author_id, published, summary, topics, key_quotes, diataxis_type, tags, mdx_path')
      .in('id', articleIds);

    if (articleError) {
      console.error('Article fetch error:', articleError);
      return c.json({ error: 'Search failed', details: articleError.message }, 500);
    }

    // Merge chunk data with article metadata, sorted by similarity descending
    const results: Article[] = (articles || [])
      .map((article: any) => {
        const chunk = bestByArticle.get(article.id);
        const excerpt = stripMarkdown(chunk.content as string).slice(0, 200);
        return {
          id: article.id,
          url: article.url,
          title: article.title,
          author: article.author,
          author_id: article.author_id,
          published: article.published,
          summary: article.summary,
          topics: article.topics || [],
          key_quotes: article.key_quotes || [],
          diataxis_type: article.diataxis_type,
          tags: article.tags || [],
          similarity: Math.round(chunk.similarity * 100) / 100,
          mdx_path: article.mdx_path || generateMdxPath(article.title, article.id),
          source_type: 'knowledge-base',
          matching_excerpt: excerpt,
          fragment: buildFragment(chunk.content),
        };
      })
      .sort((a: Article, b: Article) => (b.similarity ?? 0) - (a.similarity ?? 0));

    return c.json({
      query,
      results,
      total: results.length,
    });

  } catch (err) {
    console.error('Search error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/filters
 * Returns available filter options
 */
app.get('/api/filters', async (c) => {
  const env = c.env;

  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    // Get all articles for aggregation
    const { data: articles, error } = await supabase
      .from('articles')
      .select('author, author_id, topics, diataxis_type, published');

    if (error) {
      return c.json({ error: 'Failed to fetch filters', details: error.message }, 500);
    }

    // Aggregate authors
    const authorMap = new Map<string, { name: string; count: number }>();
    const topicMap = new Map<string, number>();
    const diataxisMap = new Map<string, number>();
    let minDate = '9999-12-31';
    let maxDate = '0000-01-01';

    for (const article of articles || []) {
      // Authors
      if (article.author_id) {
        const existing = authorMap.get(article.author_id);
        if (existing) {
          existing.count++;
        } else {
          authorMap.set(article.author_id, { name: article.author, count: 1 });
        }
      }

      // Topics
      for (const topic of article.topics || []) {
        topicMap.set(topic, (topicMap.get(topic) || 0) + 1);
      }

      // Diátaxis types
      if (article.diataxis_type) {
        diataxisMap.set(article.diataxis_type, (diataxisMap.get(article.diataxis_type) || 0) + 1);
      }

      // Date range
      if (article.published) {
        if (article.published < minDate) minDate = article.published;
        if (article.published > maxDate) maxDate = article.published;
      }
    }

    const filters: FilterOptions = {
      authors: Array.from(authorMap.entries())
        .map(([id, { name, count }]) => ({ id, name, count }))
        .sort((a, b) => b.count - a.count),
      topics: Array.from(topicMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      diataxis_types: Array.from(diataxisMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      date_range: {
        min: minDate === '9999-12-31' ? '' : minDate,
        max: maxDate === '0000-01-01' ? '' : maxDate,
      },
    };

    return c.json(filters);

  } catch (err) {
    console.error('Filters error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/gaps
 * Returns content gap matrix (topic × diataxis_type)
 */
app.get('/api/gaps', async (c) => {
  const env = c.env;

  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    // Get all articles
    const { data: articles, error } = await supabase
      .from('articles')
      .select('topics, diataxis_type');

    if (error) {
      return c.json({ error: 'Failed to fetch gaps', details: error.message }, 500);
    }

    // Build gap matrix
    const gapMatrix = new Map<string, ContentGap>();

    for (const article of articles || []) {
      const diataxisType = article.diataxis_type || 'unknown';

      for (const topic of article.topics || []) {
        if (!gapMatrix.has(topic)) {
          gapMatrix.set(topic, {
            topic,
            tutorial: 0,
            'how-to': 0,
            reference: 0,
            explanation: 0,
          });
        }

        const gap = gapMatrix.get(topic)!;
        if (diataxisType in gap) {
          (gap as any)[diataxisType]++;
        }
      }
    }

    // Convert to array and sort by total coverage
    const gaps = Array.from(gapMatrix.values())
      .map(gap => ({
        ...gap,
        total: gap.tutorial + gap['how-to'] + gap.reference + gap.explanation,
      }))
      .sort((a, b) => b.total - a.total);

    // Calculate summary stats
    const summary = {
      total_topics: gaps.length,
      total_articles: articles?.length || 0,
      by_type: {
        tutorial: gaps.reduce((sum, g) => sum + g.tutorial, 0),
        'how-to': gaps.reduce((sum, g) => sum + g['how-to'], 0),
        reference: gaps.reduce((sum, g) => sum + g.reference, 0),
        explanation: gaps.reduce((sum, g) => sum + g.explanation, 0),
      },
      gaps_identified: gaps.filter(g =>
        g.tutorial === 0 || g['how-to'] === 0 || g.reference === 0 || g.explanation === 0
      ).length,
    };

    return c.json({ gaps, summary });

  } catch (err) {
    console.error('Gaps error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/article/:id
 * Returns full article details with related articles
 */
app.get('/api/article/:id', async (c) => {
  const env = c.env;
  const id = c.req.param('id');

  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    // Get the article
    const { data: article, error } = await supabase
      .from('articles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !article) {
      return c.json({ error: 'Article not found' }, 404);
    }

    // Remove embedding from response (too large)
    const { embedding, ...articleData } = article;

    return c.json(articleData);

  } catch (err) {
    console.error('Article error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ============================================
// HIGHLIGHTS API
// ============================================

/**
 * GET /api/highlights
 * Get all highlights for the authenticated user
 * Optional: ?article_id=xxx to filter by article
 */
app.get('/api/highlights', async (c) => {
  const env = c.env;

  try {
    const auth = await getAuthenticatedClient(env, c.req.header('Authorization'));

    if (!auth) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { supabase, user } = auth;

    const articleId = c.req.query('article_id');

    let query = supabase
      .from('highlights')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (articleId) {
      query = query.eq('article_id', articleId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Highlights fetch error:', error);
      return c.json({ error: 'Failed to fetch highlights' }, 500);
    }

    return c.json({ highlights: data || [] });

  } catch (err) {
    console.error('Highlights error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/highlights
 * Create a new highlight
 */
app.post('/api/highlights', async (c) => {
  const env = c.env;

  try {
    const auth = await getAuthenticatedClient(env, c.req.header('Authorization'));

    if (!auth) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { supabase, user } = auth;

    const body = await c.req.json<CreateHighlightRequest>();

    // Validate required fields
    if (!body.article_id || !body.xpath || body.start_offset === undefined ||
        body.end_offset === undefined || !body.selected_text) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Validate text length (max 500 chars)
    if (body.selected_text.length > 500) {
      return c.json({ error: 'Selection too long (max 500 characters)' }, 400);
    }

    const { data, error } = await supabase
      .from('highlights')
      .insert({
        user_id: user.id,
        article_id: body.article_id,
        xpath: body.xpath,
        start_offset: body.start_offset,
        end_offset: body.end_offset,
        selected_text: body.selected_text,
        note: body.note || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Highlight create error:', error);
      return c.json({ error: 'Failed to create highlight' }, 500);
    }

    return c.json({ highlight: data }, 201);

  } catch (err) {
    console.error('Create highlight error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * PATCH /api/highlights/:id
 * Update a highlight (note only)
 */
app.patch('/api/highlights/:id', async (c) => {
  const env = c.env;
  const highlightId = c.req.param('id');

  try {
    const auth = await getAuthenticatedClient(env, c.req.header('Authorization'));

    if (!auth) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { supabase, user } = auth;

    const body = await c.req.json<UpdateHighlightRequest>();

    const { data, error } = await supabase
      .from('highlights')
      .update({ note: body.note ?? null })
      .eq('id', highlightId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Highlight update error:', error);
      return c.json({ error: 'Failed to update highlight' }, 500);
    }

    if (!data) {
      return c.json({ error: 'Highlight not found' }, 404);
    }

    return c.json({ highlight: data });

  } catch (err) {
    console.error('Update highlight error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * DELETE /api/highlights/:id
 * Delete a highlight
 */
app.delete('/api/highlights/:id', async (c) => {
  const env = c.env;
  const highlightId = c.req.param('id');

  try {
    const auth = await getAuthenticatedClient(env, c.req.header('Authorization'));

    if (!auth) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { supabase, user } = auth;

    const { error } = await supabase
      .from('highlights')
      .delete()
      .eq('id', highlightId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Highlight delete error:', error);
      return c.json({ error: 'Failed to delete highlight' }, 500);
    }

    return c.json({ success: true });

  } catch (err) {
    console.error('Delete highlight error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/highlights/:id/share
 * Generate a share link for a highlight
 */
app.post('/api/highlights/:id/share', async (c) => {
  const env = c.env;
  const highlightId = c.req.param('id');

  try {
    const auth = await getAuthenticatedClient(env, c.req.header('Authorization'));

    if (!auth) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { supabase, user } = auth;

    // Generate a short share ID
    const shareId = crypto.randomUUID().slice(0, 12);

    const { data, error } = await supabase
      .from('highlights')
      .update({ share_id: shareId })
      .eq('id', highlightId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Share highlight error:', error);
      return c.json({ error: 'Failed to share highlight' }, 500);
    }

    if (!data) {
      return c.json({ error: 'Highlight not found' }, 404);
    }

    return c.json({
      highlight: data,
      share_url: `/shared/${shareId}`,
    });

  } catch (err) {
    console.error('Share highlight error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/suggestions
 * Submit a source suggestion (auth required)
 * Checks for duplicates against existing articles and prior suggestions
 */
app.post('/api/suggestions', async (c) => {
  const env = c.env;

  try {
    const auth = await getAuthenticatedClient(env, c.req.header('Authorization'));

    if (!auth) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { supabase, user } = auth;

    const body = await c.req.json<{ author_name?: string; url?: string }>();

    // Validate: at least one field required
    if (!body.author_name?.trim() && !body.url?.trim()) {
      return c.json({ error: 'Provide at least an author name or URL' }, 400);
    }

    const authorName = body.author_name?.trim() || null;
    const url = body.url?.trim() || null;

    // Duplicate checks when URL is provided
    if (url) {
      // Check against existing articles
      const adminSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

      const { data: existingArticle } = await adminSupabase
        .from('articles')
        .select('title')
        .eq('url', url)
        .maybeSingle();

      if (existingArticle) {
        return c.json({
          duplicate: true,
          existing_title: existingArticle.title,
        });
      }

      // Check against prior suggestions
      const { data: existingSuggestion } = await adminSupabase
        .from('source_suggestions')
        .select('status')
        .eq('url', url)
        .maybeSingle();

      if (existingSuggestion) {
        return c.json({
          duplicate: true,
          status: 'already_suggested',
        });
      }
    }

    // Insert the suggestion
    const { error } = await supabase
      .from('source_suggestions')
      .insert({
        user_id: user.id,
        author_name: authorName,
        url,
      });

    if (error) {
      console.error('Suggestion insert error:', error);
      return c.json({ error: 'Failed to save suggestion' }, 500);
    }

    return c.json({ success: true }, 201);

  } catch (err) {
    console.error('Suggestion error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/admin/suggestions
 * List source suggestions for admin review
 */
app.get('/api/admin/suggestions', async (c) => {
  const env = c.env;

  try {
    const admin = await getAdminClient(env, c.req.header('Authorization'));
    if ('error' in admin) {
      return c.json({ error: admin.error.message }, admin.error.status);
    }

    const statusQuery = c.req.query('status')?.trim().toLowerCase() || 'all';
    if (statusQuery !== 'all' && !VALID_SUGGESTION_STATUSES.includes(statusQuery as SuggestionStatus)) {
      return c.json({ error: 'Invalid status. Use all|pending|approved|rejected' }, 400);
    }

    const promotedQuery = c.req.query('promoted')?.trim().toLowerCase() || 'all';
    if (!['all', 'true', 'false', 'pending'].includes(promotedQuery)) {
      return c.json({ error: 'Invalid promoted filter. Use all|true|false|pending' }, 400);
    }

    const limit = Math.max(1, Math.min(Number(c.req.query('limit') || 200) || 200, 500));

    const fullColumns = 'id, user_id, author_name, url, status, created_at, promoted_to_sources, promoted_source_id, promoted_at';
    const baseColumns = 'id, user_id, author_name, url, status, created_at';

    const buildQuery = (columns: string) => {
      let query = admin.adminSupabase
        .from('source_suggestions')
        .select(columns)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (statusQuery !== 'all') {
        query = query.eq('status', statusQuery as SuggestionStatus);
      }

      if (promotedQuery === 'true') query = query.eq('promoted_to_sources', true);
      if (promotedQuery === 'false' || promotedQuery === 'pending') query = query.eq('promoted_to_sources', false);

      return query;
    };

    let { data, error } = await buildQuery(fullColumns);

    // Backward compatible before migration 004 is applied
    if (error && /promoted_to_sources|promoted_source_id|promoted_at/i.test(error.message || '')) {
      const fallback = await buildQuery(baseColumns);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Admin suggestion list error:', error);
      return c.json({ error: 'Failed to list suggestions' }, 500);
    }

    return c.json({ suggestions: data || [] });
  } catch (err) {
    console.error('Admin suggestion list error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * PATCH /api/admin/suggestions/:id
 * Update source suggestion review status
 */
app.patch('/api/admin/suggestions/:id', async (c) => {
  const env = c.env;
  const suggestionId = c.req.param('id');

  try {
    const admin = await getAdminClient(env, c.req.header('Authorization'));
    if ('error' in admin) {
      return c.json({ error: admin.error.message }, admin.error.status);
    }

    const body = await c.req.json<{ status?: SuggestionStatus }>();
    const status = body.status;

    if (!status || !VALID_SUGGESTION_STATUSES.includes(status)) {
      return c.json({ error: 'Invalid status. Use pending|approved|rejected' }, 400);
    }

    const fullColumns = 'id, user_id, author_name, url, status, created_at, promoted_to_sources, promoted_source_id, promoted_at';
    const baseColumns = 'id, user_id, author_name, url, status, created_at';

    let data: any = null;
    let error: any = null;

    {
      const result = await admin.adminSupabase
        .from('source_suggestions')
        .update({ status })
        .eq('id', suggestionId)
        .select(fullColumns)
        .maybeSingle();
      data = result.data;
      error = result.error;
    }

    // Backward compatible before migration 004 is applied
    if (error && /promoted_to_sources|promoted_source_id|promoted_at/i.test(error.message || '')) {
      const fallback = await admin.adminSupabase
        .from('source_suggestions')
        .update({ status })
        .eq('id', suggestionId)
        .select(baseColumns)
        .maybeSingle();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Admin suggestion status update error:', error);
      return c.json({ error: 'Failed to update suggestion' }, 500);
    }

    if (!data) {
      return c.json({ error: 'Suggestion not found' }, 404);
    }

    const response: any = { success: true, suggestion: data };
    if (status === 'approved') {
      response.ready_to_activate = true;
    }
    return c.json(response);
  } catch (err) {
    console.error('Admin suggestion status update error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/admin/sources
 * Create a source from an approved suggestion or from scratch
 */
app.post('/api/admin/sources', async (c) => {
  const env = c.env;

  try {
    const admin = await getAdminClient(env, c.req.header('Authorization'));
    if ('error' in admin) {
      return c.json({ error: admin.error.message }, admin.error.status);
    }

    const body = await c.req.json<{
      name: string;
      url: string;
      type?: string;
      rss_url?: string;
      tags?: string[];
      active?: boolean;
      suggestion_id?: string;
    }>();

    if (!body.name?.trim() || !body.url?.trim()) {
      return c.json({ error: 'name and url are required' }, 400);
    }

    // Generate id slug from name
    const id = body.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[-\s]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check URL uniqueness
    const { data: existing } = await admin.adminSupabase
      .from('sources')
      .select('id')
      .eq('url', body.url.trim())
      .maybeSingle();

    if (existing) {
      return c.json({ error: 'A source with this URL already exists', existing_id: existing.id }, 409);
    }

    const sourceData: Record<string, any> = {
      id,
      name: body.name.trim(),
      url: body.url.trim(),
      type: body.type || 'blog',
      rss_url: body.rss_url?.trim() || null,
      tags: body.tags || [],
      active: body.active !== false,
    };

    if (body.suggestion_id) {
      sourceData.suggestion_id = body.suggestion_id;
    }

    const { data, error } = await admin.adminSupabase
      .from('sources')
      .insert(sourceData)
      .select()
      .single();

    if (error) {
      console.error('Source create error:', error);
      return c.json({ error: 'Failed to create source', details: error.message }, 500);
    }

    return c.json({ success: true, source: data }, 201);
  } catch (err) {
    console.error('Create source error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * PATCH /api/admin/sources/:id
 * Update source fields (active, rss_url, tags, etc.)
 */
app.patch('/api/admin/sources/:id', async (c) => {
  const env = c.env;
  const sourceId = c.req.param('id');

  try {
    const admin = await getAdminClient(env, c.req.header('Authorization'));
    if ('error' in admin) {
      return c.json({ error: admin.error.message }, admin.error.status);
    }

    const body = await c.req.json<{
      active?: boolean;
      rss_url?: string | null;
      tags?: string[];
      name?: string;
      url?: string;
      type?: string;
    }>();

    const updatePayload: Record<string, any> = {};
    if (body.active !== undefined) updatePayload.active = body.active;
    if (body.rss_url !== undefined) updatePayload.rss_url = body.rss_url;
    if (body.tags !== undefined) updatePayload.tags = body.tags;
    if (body.name !== undefined) updatePayload.name = body.name.trim();
    if (body.url !== undefined) updatePayload.url = body.url.trim();
    if (body.type !== undefined) updatePayload.type = body.type;

    if (Object.keys(updatePayload).length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    const { data, error } = await admin.adminSupabase
      .from('sources')
      .update(updatePayload)
      .eq('id', sourceId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Source update error:', error);
      return c.json({ error: 'Failed to update source', details: error.message }, 500);
    }

    if (!data) {
      return c.json({ error: 'Source not found' }, 404);
    }

    return c.json({ success: true, source: data });
  } catch (err) {
    console.error('Update source error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/admin/sources
 * List all sources
 */
app.get('/api/admin/sources', async (c) => {
  const env = c.env;

  try {
    const admin = await getAdminClient(env, c.req.header('Authorization'));
    if ('error' in admin) {
      return c.json({ error: admin.error.message }, admin.error.status);
    }

    const { data, error } = await admin.adminSupabase
      .from('sources')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Source list error:', error);
      return c.json({ error: 'Failed to list sources' }, 500);
    }

    return c.json({ sources: data || [] });
  } catch (err) {
    console.error('List sources error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * PATCH /api/admin/suggestions/:id/promotion
 * Mark a suggestion as promoted (or undo promotion)
 */
app.patch('/api/admin/suggestions/:id/promotion', async (c) => {
  const env = c.env;
  const suggestionId = c.req.param('id');

  try {
    const admin = await getAdminClient(env, c.req.header('Authorization'));
    if ('error' in admin) {
      return c.json({ error: admin.error.message }, admin.error.status);
    }

    const body = await c.req.json<{ promoted_to_sources?: boolean; promoted_source_id?: string | null }>();
    const promotedToSources = body.promoted_to_sources !== false;

    const payload = promotedToSources
      ? {
        promoted_to_sources: true,
        promoted_source_id: body.promoted_source_id?.trim() || null,
        promoted_at: new Date().toISOString(),
      }
      : {
        promoted_to_sources: false,
        promoted_source_id: null,
        promoted_at: null,
      };

    const { data, error } = await admin.adminSupabase
      .from('source_suggestions')
      .update(payload)
      .eq('id', suggestionId)
      .select('id, user_id, author_name, url, status, created_at, promoted_to_sources, promoted_source_id, promoted_at')
      .maybeSingle();

    if (error) {
      console.error('Admin suggestion promotion update error:', error);
      return c.json({ error: 'Failed to update promotion state (apply migration 004 first)' }, 500);
    }

    if (!data) {
      return c.json({ error: 'Suggestion not found' }, 404);
    }

    return c.json({ success: true, suggestion: data });
  } catch (err) {
    console.error('Admin suggestion promotion update error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/shared/:shareId
 * Get a shared highlight (public, no auth required)
 */
app.get('/api/shared/:shareId', async (c) => {
  const env = c.env;
  const shareId = c.req.param('shareId');

  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    const { data, error } = await supabase
      .from('highlights')
      .select('id, article_id, xpath, start_offset, end_offset, selected_text, note, created_at')
      .eq('share_id', shareId)
      .single();

    if (error || !data) {
      return c.json({ error: 'Shared highlight not found' }, 404);
    }

    return c.json({ highlight: data });

  } catch (err) {
    console.error('Get shared highlight error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;
