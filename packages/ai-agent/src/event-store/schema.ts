import { pgTable, uuid, text, timestamp, jsonb, index, integer, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Event store - append-only event log
export const events = pgTable('events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  aggregateId: uuid('aggregate_id').notNull(),
  aggregateType: text('aggregate_type').notNull(), // 'task', 'project', 'note', 'agent'
  eventType: text('event_type').notNull(), // 'created', 'updated', 'deleted', 'completed', 'assigned', etc.
  payload: jsonb('payload').notNull(), // Event payload
  metadata: jsonb('metadata').default({}).notNull(), // Correlation ID, causation ID, user ID, etc.
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  aggregateIdx: index('events_aggregate_idx').on(table.aggregateId, table.version),
  typeIdx: index('events_type_idx').on(table.eventType),
  createdIdx: index('events_created_idx').on(table.createdAt),
  aggregateTypeIdx: index('events_aggregate_type_idx').on(table.aggregateType),
}));

// Projections - materialized views for common queries
export const projections = pgTable('projections', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull().unique(), // 'task_list', 'project_summary', 'agent_state'
  state: jsonb('state').notNull().default({}),
  lastEventId: uuid('last_event_id'),
  lastProcessedAt: timestamp('last_processed_at', { withTimezone: true }).defaultNow(),
  version: integer('version').default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  nameIdx: uniqueIndex('projections_name_idx').on(table.name),
}));

// Embeddings for vector similarity search
export const embeddings = pgTable('embeddings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  entityType: text('entity_type').notNull(), // 'task', 'note', 'project', 'agent_memory'
  entityId: uuid('entity_id').notNull(),
  content: text('content').notNull(), // Original text content
  embedding: vector('embedding', { dimensions: 1536 }).notNull(), // OpenAI ada-002 = 1536 dims
  metadata: jsonb('metadata').default({}).notNull(), // entity type, project, tags, etc.
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  entityIdx: index('embeddings_entity_idx').on(table.entityType, table.entityId),
  // Vector similarity search index (requires pgvector extension)
}));

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Projection = typeof projections.$inferSelect;
export type Embedding = typeof embeddings.$inferSelect;
export type NewEmbedding = typeof embeddings.$inferInsert;