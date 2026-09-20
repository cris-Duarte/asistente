import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const isoDateSchema = z.string().datetime({ offset: true });

export const taskMetadataSchema = z.object({
  tags: z.array(z.string()).default([]),
  energyLevel: z.enum(['low', 'medium', 'high']).default('medium'),
  context: z.enum(['deep_work', 'admin', 'creative', 'communication']).default('deep_work'),
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
  lastWriteId: z.string().uuid().optional(),
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
  updatedAt: isoDateSchema,
  deletedAt: isoDateSchema.optional(),
  version: z.number().int().default(1),
  lastWriteId: z.string().uuid().optional(),
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
  deletedAt: isoDateSchema.optional(),
  version: z.number().int().default(1),
  lastWriteId: z.string().uuid().optional(),
});

export const userSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  name: z.string().min(1).max(120),
  timezone: z.string(),
  preferences: z.record(z.unknown()),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const createTaskInputSchema = taskSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  version: true,
  totalTrackedSeconds: true,
  lastWriteId: true,
});

export const updateTaskInputSchema = createTaskInputSchema.partial();

export const createTimeEntryInputSchema = timeEntrySchema.omit({
  id: true,
  userId: true,
  syncedAt: true,
  durationSeconds: true,
  updatedAt: true,
  deletedAt: true,
  version: true,
  lastWriteId: true,
});

export const updateTimeEntryInputSchema = createTimeEntryInputSchema.partial();

export const createProjectInputSchema = projectSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  deletedAt: true,
  version: true,
  lastWriteId: true,
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
