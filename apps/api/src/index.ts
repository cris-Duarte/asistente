import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { and, asc, count, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import {
  db,
  devices,
  mutationReceipts,
  passkeyCredentials,
  projects,
  recoveryCodes,
  sessions,
  tasks,
  timeEntries,
  users,
} from '@productivity-assistant/db-schema';
import auth from './routes/auth';
import deviceRoutes from './routes/devices';
import { authenticate, type AuthVariables } from './auth/security';
import { parseJson, parseQuery } from './validation';

const app = new Hono<{ Variables: AuthVariables }>();
const uuid = z.string().uuid();
const taskInput = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['pending', 'active', 'paused', 'done', 'archived']).default('pending'),
  projectId: uuid.nullable().optional(),
  parentTaskId: uuid.nullable().optional(),
  sortOrder: z.number().int().default(0),
  estimatedMinutes: z.number().int().positive().nullable().optional(),
  isParallel: z.boolean().default(false),
  metadata: z.record(z.unknown()).default({}),
});
const projectInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  sortOrder: z.number().int().default(0),
});
const timeEntryInput = z.object({
  id: uuid.optional(),
  taskId: uuid,
  startedAt: z.string().datetime({ offset: true }).optional(),
  endedAt: z.string().datetime({ offset: true }).nullable().optional(),
  source: z.enum(['manual', 'pomodoro', 'auto', 'imported']).default('manual'),
  deviceId: z.string().min(1).max(120).default('web'),
  metadata: z.record(z.unknown()).default({}),
});
const pageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(100),
});

app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', cors({
  origin: (origin) => {
    const allowed = (process.env.APP_ORIGINS ?? 'http://localhost:5173').split(',').map((item) => item.trim());
    return allowed.includes(origin) ? origin : allowed[0];
  },
  allowHeaders: ['Content-Type', 'Authorization', 'X-Device-ID', 'Idempotency-Key', 'X-Base-Version'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  exposeHeaders: ['Electric-Handle', 'Electric-Offset', 'Electric-Cursor'],
  credentials: true,
  maxAge: 600,
}));

app.use('/api/*', async (c, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method) && !c.req.header('Authorization')) {
    const origin = c.req.header('Origin');
    const allowed = (process.env.APP_ORIGINS ?? 'http://localhost:5173').split(',').map((item) => item.trim());
    if (origin && !allowed.includes(origin)) throw new HTTPException(403, { message: 'Origen no permitido.' });
  }
  const publicPaths = new Set([
    '/api/auth/setup/status',
    '/api/auth/setup/passkey/options',
    '/api/auth/setup/passkey/verify',
    '/api/auth/passkey/options',
    '/api/auth/passkey/verify',
    '/api/auth/recovery',
    '/api/devices/pairing/start',
    '/api/devices/pairing/poll',
  ]);
  if (publicPaths.has(c.req.path)) return next();
  return authenticate(c, next);
});

app.onError((error, c) => {
  console.error(error);
  if (error instanceof HTTPException) {
    return c.json({ success: false, error: { code: `HTTP_${error.status}`, message: error.message } }, error.status);
  }
  if ((error as { code?: string }).code === '23505') {
    return c.json({ success: false, error: { code: 'CONFLICT', message: 'El cambio entra en conflicto con el estado actual.' } }, 409);
  }
  return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' } }, 500);
});
app.notFound((c) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } }, 404));

