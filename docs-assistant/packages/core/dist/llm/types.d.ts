import type { Message, ChatOptions } from '../types';
/**
 * LLM Provider Interface
 *
 * Defines the contract for LLM providers. Implementations must support:
 * - Streaming chat completions
 * - Text embeddings for RAG
 */
export interface LLMProvider {
    /**
     * Stream chat completions from the LLM
     * @param messages - Conversation history
     * @param options - Generation options (temperature, maxTokens)
     * @returns AsyncIterable of text chunks
     */
    chat(messages: Message[], options?: ChatOptions): AsyncIterable<string>;
    /**
     * Generate embedding vector for text
     * @param text - Text to embed
     * @returns Vector of floats (1536 dimensions for OpenAI text-embedding-3-small)
     */
    embed(text: string): Promise<number[]>;
}
/**
 * Configuration for LLM providers
 */
export interface LLMConfig {
    apiKey: string;
    model?: string;
    embeddingModel?: string;
    baseUrl?: string;
}
//# sourceMappingURL=types.d.ts.map