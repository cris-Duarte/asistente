import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  passkeyCredentialId: text('passkey_credential_id').unique(),
  publicKey: text('public_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
  icon: text('icon'),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (table) => ({
  userIdx: index('projects_user_id_idx').on(table.userId),
  sortIdx: index('projects_sort_order_idx').on(table.sortOrder),
}));

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', { enum: ['pending', 'active', 'paused', 'done', 'archived'] }).default('pending').notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  parentTaskId: uuid('parent_task_id').references(() => tasks.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').default(0).notNull(),
  estimatedMinutes: integer('estimated_minutes'),
  totalTrackedSeconds: integer('total_tracked_seconds').default(0).notNull(),
  isParallel: boolean('is_parallel').default(false).notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  version: integer('version').default(1).notNull(),
}, (table) => ({
  userIdx: index('tasks_user_id_idx').on(table.userId),
  projectIdx: index('tasks_project_id_idx').on(table.projectId),
  parentIdx: index('tasks_parent_task_id_idx').on(table.parentTaskId),
  statusIdx: index('tasks_status_idx').on(table.status),
  sortIdx: index('tasks_sort_order_idx').on(table.sortOrder),
  deletedIdx: index('tasks_deleted_at_idx').on(table.deletedAt),
}));

export const timeEntries = pgTable('time_entries', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds').generatedAlwaysAs(sql`EXTRACT(EPOCH FROM (ended_at - started_at))`),
  source: text('source', { enum: ['manual', 'pomodoro', 'auto', 'imported'] }).default('manual').notNull(),
  deviceId: text('device_id').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  taskIdx: index('time_entries_task_id_idx').on(table.taskId),
  userIdx: index('time_entries_user_id_idx').on(table.userId),
  startedIdx: index('time_entries_started_at_idx').on(table.startedAt),
  deviceIdx: index('time_entries_device_id_idx').on(table.deviceId),
}));

export const syncState = pgTable('sync_state', {
  clientId: text('client_id').primaryKey(),
  lastMutationId: integer('last_mutation_id').default(0).notNull(),
  lastPulledAt: timestamp('last_pulled_at', { withTimezone: true }).defaultNow().notNull(),
});

export const domainEvents = pgTable('domain_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  correlationId: uuid('correlation_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deviceId: text('device_id').notNull(),
}, (table) => ({
  correlationIdx: index('domain_events_correlation_id_idx').on(table.correlationId),
  userIdx: index('domain_events_user_id_idx').on(table.userId),
  timestampIdx: index('domain_events_timestamp_idx').on(table.timestamp),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;
export type SyncState = typeof syncState.$inferSelect;
export type DomainEvent = typeof domainEvents.$inferSelect;
export type NewDomainEvent = typeof domainEvents.$inferInsert;