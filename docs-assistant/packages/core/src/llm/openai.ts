import OpenAI from 'openai';
import type { Message, ChatOptions } from '../types';
import type { LLMProvider, LLMConfig } from './types';

const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * OpenAI LLM Provider
 *
 * Implements the LLMProvider interface using OpenAI's API.
 * Uses gpt-4o-mini for chat and text-embedding-3-small for embeddings.
 */
export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private chatModel: string;
  private embeddingModel: string;

  constructor(config: LLMConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.chatModel = config.model ?? DEFAULT_CHAT_MODEL;
    this.embeddingModel = config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  }

  /**
   * Stream chat completions from OpenAI
   */
  async *chat(messages: Message[], options?: ChatOptions): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.chatModel,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1024,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  /**
   * Generate embeddings using OpenAI
   * Returns 1536-dimensional vector for text-embedding-3-small
   */
  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });

    return response.data[0].embedding;
  }
}

/**
 * Create an OpenAI provider instance
 * Convenience function for creating providers
 */
export function createOpenAIProvider(apiKey: string, options?: Partial<LLMConfig>): LLMProvider {
  return new OpenAIProvider({
    apiKey,
    ...options,
  });
}