app.get('/health', async (c) => {
  await db.execute(sql`select 1`);
  return c.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

app.route('/api/auth', auth);
app.route('/api/devices', deviceRoutes);

type MutationResult = { status: number; data: unknown };
async function mutate(c: Context<{ Variables: AuthVariables }>, handler: (tx: any, writeId: string) => Promise<MutationResult>) {
  const key = c.req.header('Idempotency-Key');
  if (!key || key.length < 16 || key.length > 200) throw new HTTPException(400, { message: 'Idempotency-Key es obligatorio.' });
  const userId = c.get('userId');
  const result = await db.transaction(async (tx) => {
    const cached = await tx.select().from(mutationReceipts).where(and(
      eq(mutationReceipts.userId, userId),
      eq(mutationReceipts.idempotencyKey, key),
    )).limit(1);
    if (cached[0]) return { status: cached[0].statusCode, data: cached[0].response };
    const output = await handler(tx, key);
    const body = { success: true, data: output.data };
    await tx.insert(mutationReceipts).values({
      userId,
      idempotencyKey: key,
      method: c.req.method,
      path: c.req.path,
      statusCode: output.status,
      response: body,
    });
    return { status: output.status, data: body };
  });
  return c.json(result.data as any, result.status as any);
}

function baseVersion(c: Context): number {
  const value = Number(c.req.header('X-Base-Version'));
  if (!Number.isInteger(value) || value < 1) throw new HTTPException(400, { message: 'X-Base-Version es obligatorio.' });
  return value;
}

const taskQuery = pageQuery.extend({
  includeDeleted: z.coerce.boolean().default(false),
  projectId: uuid.optional(),
  status: z.enum(['pending', 'active', 'paused', 'done', 'archived']).optional(),
});
app.get('/api/tasks', async (c) => {
  const { page, pageSize, includeDeleted, projectId, status } = parseQuery(c, taskQuery);
  const conditions = [eq(tasks.userId, c.get('userId'))];
  if (!includeDeleted) conditions.push(isNull(tasks.deletedAt));
  if (projectId) conditions.push(eq(tasks.projectId, projectId));
  if (status) conditions.push(eq(tasks.status, status));
  const offset = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    db.select().from(tasks).where(and(...conditions)).orderBy(desc(tasks.sortOrder), desc(tasks.createdAt)).limit(pageSize).offset(offset),
    db.select({ count: count() }).from(tasks).where(and(...conditions)),
  ]);
  const totalCount = Number(total[0]?.count ?? 0);
  return c.json({ success: true, data: { items, total: totalCount, page, pageSize, hasMore: offset + items.length < totalCount } });
});

app.post('/api/tasks', async (c) => {
  const input = await parseJson(c, taskInput);
  return mutate(c, async (tx, writeId) => {
    const [item] = await tx.insert(tasks).values({ ...input, userId: c.get('userId'), lastWriteId: writeId }).returning();
    return { status: 201, data: item };
  });
});

app.patch('/api/tasks/:id', async (c) => {
  const input = await parseJson(c, taskInput.partial().omit({ id: true }));
  return mutate(c, async (tx, writeId) => {
    const version = baseVersion(c);
    const existing = await tx.select().from(tasks).where(and(eq(tasks.id, c.req.param('id')), eq(tasks.userId, c.get('userId')))).limit(1);
    if (!existing[0]) throw new HTTPException(404, { message: 'Tarea no encontrada.' });
    if (existing[0].version !== version) throw new HTTPException(409, { message: JSON.stringify({ message: 'Conflicto de versión.', current: existing[0] }) });
    const [item] = await tx.update(tasks).set({
      ...input,
      version: version + 1,
      lastWriteId: writeId,
      updatedAt: new Date(),
    }).where(and(eq(tasks.id, existing[0].id), eq(tasks.version, version))).returning();
    return { status: 200, data: item };
  });
});

app.delete('/api/tasks/:id', async (c) => mutate(c, async (tx, writeId) => {
  const version = baseVersion(c);
  const [item] = await tx.update(tasks).set({
    deletedAt: new Date(),
    updatedAt: new Date(),
    version: version + 1,
    lastWriteId: writeId,
  }).where(and(eq(tasks.id, c.req.param('id')), eq(tasks.userId, c.get('userId')), eq(tasks.version, version))).returning();
  if (!item) {
    const current = await tx.select().from(tasks).where(and(eq(tasks.id, c.req.param('id')), eq(tasks.userId, c.get('userId')))).limit(1);
    if (current[0]) throw new HTTPException(409, { message: JSON.stringify({ message: 'Conflicto de versión.', current: current[0] }) });
    throw new HTTPException(404, { message: 'Tarea no encontrada.' });
  }
  return { status: 200, data: item };
}));

