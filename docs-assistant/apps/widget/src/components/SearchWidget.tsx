import { useState, useEffect, useCallback } from 'react';
import { getApiClient } from '../api';
import type { Article, FilterOptions, SearchFilters, DiátaxisType } from '../types';

interface SearchWidgetProps {
  apiUrl?: string;
  placeholder?: string;
  limit?: number;
}

export function SearchWidget({
  apiUrl,
  placeholder = 'Search thought leadership content...',
  limit = 10,
}: SearchWidgetProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Article[]>([]);
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [activeFilters, setActiveFilters] = useState<SearchFilters>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const api = getApiClient(apiUrl);

  // Load filter options on mount
  useEffect(() => {
    api.getFilters()
      .then(setFilters)
      .catch(err => console.error('Failed to load filters:', err));
  }, []);

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string, searchFilters: SearchFilters) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.search({
        query: searchQuery,
        filters: searchFilters,
        limit,
      });
      setResults(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [api, limit]);

  // Trigger search on query or filter change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(query, activeFilters);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, activeFilters, performSearch]);

  const toggleAuthorFilter = (authorId: string) => {
    setActiveFilters(prev => {
      const authors = prev.authors || [];
      const newAuthors = authors.includes(authorId)
        ? authors.filter(a => a !== authorId)
        : [...authors, authorId];
      return { ...prev, authors: newAuthors.length ? newAuthors : undefined };
    });
  };

  const toggleTopicFilter = (topic: string) => {
    setActiveFilters(prev => {
      const topics = prev.topics || [];
      const newTopics = topics.includes(topic)
        ? topics.filter(t => t !== topic)
        : [...topics, topic];
      return { ...prev, topics: newTopics.length ? newTopics : undefined };
    });
  };

  const setDiataxisFilter = (type: DiátaxisType | null) => {
    setActiveFilters(prev => ({
      ...prev,
      diataxis_type: type || undefined,
    }));
  };

  const clearFilters = () => {
    setActiveFilters({});
  };

  const hasActiveFilters = Object.values(activeFilters).some(v => v !== undefined);

  return (
    <div className="tl-widget space-y-4">
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="tl-search-input pr-12"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {isLoading && (
            <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1 rounded ${showFilters ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'}`}
            title="Toggle filters"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && filters && (
        <div className="p-4 bg-gray-50 rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Filters</h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-blue-500 hover:text-blue-700"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Diátaxis Types */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Content Type
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {filters.diataxis_types.map(({ type, count }) => (
                <button
                  key={type}
                  onClick={() => setDiataxisFilter(activeFilters.diataxis_type === type ? null : type)}
                  className={`tl-filter-tag ${
                    activeFilters.diataxis_type === type
                      ? 'tl-filter-tag-active'
                      : 'tl-filter-tag-inactive'
                  }`}
                >
                  {type} ({count})
                </button>
              ))}
            </div>
          </div>

          {/* Authors */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Authors
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {filters.authors.map(({ id, name, count }) => (
                <button
                  key={id}
                  onClick={() => toggleAuthorFilter(id)}
                  className={`tl-filter-tag ${
                    activeFilters.authors?.includes(id)
                      ? 'tl-filter-tag-active'
                      : 'tl-filter-tag-inactive'
                  }`}
                >
                  {name} ({count})
                </button>
              ))}
            </div>
          </div>

          {/* Topics */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Topics
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {filters.topics.slice(0, 8).map(({ name, count }) => (
                <button
                  key={name}
                  onClick={() => toggleTopicFilter(name)}
                  className={`tl-filter-tag ${
                    activeFilters.topics?.includes(name)
                      ? 'tl-filter-tag-active'
                      : 'tl-filter-tag-inactive'
                  }`}
                >
                  {name} ({count})
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </p>
          {results.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {query.length >= 2 && !isLoading && results.length === 0 && !error && (
        <div className="text-center py-8 text-gray-500">
          <p>No results found for "{query}"</p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-2 text-blue-500 hover:text-blue-700 text-sm"
            >
              Try clearing filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ArticleCard({ article }: { article: Article }) {
  const diataxisClass = `tl-diataxis-${article.diataxis_type}`;

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="tl-result-card block"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">
            {article.title}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {article.author} · {article.published}
          </p>
          {article.summary && (
            <p className="text-sm text-gray-600 mt-2 line-clamp-2">
              {article.summary}
            </p>
          )}
          <div className="flex flex-wrap gap-1 mt-2">
            {article.topics.slice(0, 3).map((topic) => (
              <span
                key={topic}
                className="inline-flex items-center px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`tl-diataxis-badge ${diataxisClass}`}>
            {article.diataxis_type}
          </span>
          {article.similarity !== undefined && (
            <span className="text-xs text-gray-400">
              {Math.round(article.similarity * 100)}% match
            </span>
          )}
        </div>
      </div>

      {/* Key Quote Preview */}
      {article.key_quotes.length > 0 && (
        <blockquote className="mt-3 pl-3 border-l-2 border-gray-200 text-sm text-gray-500 italic">
          "{article.key_quotes[0].text.slice(0, 150)}
          {article.key_quotes[0].text.length > 150 ? '...' : ''}"
        </blockquote>
      )}
    </a>
  );
}

export default SearchWidget;
