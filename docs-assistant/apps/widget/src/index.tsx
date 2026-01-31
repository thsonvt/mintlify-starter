// Thought Leadership Knowledge Base Widget
// Embeddable React components for semantic search and gap analysis

import './styles.css';

// Export components
export { SearchWidget } from './components/SearchWidget';
export { GapDashboard } from './components/GapDashboard';

// Export types
export type {
  Article,
  KeyQuote,
  DiátaxisType,
  SearchRequest,
  SearchFilters,
  SearchResponse,
  FilterOptions,
  ContentGap,
  GapsResponse,
} from './types';

// Export API client
export { ApiClient, getApiClient } from './api';