const projectQuery = pageQuery.extend({ includeArchived: z.coerce.boolean().default(false) });
app.get('/api/projects', async (c) => {
  const { page, pageSize, includeArchived } = parseQuery(c, projectQuery);
  const conditions = [eq(projects.userId, c.get('userId')), isNull(projects.deletedAt)];
  if (!includeArchived) conditions.push(isNull(projects.archivedAt));
  const offset = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    db.select().from(projects).where(and(...conditions)).orderBy(desc(projects.sortOrder), asc(projects.name)).limit(pageSize).offset(offset),
    db.select({ count: count() }).from(projects).where(and(...conditions)),
  ]);
  const totalCount = Number(total[0]?.count ?? 0);
  return c.json({ success: true, data: { items, total: totalCount, page, pageSize, hasMore: offset + items.length < totalCount } });
});

app.post('/api/projects', async (c) => {
  const input = await parseJson(c, projectInput);
  return mutate(c, async (tx, writeId) => {
    const [item] = await tx.insert(projects).values({ ...input, userId: c.get('userId'), lastWriteId: writeId }).returning();
    return { status: 201, data: item };
  });
});

app.patch('/api/projects/:id', async (c) => {
  const input = await parseJson(c, projectInput.partial().omit({ id: true }));
  return mutate(c, async (tx, writeId) => {
    const version = baseVersion(c);
    const [item] = await tx.update(projects).set({
      ...input,
      version: version + 1,
      updatedAt: new Date(),
      lastWriteId: writeId,
    }).where(and(eq(projects.id, c.req.param('id')), eq(projects.userId, c.get('userId')), eq(projects.version, version))).returning();
    if (!item) throw new HTTPException(409, { message: 'El proyecto cambió en otro dispositivo.' });
    return { status: 200, data: item };
  });
});

app.delete('/api/projects/:id', async (c) => mutate(c, async (tx, writeId) => {
  const version = baseVersion(c);
  const [item] = await tx.update(projects).set({
    archivedAt: new Date(),
    version: version + 1,
    updatedAt: new Date(),
    lastWriteId: writeId,
  }).where(and(eq(projects.id, c.req.param('id')), eq(projects.userId, c.get('userId')), eq(projects.version, version))).returning();
  if (!item) throw new HTTPException(409, { message: 'El proyecto cambió en otro dispositivo.' });
  return { status: 200, data: item };
}));

app.post('/api/projects/:id/restore', async (c) => mutate(c, async (tx, writeId) => {
  const version = baseVersion(c);
  const [item] = await tx.update(projects).set({
    archivedAt: null,
    version: version + 1,
    updatedAt: new Date(),
    lastWriteId: writeId,
  }).where(and(eq(projects.id, c.req.param('id')), eq(projects.userId, c.get('userId')), eq(projects.version, version))).returning();
  if (!item) throw new HTTPException(409, { message: 'El proyecto cambió en otro dispositivo.' });
  return { status: 200, data: item };
}));

const timeEntryQuery = pageQuery.extend({
  taskId: uuid.optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});
app.get('/api/time-entries', async (c) => {
  const { page, pageSize, taskId, startDate, endDate } = parseQuery(c, timeEntryQuery);
  const conditions = [eq(timeEntries.userId, c.get('userId')), isNull(timeEntries.deletedAt)];
  if (taskId) conditions.push(eq(timeEntries.taskId, taskId));
  if (startDate) conditions.push(gte(timeEntries.startedAt, new Date(startDate)));
  if (endDate) conditions.push(lte(timeEntries.startedAt, new Date(endDate)));
  const offset = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    db.select().from(timeEntries).where(and(...conditions)).orderBy(desc(timeEntries.startedAt)).limit(pageSize).offset(offset),
    db.select({ count: count() }).from(timeEntries).where(and(...conditions)),
  ]);
  const totalCount = Number(total[0]?.count ?? 0);
  return c.json({ success: true, data: { items, total: totalCount, page, pageSize, hasMore: offset + items.length < totalCount } });
});

