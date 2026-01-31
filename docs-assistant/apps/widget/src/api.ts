// API Client for Thought Leadership Knowledge Base

import type { SearchRequest, SearchResponse, FilterOptions, GapsResponse } from './types';

const DEFAULT_API_URL = 'http://localhost:8787';

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || DEFAULT_API_URL;
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const response = await fetch(`${this.baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getFilters(): Promise<FilterOptions> {
    const response = await fetch(`${this.baseUrl}/api/filters`);

    if (!response.ok) {
      throw new Error(`Failed to fetch filters: ${response.statusText}`);
    }

    return response.json();
  }

  async getGaps(): Promise<GapsResponse> {
    const response = await fetch(`${this.baseUrl}/api/gaps`);

    if (!response.ok) {
      throw new Error(`Failed to fetch gaps: ${response.statusText}`);
    }

    return response.json();
  }
}

// Singleton instance
let apiClient: ApiClient | null = null;

export function getApiClient(baseUrl?: string): ApiClient {
  if (!apiClient || baseUrl) {
    apiClient = new ApiClient(baseUrl);
  }
  return apiClient;
}
