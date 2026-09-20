import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  ownerSlot: integer('owner_slot').default(1).notNull(),
  timezone: text('timezone').default('America/Asuncion').notNull(),
  preferences: jsonb('preferences').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  singleOwner: uniqueIndex('users_single_owner_idx').on(table.ownerSlot),
  ownerSlotCheck: check('users_owner_slot_check', sql`${table.ownerSlot} = 1`),
}));

export const passkeyCredentials = pgTable('passkey_credentials', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id').notNull().unique(),
  publicKey: text('public_key').notNull(),
  counter: integer('counter').default(0).notNull(),
  transports: jsonb('transports').$type<string[]>().default([]).notNull(),
  deviceType: text('device_type'),
  backedUp: boolean('backed_up').default(false).notNull(),
  name: text('name').default('Passkey').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
}, (table) => ({ userIdx: index('passkey_credentials_user_idx').on(table.userId) }));

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
  recoveryRequired: boolean('recovery_required').default(false).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => ({ userIdx: index('sessions_user_idx').on(table.userId) }));

export const recoveryCodes = pgTable('recovery_codes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
}, (table) => ({ userIdx: index('recovery_codes_user_idx').on(table.userId) }));

export const setupTokens = pgTable('setup_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  hardwareId: text('hardware_id').notNull().unique(),
  tokenHash: text('token_hash').unique(),
  scopes: jsonb('scopes').$type<string[]>().default(['tasks:read', 'tasks:write', 'timer:read', 'timer:write']).notNull(),
  firmwareVersion: text('firmware_version'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  pairedAt: timestamp('paired_at', { withTimezone: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => ({ userIdx: index('devices_user_idx').on(table.userId) }));

export const devicePairings = pgTable('device_pairings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull().unique(),
  pollingTokenHash: text('polling_token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
  icon: text('icon'),
  sortOrder: integer('sort_order').default(0).notNull(),
  version: integer('version').default(1).notNull(),
  lastWriteId: text('last_write_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
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
  parentTaskId: uuid('parent_task_id'),
  sortOrder: integer('sort_order').default(0).notNull(),
  estimatedMinutes: integer('estimated_minutes'),
  totalTrackedSeconds: integer('total_tracked_seconds').default(0).notNull(),
  isParallel: boolean('is_parallel').default(false).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  version: integer('version').default(1).notNull(),
  lastWriteId: text('last_write_id'),
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
  durationSeconds: integer('duration_seconds'),
  source: text('source', { enum: ['manual', 'pomodoro', 'auto', 'imported'] }).default('manual').notNull(),
  deviceId: text('device_id').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  version: integer('version').default(1).notNull(),
  lastWriteId: text('last_write_id'),
}, (table) => ({
  taskIdx: index('time_entries_task_id_idx').on(table.taskId),
  userIdx: index('time_entries_user_id_idx').on(table.userId),
  startedIdx: index('time_entries_started_at_idx').on(table.startedAt),
  deviceIdx: index('time_entries_device_id_idx').on(table.deviceId),
  singleActive: uniqueIndex('time_entries_single_active_idx').on(table.userId)
    .where(sql`${table.endedAt} IS NULL AND ${table.deletedAt} IS NULL`),
}));

export const mutationReceipts = pgTable('mutation_receipts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  idempotencyKey: text('idempotency_key').notNull(),
  method: text('method').notNull(),
  path: text('path').notNull(),
  statusCode: integer('status_code').notNull(),
  response: jsonb('response').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userKey: uniqueIndex('mutation_receipts_user_key_idx').on(table.userId, table.idempotencyKey),
  createdIdx: index('mutation_receipts_created_idx').on(table.createdAt),
}));

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

export const syncState = pgTable('sync_state', {
  clientId: text('client_id').primaryKey(),
  lastMutationId: integer('last_mutation_id').default(0).notNull(),
  lastPulledAt: timestamp('last_pulled_at', { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type PasskeyCredential = typeof passkeyCredentials.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;
export type Device = typeof devices.$inferSelect;
export type DomainEvent = typeof domainEvents.$inferSelect;
