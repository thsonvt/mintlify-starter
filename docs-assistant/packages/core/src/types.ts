/**
 * Shared types for the docs-assistant system
 */

// ============================================================================
// Chat Types
// ============================================================================

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

// ============================================================================
// Document Types
// ============================================================================

export interface DocumentChunk {
  id: string;
  vector: number[];
  metadata: DocumentMetadata;
}

export interface DocumentMetadata {
  title: string;
  section: string;
  path: string;
  content: string;
}

export interface SourceCitation {
  title: string;
  path: string;
  relevance: number;
}

// ============================================================================
// API Types
// ============================================================================

export interface ChatRequest {
  question: string;
  sessionId?: string;
}

export interface ChatStreamEvent {
  type: 'content' | 'sources' | 'done' | 'error';
  text?: string;
  sources?: SourceCitation[];
  usage?: UsageInfo;
  error?: string;
}

export interface UsageInfo {
  used: number;
  limit: number;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  timestamp: string;
  services: {
    vector: boolean;
    redis: boolean;
    llm: boolean;
  };
}

// ============================================================================
// User Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  isSubscriber: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionItemId?: string;
}

export interface Session {
  userId: string;
  expiresAt: number;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  resetAt?: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AssistantConfig {
  apiUrl: string;
  position?: 'bottom-right' | 'bottom-left';
  theme?: 'light' | 'dark' | 'auto';
  accentColor?: string;
}

export interface MountOptions {
  mode: 'page' | 'inline';
  height?: string;
}