app.get('/api/time-entries/active', async (c) => {
  const [item] = await db.select().from(timeEntries).where(and(
    eq(timeEntries.userId, c.get('userId')),
    isNull(timeEntries.endedAt),
    isNull(timeEntries.deletedAt),
  )).limit(1);
  return c.json({ success: true, data: item ?? null });
});

app.post('/api/time-entries', async (c) => {
  const input = await parseJson(c, timeEntryInput);
  return mutate(c, async (tx, writeId) => {
    const start = input.startedAt ? new Date(input.startedAt) : new Date();
    const end = input.endedAt ? new Date(input.endedAt) : null;
    const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.userId, c.get('userId')), isNull(tasks.deletedAt))).limit(1);
    if (!task) throw new HTTPException(404, { message: 'Tarea no encontrada.' });
    const [item] = await tx.insert(timeEntries).values({
      ...input,
      userId: c.get('userId'),
      startedAt: start,
      endedAt: end,
      durationSeconds: end ? Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000)) : null,
      lastWriteId: writeId,
    }).returning();
    return { status: 201, data: item };
  });
});

app.patch('/api/time-entries/:id', async (c) => {
  const input = await parseJson(c, z.object({ endedAt: z.string().datetime({ offset: true }) }));
  return mutate(c, async (tx, writeId) => {
    const version = baseVersion(c);
    const existing = await tx.select().from(timeEntries).where(and(eq(timeEntries.id, c.req.param('id')), eq(timeEntries.userId, c.get('userId')))).limit(1);
    if (!existing[0]) throw new HTTPException(404, { message: 'Registro de tiempo no encontrado.' });
    if (existing[0].version !== version) throw new HTTPException(409, { message: JSON.stringify({ message: 'Conflicto de versión.', current: existing[0] }) });
    const end = new Date(input.endedAt);
    const duration = Math.max(0, Math.floor((end.getTime() - existing[0].startedAt.getTime()) / 1000));
    const [item] = await tx.update(timeEntries).set({
      endedAt: end,
      durationSeconds: duration,
      updatedAt: new Date(),
      version: version + 1,
      lastWriteId: writeId,
    }).where(and(eq(timeEntries.id, existing[0].id), eq(timeEntries.version, version))).returning();
    if (!existing[0].endedAt) {
      await tx.update(tasks).set({
        totalTrackedSeconds: sql`${tasks.totalTrackedSeconds} + ${duration}`,
        updatedAt: new Date(),
        version: sql`${tasks.version} + 1`,
        lastWriteId: writeId,
      }).where(eq(tasks.id, existing[0].taskId));
    }
    return { status: 200, data: item };
  });
});

app.get('/api/dashboard', async (c) => {
  const userId = c.get('userId');
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const [allTasks, recentEntries] = await Promise.all([
    db.select().from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt))),
    db.select().from(timeEntries).where(and(eq(timeEntries.userId, userId), isNull(timeEntries.deletedAt), gte(timeEntries.startedAt, startToday))),
  ]);
  const trackedToday = recentEntries.reduce((sum, entry) => sum + (entry.durationSeconds ?? (entry.endedAt ? Math.floor((entry.endedAt.getTime() - entry.startedAt.getTime()) / 1000) : 0)), 0);
  return c.json({ success: true, data: {
    totalTasks: allTasks.length,
    pendingTasks: allTasks.filter((task) => !['done', 'archived'].includes(task.status)).length,
    completedTasks: allTasks.filter((task) => task.status === 'done').length,
    trackedToday,
    recentTasks: [...allTasks].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 5),
  } });
});

