import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, gte, lte, sql, count } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { Event, NewEvent, Projection, Embedding, NewEmbedding } from './schema';
import { events, projections, embeddings } from './schema';

const connectionString = process.env.DATABASE_URL!;
const sql = postgres(connectionString, { prepare: false });
export const db = drizzle(sql);

export interface EventStoreConfig {
  batchSize?: number;
  projectionBatchSize?: number;
}

export class EventStore {
  private config: Required<EventStoreConfig>;
  private projectionHandlers: Map<string, ProjectionHandler> = new Map();

  constructor(config: EventStoreConfig = {}) {
    this.config = {
      batchSize: config.batchSize ?? 100,
      projectionBatchSize: config.projectionBatchSize ?? 50,
    };
  }

  registerProjection(name: string, handler: ProjectionHandler): void {
    this.projectionHandlers.set(name, handler);
  }

  async append(event: Omit<NewEvent, 'id' | 'createdAt' | 'version'>): Promise<Event> {
    const now = new Date();
    const correlationId = uuidv4();

    // Get current version for optimistic locking
    const existing = await db.select({ version: events.version })
      .from(events)
      .where(eq(events.aggregateId, event.aggregateId))
      .orderBy(desc(events.version))
      .limit(1);

    const version = (existing[0]?.version ?? 0) + 1;

    const newEvent: NewEvent = {
      ...event,
      id: uuidv4(),
      version,
      createdAt: new Date(),
      metadata: {
        ...event.metadata,
        correlationId: event.metadata?.correlationId ?? uuidv4(),
        causationId: event.metadata?.causationId,
      },
    };

    const [inserted] = await db.insert(events).values(newEvent).returning();

    // Update projections asynchronously
    this.updateProjections(inserted);

    return inserted;
  }

  async appendBatch(events: Omit<NewEvent, 'id' | 'createdAt' | 'version'>[]): Promise<Event[]> {
    const results: Event[] = [];
    for (const event of events) {
      const appended = await this.append(event);
      results.push(appended);
    }
    return results;
  }

  private async updateProjections(event: Event): Promise<void> {
    for (const [name, handler] of this.projectionHandlers) {
      try {
        await handler.handle(event);
      } catch (error) {
        console.error(`Projection ${name} failed:`, error);
      }
    }
  }

  // Event queries
  async getEvents(aggregateId: string, fromVersion?: number): Promise<Event[]> {
    const conditions = [eq(events.aggregateId, aggregateId)];
    if (fromVersion !== undefined) {
      // We need to add version filter - but drizzle doesn't support this directly
      // We'll handle it in the query
    }

    return db.select()
      .from(events)
      .where(and(
        eq(events.aggregateId, aggregateId),
        fromVersion ? gte(events.version, fromVersion) : sql`true`
      ))
      .orderBy(events.version);
  }

  async getEventsByType(eventType: string, fromDate?: Date, toDate?: Date): Promise<Event[]> {
    const conditions = [eq(events.eventType, eventType)];
    if (fromDate) conditions.push(gte(events.createdAt, fromDate));
    if (toDate) conditions.push(lte(events.createdAt, toDate));

    return db.select()
      .from(events)
      .where(and(...conditions))
      .orderBy(desc(events.createdAt))
      .limit(1000);
  }

  // Projection management
  async getProjection(name: string): Promise<Projection | null> {
    const result = await db.select().from(projections).where(eq(projections.name, name)).limit(1);
    return result[0] ?? null;
  }

  async updateProjection(name: string, state: Record<string, unknown>, lastEventId?: string): Promise<void> {
    const now = new Date();
    const existing = await this.getProjection(name);

    if (existing) {
      await db.update(projections)
        .set({ state, lastEventId: lastEventId ?? existing.lastEventId, lastProcessedAt: now, version: existing.version + 1, updatedAt: now })
        .where(eq(projections.name, name));
    } else {
      await db.insert(projections).values({
        name,
        state,
        lastEventId: lastEventId ?? null,
        lastProcessedAt: now,
        version: 1,
      });
    }
  }

  // Embeddings for vector search
  async storeEmbedding(embedding: Omit<NewEmbedding, 'id' | 'createdAt'>): Promise<Embedding> {
    const [inserted] = await db.insert(embeddings).values({
      ...embedding,
      id: uuidv4(),
      createdAt: new Date(),
    }).returning();
    return inserted;
  }

  async searchSimilar(queryEmbedding: number[], options: {
    entityType?: string;
    limit?: number;
    threshold?: number;
  } = {}): Promise<Array<Embedding & { similarity: number }>> {
    const { entityType, limit = 10, threshold = 0.7 } = options;

    const conditions = [];
    if (entityType) {
      conditions.push(sql`${embeddings.entityType} = ${entityType}`);
    }

    // Use pgvector's cosine similarity
    const similarity = sql`1 - (${embeddings.embedding} <=> ${queryEmbedding})`.as('similarity');

    const results = await db
      .select({
        ...embeddings,
        similarity,
      })
      .from(embeddings)
      .where(and(...conditions, sql`${similarity} > ${threshold}`))
      .orderBy(sql`${similarity} DESC`)
      .limit(limit);

    return results as Array<Embedding & { similarity: number }>;
  }

  async getEventStats(aggregateId: string): Promise<{ count: number; latestVersion: number; lastEventAt: Date | null }> {
    const stats = await db
      .select({
        count: count(),
        latestVersion: sql`MAX(${events.version})`,
        lastEventAt: sql`MAX(${events.createdAt})`,
      })
      .from(events)
      .where(eq(events.aggregateId, aggregateId));

    return {
      count: stats[0].count,
      latestVersion: stats[0].latestVersion ?? 0,
      lastEventAt: stats[0].lastEventAt ? new Date(stats[0].lastEventAt as string) : null,
    };
  }

  // Replay events for projection rebuilding
  async replayAll(handler: (event: Event) => Promise<void>): Promise<number> {
    let processed = 0;
    const batchSize = 1000;
    let offset = 0;

    while (true) {
      const batch = await db.select()
        .from(events)
        .orderBy(events.createdAt)
        .limit(batchSize)
        .offset(offset);

      if (batch.length === 0) break;

      for (const event of batch) {
        await handler(event);
        processed++;
      }

      offset += batchSize;
      if (batch.length < batchSize) break;
    }

    return processed;
  }
}

export interface ProjectionHandler {
  handle(event: Event): Promise<void>;
}

export function createEventStore(config?: EventStoreConfig): EventStore {
  return new EventStore(config);
}