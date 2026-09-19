import { z } from 'zod';
import type { TaskStatus, TimeEntrySource, TaskMetadata, Subtask } from '../types';

export const uuidSchema = z.string().uuid();

export const isoDateSchema = z.string().datetime({ offset: true });

export const taskMetadataSchema: z.ZodType<TaskMetadata> = z.object({
  tags: z.array(z.string()).default([]),
  energyLevel: z.enum(['low', 'medium', 'high']).default('medium'),
  context: z.enum(['deep_work', 'admin', 'creative', 'communication']).default('deep_work'),
  aiSuggestedBreakdown: z.array(z.object({
    id: uuidSchema,
    title: z.string().min(1).max(200),
    completed: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
  })).optional(),
  aiEstimatedDuration: z.number().int().positive().optional(),
  aiPriorityScore: z.number().min(0).max(1).optional(),
  agentContext: z.object({
    relevantFiles: z.array(z.string()).default([]),
    relatedConversations: z.array(z.string()).default([]),
    nextActions: z.array(z.string()).default([]),
  }).optional(),
  embeddingsVector: z.array(z.number()).optional(),
}).passthrough();

export const taskSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  status: z.enum(['pending', 'active', 'paused', 'done', 'archived']).default('pending'),
  projectId: uuidSchema.optional(),
  parentTaskId: uuidSchema.optional(),
  sortOrder: z.number().int().default(0),
  estimatedMinutes: z.number().int().positive().optional(),
  totalTrackedSeconds: z.number().int().default(0),
  isParallel: z.boolean().default(false),
  metadata: taskMetadataSchema.default({ tags: [], energyLevel: 'medium', context: 'deep_work' }),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: isoDateSchema.optional(),
  version: z.number().int().default(1),
});

export const timeEntrySchema = z.object({
  id: uuidSchema,
  taskId: uuidSchema,
  userId: uuidSchema,
  startedAt: isoDateSchema,
  endedAt: isoDateSchema.optional(),
  durationSeconds: z.number().int().optional(),
  source: z.enum(['manual', 'pomodoro', 'auto', 'imported']).default('manual'),
  deviceId: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  syncedAt: isoDateSchema,
});

export const projectSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(50).optional(),
  sortOrder: z.number().int().default(0),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  archivedAt: isoDateSchema.optional(),
});

export const userSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  passkeyCredentialId: z.string().optional(),
  publicKey: z.string(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const createTaskInputSchema = taskSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  version: true,
  totalTrackedSeconds: true,
});

export const updateTaskInputSchema = createTaskInputSchema.partial();

export const createTimeEntryInputSchema = timeEntrySchema.omit({
  id: true,
  syncedAt: true,
  durationSeconds: true,
});

export const updateTimeEntryInputSchema = createTimeEntryInputSchema.partial();

export const createProjectInputSchema = projectSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
});

export const updateProjectInputSchema = createProjectInputSchema.partial();

export const paginatedQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;
export type CreateTimeEntryInput = z.infer<typeof createTimeEntryInputSchema>;
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntryInputSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;