app.get('/api/export', async (c) => {
  const userId = c.get('userId');
  const [owner, projectRows, taskRows, entryRows] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(projects).where(eq(projects.userId, userId)),
    db.select().from(tasks).where(eq(tasks.userId, userId)),
    db.select().from(timeEntries).where(eq(timeEntries.userId, userId)),
  ]);
  return c.json({ success: true, data: {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    owner: owner[0] ? { name: owner[0].name, email: owner[0].email, timezone: owner[0].timezone, preferences: owner[0].preferences } : null,
    projects: projectRows,
    tasks: taskRows,
    timeEntries: entryRows,
  } });
});

const importedProject = z.object({
  id: uuid, name: z.string().min(1).max(100), color: z.string().nullable().optional(), icon: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0), archivedAt: z.string().datetime({ offset: true }).nullable().optional(),
  deletedAt: z.string().datetime({ offset: true }).nullable().optional(), version: z.number().int().positive().default(1),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
});
const importedTask = taskInput.extend({
  id: uuid, totalTrackedSeconds: z.number().int().nonnegative().default(0), version: z.number().int().positive().default(1),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
  deletedAt: z.string().datetime({ offset: true }).nullable().optional(),
});
const importedTimeEntry = timeEntryInput.extend({
  id: uuid, startedAt: z.string().datetime({ offset: true }), durationSeconds: z.number().int().nonnegative().nullable().optional(),
  syncedAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
  deletedAt: z.string().datetime({ offset: true }).nullable().optional(), version: z.number().int().positive().default(1),
});
const importSchema = z.object({
  schemaVersion: z.literal(1),
  projects: z.array(importedProject).default([]),
  tasks: z.array(importedTask).default([]),
  timeEntries: z.array(importedTimeEntry).default([]),
});
app.post('/api/import/preview', async (c) => {
  const input = await parseJson(c, importSchema);
  return c.json({ success: true, data: {
    valid: true,
    counts: { projects: input.projects.length, tasks: input.tasks.length, timeEntries: input.timeEntries.length },
  } });
});

