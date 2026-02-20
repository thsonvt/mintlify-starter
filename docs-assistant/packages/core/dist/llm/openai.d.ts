import type { Message, ChatOptions } from '../types';
import type { LLMProvider, LLMConfig } from './types';
/**
 * OpenAI LLM Provider
 *
 * Implements the LLMProvider interface using OpenAI's API.
 * Uses gpt-4o-mini for chat and text-embedding-3-small for embeddings.
 */
export declare class OpenAIProvider implements LLMProvider {
    private client;
    private chatModel;
    private embeddingModel;
    constructor(config: LLMConfig);
    /**
     * Stream chat completions from OpenAI
     */
    chat(messages: Message[], options?: ChatOptions): AsyncIterable<string>;
    /**
     * Generate embeddings using OpenAI
     * Returns 1536-dimensional vector for text-embedding-3-small
     */
    embed(text: string): Promise<number[]>;
}
/**
 * Create an OpenAI provider instance
 * Convenience function for creating providers
 */
export declare function createOpenAIProvider(apiKey: string, options?: Partial<LLMConfig>): LLMProvider;
//# sourceMappingURL=openai.d.ts.map