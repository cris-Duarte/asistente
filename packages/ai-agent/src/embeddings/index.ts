import { EventStore } from './event-store';
import { embeddings } from '../event-store/schema';
import { db } from '../db';
import { eq, sql, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface EmbeddingProvider {
  generate(text: string): Promise<number[]>;
  dimensions: number;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'text-embedding-3-small') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        encoding_format: 'float',
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  get dimensions(): number {
    return this.model === 'text-embedding-3-large' ? 3072 : 1536;
  }
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  // Simple hash-based embedding for local development
  // Not for production use - use OpenAI or other providers
  private cache = new Map<string, number[]>();

  async generate(text: string): Promise<number[]> {
    if (this.cache.has(text)) {
      return this.cache.get(text)!;
    }

    // Simple hash-based embedding (not for production)
    const hash = this.simpleHash(text);
    const embedding = this.hashToVector(hash, 1536);
    this.cache.set(text, embedding);
    return embedding;
  }

  get dimensions(): number {
    return 1536;
  }

  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  private hashToVector(hash: number, dimensions: number): number[] {
    const vector = new Array(dimensions);
    let seed = hash;
    for (let i = 0; i < dimensions; i++) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      vector[i] = (seed / 4294967296) * 2 - 1; // Normalize to [-1, 1]
    }
    // Normalize to unit vector
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map(v => v / (magnitude || 1));
  }
}

export class EmbeddingService {
  private provider: EmbeddingProvider;
  private eventStore: any; // EventStore reference for storing embeddings

  constructor(provider: EmbeddingProvider, eventStore?: any) {
    this.provider = provider;
    this.eventStore = eventStore;
  }

  async generateAndStore(
    entityType: string,
    entityId: string,
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<{ embedding: number[]; id: string }> {
    const embedding = await this.provider.generate(content);
    const id = crypto.randomUUID();

    // Store in database
    await fetch('/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityType,
        entityId,
        content,
        embedding,
        metadata: { ...metadata, contentHash: this.hashContent(content) },
      }),
    });

    return { embedding, id: crypto.randomUUID() };
  }

  async searchSimilar(
    query: string,
    options: {
      entityType?: string;
      limit?: number;
      threshold?: number;
    } = {}
  ): Promise<Array<{ content: string; similarity: number; metadata: Record<string, unknown> }>> {
    const queryEmbedding = await this.provider.generate(query);
    const results = await fetch('/api/embeddings/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embedding: queryEmbedding,
        entityType: options.entityType,
        limit: options.limit || 10,
        threshold: options.threshold || 0.7,
      }),
    });

    return (await results.json()) as Array<{ content: string; similarity: number; metadata: Record<string, unknown> }>;
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      let hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

// Factory function
export function createEmbeddingService(config: {
  provider: 'openai' | 'local';
  apiKey?: string;
  model?: string;
}): EmbeddingService {
  let provider: any;

  if (config.provider === 'openai') {
    if (!config.apiKey) throw new Error('OpenAI API key required');
    provider = new (await import('./embeddings')).OpenAIEmbeddingProvider(config.apiKey, config.model);
  } else {
    provider = new (await import('./embeddings')).LocalEmbeddingProvider();
  }

  return new EmbeddingService(provider);
}

export { EmbeddingService, OpenAIEmbeddingProvider, LocalEmbeddingProvider, EmbeddingProvider };