import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { createTaskInputSchema, updateTaskInputSchema, createTimeEntryInputSchema, updateTimeEntryInputSchema, createProjectInputSchema, updateProjectInputSchema, paginatedQuerySchema } from '@productivity-assistant/shared';
import { db } from '@productivity-assistant/db-schema';
import { tasks, timeEntries, projects, users, domainEvents } from '@productivity-assistant/db-schema';
import { eq, desc, and, gte, lte, sql, count } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

type Bindings = {
  WEBSOCKET_SERVER: DurableObjectNamespace;
  BACKUPS: R2Bucket;
  DATABASE_URL: string;
  DATABASE_URL_UNPOOLED: string;
  JWT_SECRET: string;
  ELECTRIC_URL: string;
  ELECTRIC_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', cors({
  origin: ['http://localhost:5173', 'https://productivity-assistant.pages.dev'],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}));

app.onError((err, c) => {
  console.error(`${err}`);
  if (err instanceof HTTPException) {
    return c.json({ success: false, error: { code: 'HTTP_ERROR', message: err.message } }, err.status);
  }
  return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
});

app.notFound((c) => {
  return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404);
});

const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  // TODO: Verify JWT token
  // For now, we'll use a simple user ID from header for development
  const userId = c.req.header('X-User-ID') || '00000000-0000-0000-0000-000000000000';
  c.set('userId', userId);
  await next();
};

app.use('/api/*', authMiddleware);

app.get('/health', (c) => {
  return c.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

app.get('/api/tasks', zValidator('query', paginatedQuerySchema), async (c) => {
  const userId = c.get('userId');
  const { page, pageSize } = c.req.valid('query');
  const offset = (page - 1) * pageSize;

  const [items, totalResult] = await Promise.all([
    db.select().from(tasks)
      .where(and(eq(tasks.userId, userId), sql`${tasks.deletedAt} IS NULL`))
      .orderBy(desc(tasks.sortOrder), desc(tasks.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: count() }).from(tasks)
      .where(and(eq(tasks.userId, userId), sql`${tasks.deletedAt} IS NULL`)),
  ]);

  return c.json({
    success: true,
    data: {
      items,
      total: totalResult[0].count,
      page,
      pageSize,
      hasMore: offset + items.length < totalResult[0].count,
    },
  });
});

app.get('/api/tasks/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const task = await db.select().from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), sql`${tasks.deletedAt} IS NULL`))
    .limit(1);

  if (task.length === 0) {
    throw new HTTPException(404, { message: 'Task not found' });
  }

  return c.json({ success: true, data: task[0] });
});

app.post('/api/tasks', zValidator('json', createTaskInputSchema), async (c) => {
  const userId = c.get('userId');
  const input = c.req.valid('json');

  const now = new Date().toISOString();
  const correlationId = uuidv4();

  const [newTask] = await db.insert(tasks).values({
    ...input,
    userId,
    createdAt: now,
    updatedAt: now,
    version: 1,
  }).returning();

  await db.insert(domainEvents).values({
    type: 'task.created',
    payload: newTask,
    correlationId,
    userId,
    deviceId: c.req.header('X-Device-ID') || 'web',
  });

  return c.json({ success: true, data: newTask }, 201);
});

app.patch('/api/tasks/:id', zValidator('json', updateTaskInputSchema), async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const input = c.req.valid('json');
  const correlationId = uuidv4();

  const existing = await db.select().from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), sql`${tasks.deletedAt} IS NULL`))
    .limit(1);

  if (existing.length === 0) {
    throw new HTTPException(404, { message: 'Task not found' });
  }

  const now = new Date().toISOString();
  const [updated] = await db.update(tasks)
    .set({ ...input, updatedAt: now, version: existing[0].version + 1 })
    .where(eq(tasks.id, id))
    .returning();

  await db.insert(domainEvents).values({
    type: 'task.updated',
    payload: { id, ...input },
    correlationId,
    userId,
    deviceId: c.req.header('X-Device-ID') || 'web',
  });

  return c.json({ success: true, data: updated });
});

app.delete('/api/tasks/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const correlationId = uuidv4();

  const existing = await db.select().from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), sql`${tasks.deletedAt} IS NULL`))
    .limit(1);

  if (existing.length === 0) {
    throw new HTTPException(404, { message: 'Task not found' });
  }

  const now = new Date().toISOString();
  await db.update(tasks)
    .set({ deletedAt: now, updatedAt: now, version: existing[0].version + 1 })
    .where(eq(tasks.id, id));

  await db.insert(domainEvents).values({
    type: 'task.deleted',
    payload: { id },
    correlationId,
    userId,
    deviceId: c.req.header('X-Device-ID') || 'web',
  });

  return c.json({ success: true, data: { id, deleted: true } });
});

