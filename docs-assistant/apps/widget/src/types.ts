// API Response Types

export interface Article {
  id: string;
  url: string;
  title: string;
  author: string;
  author_id: string;
  published: string;
  summary: string;
  topics: string[];
  key_quotes: KeyQuote[];
  diataxis_type: DiátaxisType;
  tags: string[];
  similarity?: number;
}

export interface KeyQuote {
  text: string;
  context: string;
}

export type DiátaxisType = 'tutorial' | 'how-to' | 'reference' | 'explanation';

export interface SearchRequest {
  query: string;
  filters?: SearchFilters;
  limit?: number;
}

export interface SearchFilters {
  authors?: string[];
  topics?: string[];
  diataxis_type?: DiátaxisType;
  date_from?: string;
  date_to?: string;
}

export interface SearchResponse {
  query: string;
  results: Article[];
  total: number;
}

export interface FilterOptions {
  authors: { id: string; name: string; count: number }[];
  topics: { name: string; count: number }[];
  diataxis_types: { type: DiátaxisType; count: number }[];
  date_range: { min: string; max: string };
}

export interface ContentGap {
  topic: string;
  tutorial: number;
  'how-to': number;
  reference: number;
  explanation: number;
  total: number;
}

export interface GapsResponse {
  gaps: ContentGap[];
  summary: {
    total_topics: number;
    total_articles: number;
    by_type: Record<DiátaxisType, number>;
    gaps_identified: number;
  };
}