app.post('/api/import/apply', async (c) => {
  const input = await parseJson(c, importSchema);
  return mutate(c, async (tx, writeId) => {
  if (input.timeEntries.filter((entry) => !entry.endedAt && !entry.deletedAt).length > 1) {
    throw new HTTPException(400, { message: 'La importación contiene más de un temporizador activo.' });
  }
  const userId = c.get('userId');
  for (const project of input.projects) {
    await tx.insert(projects).values({
      ...project,
      userId,
      color: project.color ?? null,
      icon: project.icon ?? null,
      archivedAt: project.archivedAt ? new Date(project.archivedAt) : null,
      deletedAt: project.deletedAt ? new Date(project.deletedAt) : null,
      createdAt: new Date(project.createdAt),
      updatedAt: new Date(project.updatedAt),
      lastWriteId: writeId,
    }).onConflictDoUpdate({ target: projects.id, set: {
      name: project.name, color: project.color ?? null, icon: project.icon ?? null, sortOrder: project.sortOrder,
      archivedAt: project.archivedAt ? new Date(project.archivedAt) : null,
      deletedAt: project.deletedAt ? new Date(project.deletedAt) : null,
      updatedAt: new Date(project.updatedAt), version: project.version, lastWriteId: writeId,
    } });
  }
  for (const task of input.tasks) {
    await tx.insert(tasks).values({
      ...task, userId, description: task.description ?? null, projectId: task.projectId ?? null, parentTaskId: task.parentTaskId ?? null,
      estimatedMinutes: task.estimatedMinutes ?? null, deletedAt: task.deletedAt ? new Date(task.deletedAt) : null,
      createdAt: new Date(task.createdAt), updatedAt: new Date(task.updatedAt), lastWriteId: writeId,
    }).onConflictDoUpdate({ target: tasks.id, set: {
      title: task.title, description: task.description ?? null, status: task.status, projectId: task.projectId ?? null,
      parentTaskId: task.parentTaskId ?? null, sortOrder: task.sortOrder, estimatedMinutes: task.estimatedMinutes ?? null,
      totalTrackedSeconds: task.totalTrackedSeconds, isParallel: task.isParallel, metadata: task.metadata,
      deletedAt: task.deletedAt ? new Date(task.deletedAt) : null, updatedAt: new Date(task.updatedAt), version: task.version, lastWriteId: writeId,
    } });
  }
  for (const entry of input.timeEntries) {
    const startedAt = new Date(entry.startedAt);
    const endedAt = entry.endedAt ? new Date(entry.endedAt) : null;
    await tx.insert(timeEntries).values({
      ...entry, userId, startedAt, endedAt, durationSeconds: entry.durationSeconds ?? (endedAt ? Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000) : null),
      syncedAt: new Date(entry.syncedAt), updatedAt: new Date(entry.updatedAt), deletedAt: entry.deletedAt ? new Date(entry.deletedAt) : null, lastWriteId: writeId,
    }).onConflictDoUpdate({ target: timeEntries.id, set: {
      taskId: entry.taskId, startedAt, endedAt, durationSeconds: entry.durationSeconds ?? null, source: entry.source,
      deviceId: entry.deviceId, metadata: entry.metadata, syncedAt: new Date(entry.syncedAt), updatedAt: new Date(entry.updatedAt),
      deletedAt: entry.deletedAt ? new Date(entry.deletedAt) : null, version: entry.version, lastWriteId: writeId,
    } });
  }
    return { status: 200, data: { imported: { projects: input.projects.length, tasks: input.tasks.length, timeEntries: input.timeEntries.length } } };
  });
});

app.get('/api/shapes/:resource', async (c) => {
  const table = ({ tasks: 'tasks', projects: 'projects', 'time-entries': 'time_entries' } as Record<string, string>)[c.req.param('resource')];
  if (!table) throw new HTTPException(404, { message: 'Shape desconocido.' });
  const electricUrl = process.env.ELECTRIC_URL ?? 'http://electric:3000';
  const url = new URL('/v1/shape', electricUrl);
  const passthrough = ['offset', 'handle', 'live', 'cursor', 'columns', 'replica', 'log', 'live_sse'];
  for (const name of passthrough) {
    const value = c.req.query(name);
    if (value) url.searchParams.set(name, value);
  }
  url.searchParams.set('table', table);
  url.searchParams.set('where', `user_id = '${c.get('userId').replaceAll("'", "''")}'`);
  if (process.env.ELECTRIC_SECRET) url.searchParams.set('secret', process.env.ELECTRIC_SECRET);
  const upstream = await fetch(url, { headers: { Accept: c.req.header('Accept') ?? '*/*' } });
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
});

app.get('/api/security/summary', async (c) => {
  const userId = c.get('userId');
  const [passkeys, activeSessions, activeCodes, linkedDevices] = await Promise.all([
    db.select({ count: count() }).from(passkeyCredentials).where(eq(passkeyCredentials.userId, userId)),
    db.select({ count: count() }).from(sessions).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gte(sessions.expiresAt, new Date()))),
    db.select({ count: count() }).from(recoveryCodes).where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt))),
    db.select({ count: count() }).from(devices).where(and(eq(devices.userId, userId), isNull(devices.revokedAt))),
  ]);
  return c.json({ success: true, data: {
    passkeys: Number(passkeys[0]?.count ?? 0),
    sessions: Number(activeSessions[0]?.count ?? 0),
    recoveryCodes: Number(activeCodes[0]?.count ?? 0),
    devices: Number(linkedDevices[0]?.count ?? 0),
  } });
});

export default app;
