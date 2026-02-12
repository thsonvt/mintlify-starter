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
): Promise<{ supabase: SupabaseClient; user: { id: string } } | null> {
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
  return { supabase, user: { id: user.id } };
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

    // Call Supabase RPC function for vector search
    const { data, error } = await supabase.rpc('match_articles', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: limit,
      filter_authors: filters.authors?.length ? filters.authors : null,
      filter_topics: filters.topics?.length ? filters.topics : null,
      filter_diataxis_type: filters.diataxis_type || null,
      filter_date_from: filters.date_from || null,
      filter_date_to: filters.date_to || null,
    });

    if (error) {
      console.error('Supabase error:', error);
      return c.json({ error: 'Search failed', details: error.message }, 500);
    }

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

    // Format results
    const results: Article[] = (data || []).map((row: any) => ({
      id: row.id,
      url: row.url,
      title: row.title,
      author: row.author,
      author_id: row.author_id,
      published: row.published,
      summary: row.summary,
      topics: row.topics || [],
      key_quotes: row.key_quotes || [],
      diataxis_type: row.diataxis_type,
      tags: row.tags || [],
      similarity: Math.round(row.similarity * 100) / 100,
      mdx_path: row.mdx_path || generateMdxPath(row.title, row.id),
      source_type: 'knowledge-base',
    }));

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