app.get('/api/time-entries', zValidator('query', paginatedQuerySchema.extend({
  taskId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})), async (c) => {
  const userId = c.get('userId');
  const { page, pageSize, taskId, startDate, endDate } = c.req.valid('query');
  const offset = (page - 1) * pageSize;

  const conditions = [eq(timeEntries.userId, userId)];
  if (taskId) conditions.push(eq(timeEntries.taskId, taskId));
  if (startDate) conditions.push(gte(timeEntries.startedAt, startDate));
  if (endDate) conditions.push(lte(timeEntries.startedAt, endDate));

  const [items, totalResult] = await Promise.all([
    db.select().from(timeEntries)
      .where(and(...conditions))
      .orderBy(desc(timeEntries.startedAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: count() }).from(timeEntries)
      .where(and(...conditions)),
  ]);

  return c.json({
    success: true,
    data: {
      items,
      total: totalResult[0].count,
      page,
      pageSize,
      hasMore: offset + items.length < totalResult[0].count,
    },
  });
});

app.post('/api/time-entries', zValidator('json', createTimeEntryInputSchema), async (c) => {
  const userId = c.get('userId');
  const input = c.req.valid('json');
  const correlationId = uuidv4();

  const [newEntry] = await db.insert(timeEntries).values({
    ...input,
    userId,
    syncedAt: new Date().toISOString(),
  }).returning();

  await db.update(tasks)
    .set({ totalTrackedSeconds: sql`${tasks.totalTrackedSeconds} + ${input.durationSeconds || 0}` })
    .where(eq(tasks.id, input.taskId));

  await db.insert(domainEvents).values({
    type: 'time.logged',
    payload: newEntry,
    correlationId,
    userId,
    deviceId: c.req.header('X-Device-ID') || 'web',
  });

  return c.json({ success: true, data: newEntry }, 201);
});

app.patch('/api/time-entries/:id', zValidator('json', updateTimeEntryInputSchema), async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const input = c.req.valid('json');
  const correlationId = uuidv4();

  const existing = await db.select().from(timeEntries)
    .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    throw new HTTPException(404, { message: 'Time entry not found' });
  }

  const [updated] = await db.update(timeEntries)
    .set(input)
    .where(eq(timeEntries.id, id))
    .returning();

  return c.json({ success: true, data: updated });
});

app.get('/api/projects', zValidator('query', paginatedQuerySchema), async (c) => {
  const userId = c.get('userId');
  const { page, pageSize } = c.req.valid('query');
  const offset = (page - 1) * pageSize;

  const [items, totalResult] = await Promise.all([
    db.select().from(projects)
      .where(and(eq(projects.userId, userId), sql`${projects.archivedAt} IS NULL`))
      .orderBy(desc(projects.sortOrder), desc(projects.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: count() }).from(projects)
      .where(and(eq(projects.userId, userId), sql`${projects.archivedAt} IS NULL`)),
  ]);

  return c.json({
    success: true,
    data: {
      items,
      total: totalResult[0].count,
      page,
      pageSize,
      hasMore: offset + items.length < totalResult[0].count,
    },
  });
});

app.post('/api/projects', zValidator('json', createProjectInputSchema), async (c) => {
  const userId = c.get('userId');
  const input = c.req.valid('json');

  const [newProject] = await db.insert(projects).values({
    ...input,
    userId,
  }).returning();

  return c.json({ success: true, data: newProject }, 201);
});

app.patch('/api/projects/:id', zValidator('json', updateProjectInputSchema), async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const input = c.req.valid('json');

  const existing = await db.select().from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId), sql`${projects.archivedAt} IS NULL`))
    .limit(1);

  if (existing.length === 0) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  const [updated] = await db.update(projects)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(projects.id, id))
    .returning();

  return c.json({ success: true, data: updated });
});

app.delete('/api/projects/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const existing = await db.select().from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId), sql`${projects.archivedAt} IS NULL`))
    .limit(1);

  if (existing.length === 0) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  await db.update(projects)
    .set({ archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(projects.id, id));

  return c.json({ success: true, data: { id, archived: true } });
});

app.get('/api/websocket', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }

  const id = c.env.WEBSOCKET_SERVER.idFromName('main');
  const stub = c.env.WEBSOCKET_SERVER.get(id);
  return stub.fetch(c.req.raw);
});

export default app;