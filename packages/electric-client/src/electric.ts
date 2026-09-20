import { PGlite } from '@electric-sql/pglite';
import { Shape, ShapeStream, type Row } from '@electric-sql/client';
import type { Project, Task, TimeEntry, TaskStatus } from '@productivity-assistant/shared';
import { retryDelayMs } from './sync-model';

export type EntityName = 'tasks' | 'projects' | 'time_entries';
export type SyncPhase = 'offline' | 'connecting' | 'syncing' | 'synced' | 'error';

export interface Conflict {
  id: string;
  mutationId: string;
  entity: EntityName;
  entityId: string;
  local: Record<string, unknown>;
  server: Record<string, unknown>;
  createdAt: string;
}

export interface ClientSnapshot {
  ready: boolean;
  phase: SyncPhase;
  pending: number;
  conflicts: Conflict[];
  tasks: Task[];
  projects: Project[];
  timeEntries: TimeEntry[];
  error?: string;
  lastSyncedAt?: string;
}

interface OutboxRow {
  id: string;
  entity: EntityName;
  entity_id: string;
  method: string;
  path: string;
  body: string | null;
  base_version: number | null;
  attempts: number;
  next_attempt_at: string;
  state: string;
}

const initialSnapshot: ClientSnapshot = {
  ready: false,
  phase: navigator.onLine ? 'connecting' : 'offline',
  pending: 0,
  conflicts: [],
  tasks: [],
  projects: [],
  timeEntries: [],
};

function iso(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return new Date(String(value)).toISOString();
}

function metadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return value as Record<string, unknown>;
}

function normalizeServerRow(entity: EntityName, value: Record<string, unknown>): Record<string, unknown> {
  const field = (snake: string, camel: string) => value[snake] ?? value[camel];
  if (entity === 'tasks') {
    return {
      id: value.id, user_id: field('user_id', 'userId'), title: value.title, description: value.description,
      status: value.status, project_id: field('project_id', 'projectId'), parent_task_id: field('parent_task_id', 'parentTaskId'),
      sort_order: field('sort_order', 'sortOrder'), estimated_minutes: field('estimated_minutes', 'estimatedMinutes'),
      total_tracked_seconds: field('total_tracked_seconds', 'totalTrackedSeconds'), is_parallel: field('is_parallel', 'isParallel'),
      metadata: value.metadata, created_at: field('created_at', 'createdAt'), updated_at: field('updated_at', 'updatedAt'),
      deleted_at: field('deleted_at', 'deletedAt'), version: value.version, last_write_id: field('last_write_id', 'lastWriteId'),
    };
  }
  if (entity === 'projects') {
    return {
      id: value.id, user_id: field('user_id', 'userId'), name: value.name, color: value.color, icon: value.icon,
      sort_order: field('sort_order', 'sortOrder'), created_at: field('created_at', 'createdAt'), updated_at: field('updated_at', 'updatedAt'),
      archived_at: field('archived_at', 'archivedAt'), deleted_at: field('deleted_at', 'deletedAt'), version: value.version,
      last_write_id: field('last_write_id', 'lastWriteId'),
    };
  }
  return {
    id: value.id, task_id: field('task_id', 'taskId'), user_id: field('user_id', 'userId'),
    started_at: field('started_at', 'startedAt'), ended_at: field('ended_at', 'endedAt'),
    duration_seconds: field('duration_seconds', 'durationSeconds'), source: value.source, device_id: field('device_id', 'deviceId'),
    metadata: value.metadata, synced_at: field('synced_at', 'syncedAt'), updated_at: field('updated_at', 'updatedAt'),
    deleted_at: field('deleted_at', 'deletedAt'), version: value.version, last_write_id: field('last_write_id', 'lastWriteId'),
  };
}

function mapTask(row: Record<string, unknown>): Task {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: String(row.title),
    description: row.description ? String(row.description) : undefined,
    status: String(row.status) as TaskStatus,
    projectId: row.project_id ? String(row.project_id) : undefined,
    parentTaskId: row.parent_task_id ? String(row.parent_task_id) : undefined,
    sortOrder: Number(row.sort_order ?? 0),
    estimatedMinutes: row.estimated_minutes === null ? undefined : Number(row.estimated_minutes),
    totalTrackedSeconds: Number(row.total_tracked_seconds ?? 0),
    isParallel: Boolean(row.is_parallel),
    metadata: { tags: [], energyLevel: 'medium', context: 'deep_work', ...metadata(row.metadata) } as Task['metadata'],
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    deletedAt: iso(row.deleted_at),
    version: Number(row.version ?? 1),
    lastWriteId: row.last_write_id ? String(row.last_write_id) : undefined,
  };
}

function mapProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    color: row.color ? String(row.color) : undefined,
    icon: row.icon ? String(row.icon) : undefined,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    archivedAt: iso(row.archived_at),
    deletedAt: iso(row.deleted_at),
    version: Number(row.version ?? 1),
    lastWriteId: row.last_write_id ? String(row.last_write_id) : undefined,
  };
}

function mapTimeEntry(row: Record<string, unknown>): TimeEntry {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    userId: String(row.user_id),
    startedAt: iso(row.started_at)!,
    endedAt: iso(row.ended_at),
    durationSeconds: row.duration_seconds === null ? undefined : Number(row.duration_seconds),
    source: String(row.source) as TimeEntry['source'],
    deviceId: String(row.device_id),
    metadata: metadata(row.metadata),
    syncedAt: iso(row.synced_at)!,
    updatedAt: iso(row.updated_at)!,
    deletedAt: iso(row.deleted_at),
    version: Number(row.version ?? 1),
    lastWriteId: row.last_write_id ? String(row.last_write_id) : undefined,
  };
}

export class OfflineElectricClient {
  private pg: PGlite | null = null;
  private userId = '';
  private apiUrl = '';
  private shapes: Shape<Row>[] = [];
  private listeners = new Set<() => void>();
  private snapshot: ClientSnapshot = initialSnapshot;
  private flushPromise: Promise<void> | null = null;
  private interval?: number;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.snapshot;

  private setSnapshot(patch: Partial<ClientSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  async initialize(userId: string, apiUrl: string): Promise<void> {
    if (this.pg && this.userId === userId) return;
    await this.destroy();
    this.userId = userId;
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.setSnapshot({ ...initialSnapshot, phase: navigator.onLine ? 'connecting' : 'offline' });
    this.pg = await PGlite.create({ dataDir: `idb://productivity-${userId}` });
    await this.createSchema();
    await this.pg.exec(`UPDATE outbox SET state = 'pending' WHERE state = 'sent'`);
    await this.refreshSnapshot();
    this.startShapes();
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    this.interval = window.setInterval(() => { void this.flush(); }, 15_000);
    if (navigator.onLine) void this.flush();
  }

  private async createSchema() {
    await this.pg!.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT,
        status TEXT NOT NULL, project_id TEXT, parent_task_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
        estimated_minutes INTEGER, total_tracked_seconds INTEGER NOT NULL DEFAULT 0,
        is_parallel BOOLEAN NOT NULL DEFAULT FALSE, metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
        version INTEGER NOT NULL DEFAULT 1, last_write_id TEXT
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT, icon TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        archived_at TEXT, deleted_at TEXT, version INTEGER NOT NULL DEFAULT 1, last_write_id TEXT
      );
      CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, user_id TEXT NOT NULL, started_at TEXT NOT NULL,
        ended_at TEXT, duration_seconds INTEGER, source TEXT NOT NULL, device_id TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}', synced_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        deleted_at TEXT, version INTEGER NOT NULL DEFAULT 1, last_write_id TEXT
      );
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL, method TEXT NOT NULL,
        path TEXT NOT NULL, body TEXT, base_version INTEGER, created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS outbox_entity_idx ON outbox(entity, entity_id, created_at);
      CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY, mutation_id TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
        local_value TEXT NOT NULL, server_value TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `);
  }

  private startShapes() {
    const resources: Array<[EntityName, string]> = [['tasks', 'tasks'], ['projects', 'projects'], ['time_entries', 'time-entries']];
    for (const [entity, resource] of resources) {
      const stream = new ShapeStream<Row>({
        url: `${this.apiUrl}/api/shapes/${resource}`,
        subscribe: true,
        fetchClient: (input, init) => fetch(input, { ...init, credentials: 'include' }),
      });
      const shape = new Shape(stream);
      shape.subscribe(({ rows }) => {
        void this.applyShape(entity, rows as Array<Record<string, unknown>>).catch((error) => {
          this.setSnapshot({ phase: 'error', error: (error as Error).message });
        });
      });
      this.shapes.push(shape);
    }
  }

  private async applyShape(entity: EntityName, rows: Array<Record<string, unknown>>) {
    if (!this.pg) return;
    for (const row of rows) {
      const id = String(row.id);
      const pending = await this.pg.query<{ id: string; state: string }>(
        `SELECT id, state FROM outbox WHERE entity = $1 AND entity_id = $2 ORDER BY created_at LIMIT 1`,
        [entity, id],
      );
      const writeId = row.last_write_id ? String(row.last_write_id) : undefined;
      if (writeId) await this.pg.query(`DELETE FROM outbox WHERE id = $1`, [writeId]);
      if (pending.rows.length && pending.rows[0].id !== writeId) continue;
      await this.upsertServerRow(entity, row);
    }
    this.setSnapshot({ phase: 'synced', error: undefined, lastSyncedAt: new Date().toISOString() });
    await this.refreshSnapshot();
  }

  private async upsertServerRow(entity: EntityName, row: Record<string, unknown>) {
    const pg = this.pg!;
    row = normalizeServerRow(entity, row);
    if (entity === 'tasks') {
      await pg.query(`INSERT INTO tasks VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,title=excluded.title,description=excluded.description,status=excluded.status,
        project_id=excluded.project_id,parent_task_id=excluded.parent_task_id,sort_order=excluded.sort_order,estimated_minutes=excluded.estimated_minutes,
        total_tracked_seconds=excluded.total_tracked_seconds,is_parallel=excluded.is_parallel,metadata=excluded.metadata,
        created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,version=excluded.version,last_write_id=excluded.last_write_id`, [
        row.id, row.user_id, row.title, row.description, row.status, row.project_id, row.parent_task_id, row.sort_order,
        row.estimated_minutes, row.total_tracked_seconds, row.is_parallel, JSON.stringify(metadata(row.metadata)),
        iso(row.created_at), iso(row.updated_at), iso(row.deleted_at) ?? null, row.version, row.last_write_id,
      ]);
    } else if (entity === 'projects') {
      await pg.query(`INSERT INTO projects VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,name=excluded.name,color=excluded.color,icon=excluded.icon,
        sort_order=excluded.sort_order,created_at=excluded.created_at,updated_at=excluded.updated_at,archived_at=excluded.archived_at,
        deleted_at=excluded.deleted_at,version=excluded.version,last_write_id=excluded.last_write_id`, [
        row.id, row.user_id, row.name, row.color, row.icon, row.sort_order, iso(row.created_at), iso(row.updated_at),
        iso(row.archived_at) ?? null, iso(row.deleted_at) ?? null, row.version, row.last_write_id,
      ]);
    } else {
      await pg.query(`INSERT INTO time_entries VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id,user_id=excluded.user_id,started_at=excluded.started_at,
        ended_at=excluded.ended_at,duration_seconds=excluded.duration_seconds,source=excluded.source,device_id=excluded.device_id,
        metadata=excluded.metadata,synced_at=excluded.synced_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,
        version=excluded.version,last_write_id=excluded.last_write_id`, [
        row.id, row.task_id, row.user_id, iso(row.started_at), iso(row.ended_at) ?? null, row.duration_seconds, row.source,
        row.device_id, JSON.stringify(metadata(row.metadata)), iso(row.synced_at), iso(row.updated_at),
        iso(row.deleted_at) ?? null, row.version, row.last_write_id,
      ]);
    }
  }

  private async queue(tx: any, values: Omit<OutboxRow, 'attempts' | 'next_attempt_at' | 'state'>) {
    const now = new Date().toISOString();
    await tx.query(`INSERT INTO outbox (id,entity,entity_id,method,path,body,base_version,created_at,next_attempt_at,state)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,'pending')`, [
      values.id, values.entity, values.entity_id, values.method, values.path, values.body, values.base_version, now,
    ]);
  }

  async createTask(input: Pick<Task, 'title'> & Partial<Task>): Promise<Task> {
    const id = input.id ?? crypto.randomUUID();
    const writeId = crypto.randomUUID();
    const now = new Date().toISOString();
    const task: Task = {
      id, userId: this.userId, title: input.title, description: input.description, status: input.status ?? 'pending',
      projectId: input.projectId, parentTaskId: input.parentTaskId, sortOrder: input.sortOrder ?? 0,
      estimatedMinutes: input.estimatedMinutes, totalTrackedSeconds: 0, isParallel: input.isParallel ?? false,
      metadata: input.metadata ?? { tags: [], energyLevel: 'medium', context: 'deep_work' },
      createdAt: now, updatedAt: now, version: 1, lastWriteId: writeId,
    };
    const body = { id, title: task.title, description: task.description ?? null, status: task.status, projectId: task.projectId ?? null,
      parentTaskId: task.parentTaskId ?? null, sortOrder: task.sortOrder, estimatedMinutes: task.estimatedMinutes ?? null,
      isParallel: task.isParallel, metadata: task.metadata };
    await this.pg!.transaction(async (tx) => {
      await this.upsertTask(tx, task);
      await this.queue(tx, { id: writeId, entity: 'tasks', entity_id: id, method: 'POST', path: '/api/tasks', body: JSON.stringify(body), base_version: null });
    });
    await this.changed();
    return task;
  }

  async updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    const current = this.snapshot.tasks.find((item) => item.id === id);
    if (!current) throw new Error('Tarea no encontrada.');
    const writeId = crypto.randomUUID();
    const next: Task = { ...current, ...patch, id, userId: this.userId, updatedAt: new Date().toISOString(), version: current.version + 1, lastWriteId: writeId };
    const body = { title: patch.title, description: patch.description, status: patch.status, projectId: patch.projectId,
      parentTaskId: patch.parentTaskId, sortOrder: patch.sortOrder, estimatedMinutes: patch.estimatedMinutes,
      isParallel: patch.isParallel, metadata: patch.metadata };
    Object.keys(body).forEach((key) => (body as Record<string, unknown>)[key] === undefined && delete (body as Record<string, unknown>)[key]);
    await this.pg!.transaction(async (tx) => {
      await this.upsertTask(tx, next);
      await this.queue(tx, { id: writeId, entity: 'tasks', entity_id: id, method: 'PATCH', path: `/api/tasks/${id}`, body: JSON.stringify(body), base_version: current.version });
    });
    await this.changed();
    return next;
  }

  async deleteTask(id: string): Promise<void> {
    const current = this.snapshot.tasks.find((item) => item.id === id);
    if (!current) return;
    const writeId = crypto.randomUUID();
    await this.pg!.transaction(async (tx) => {
      await tx.query(`UPDATE tasks SET deleted_at=$1,updated_at=$1,version=version+1,last_write_id=$2 WHERE id=$3`, [new Date().toISOString(), writeId, id]);
      await this.queue(tx, { id: writeId, entity: 'tasks', entity_id: id, method: 'DELETE', path: `/api/tasks/${id}`, body: null, base_version: current.version });
    });
    await this.changed();
  }

  private async upsertTask(tx: any, task: Task) {
    await tx.query(`INSERT INTO tasks VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,status=excluded.status,project_id=excluded.project_id,
      parent_task_id=excluded.parent_task_id,sort_order=excluded.sort_order,estimated_minutes=excluded.estimated_minutes,
      total_tracked_seconds=excluded.total_tracked_seconds,is_parallel=excluded.is_parallel,metadata=excluded.metadata,
      updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,version=excluded.version,last_write_id=excluded.last_write_id`, [
      task.id, task.userId, task.title, task.description ?? null, task.status, task.projectId ?? null, task.parentTaskId ?? null,
      task.sortOrder, task.estimatedMinutes ?? null, task.totalTrackedSeconds, task.isParallel, JSON.stringify(task.metadata),
      task.createdAt, task.updatedAt, task.deletedAt ?? null, task.version, task.lastWriteId ?? null,
    ]);
  }

  async createProject(input: { name: string; color?: string }): Promise<Project> {
    const id = crypto.randomUUID();
    const writeId = crypto.randomUUID();
    const now = new Date().toISOString();
    const project: Project = { id, userId: this.userId, name: input.name, color: input.color, sortOrder: 0, createdAt: now, updatedAt: now, version: 1, lastWriteId: writeId };
    await this.pg!.transaction(async (tx) => {
      await tx.query(`INSERT INTO projects VALUES ($1,$2,$3,$4,NULL,0,$5,$5,NULL,NULL,1,$6)`, [id, this.userId, input.name, input.color ?? null, now, writeId]);
      await this.queue(tx, { id: writeId, entity: 'projects', entity_id: id, method: 'POST', path: '/api/projects', body: JSON.stringify({ id, name: input.name, color: input.color ?? null, sortOrder: 0 }), base_version: null });
    });
    await this.changed();
    return project;
  }

  async updateProject(id: string, patch: Partial<Project>): Promise<void> {
    const current = this.snapshot.projects.find((item) => item.id === id);
    if (!current) throw new Error('Proyecto no encontrado.');
    const writeId = crypto.randomUUID();
    const next = { ...current, ...patch, version: current.version + 1, updatedAt: new Date().toISOString(), lastWriteId: writeId };
    const body = { name: patch.name, color: patch.color, icon: patch.icon, sortOrder: patch.sortOrder };
    Object.keys(body).forEach((key) => (body as Record<string, unknown>)[key] === undefined && delete (body as Record<string, unknown>)[key]);
    await this.pg!.transaction(async (tx) => {
      await tx.query(`UPDATE projects SET name=$1,color=$2,icon=$3,sort_order=$4,updated_at=$5,version=$6,last_write_id=$7 WHERE id=$8`, [next.name, next.color ?? null, next.icon ?? null, next.sortOrder, next.updatedAt, next.version, writeId, id]);
      await this.queue(tx, { id: writeId, entity: 'projects', entity_id: id, method: 'PATCH', path: `/api/projects/${id}`, body: JSON.stringify(body), base_version: current.version });
    });
    await this.changed();
  }

  async archiveProject(id: string, restore = false): Promise<void> {
    const current = this.snapshot.projects.find((item) => item.id === id);
    if (!current) return;
    const writeId = crypto.randomUUID();
    const path = restore ? `/api/projects/${id}/restore` : `/api/projects/${id}`;
    const method = restore ? 'POST' : 'DELETE';
    await this.pg!.transaction(async (tx) => {
      await tx.query(`UPDATE projects SET archived_at=$1,updated_at=$2,version=version+1,last_write_id=$3 WHERE id=$4`, [restore ? null : new Date().toISOString(), new Date().toISOString(), writeId, id]);
      await this.queue(tx, { id: writeId, entity: 'projects', entity_id: id, method, path, body: null, base_version: current.version });
    });
    await this.changed();
  }

  async startTimer(taskId: string): Promise<TimeEntry> {
    const active = this.snapshot.timeEntries.find((entry) => !entry.endedAt && !entry.deletedAt);
    if (active) throw new Error('Ya existe un temporizador activo.');
    const id = crypto.randomUUID();
    const writeId = crypto.randomUUID();
    const now = new Date().toISOString();
    const entry: TimeEntry = { id, taskId, userId: this.userId, startedAt: now, source: 'manual', deviceId: 'web', metadata: {}, syncedAt: now, updatedAt: now, version: 1, lastWriteId: writeId };
    const body = { id, taskId, startedAt: now, source: 'manual', deviceId: 'web', metadata: {} };
    await this.pg!.transaction(async (tx) => {
      await tx.query(`INSERT INTO time_entries VALUES ($1,$2,$3,$4,NULL,NULL,'manual','web','{}',$4,$4,NULL,1,$5)`, [id, taskId, this.userId, now, writeId]);
      await this.queue(tx, { id: writeId, entity: 'time_entries', entity_id: id, method: 'POST', path: '/api/time-entries', body: JSON.stringify(body), base_version: null });
    });
    await this.changed();
    return entry;
  }

  async stopTimer(id: string): Promise<TimeEntry> {
    const current = this.snapshot.timeEntries.find((entry) => entry.id === id);
    if (!current || current.endedAt) throw new Error('No hay un temporizador activo.');
    const writeId = crypto.randomUUID();
    const endedAt = new Date().toISOString();
    const duration = Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(current.startedAt)) / 1000));
    const next = { ...current, endedAt, durationSeconds: duration, updatedAt: endedAt, version: current.version + 1, lastWriteId: writeId };
    await this.pg!.transaction(async (tx) => {
      await tx.query(`UPDATE time_entries SET ended_at=$1,duration_seconds=$2,updated_at=$1,version=version+1,last_write_id=$3 WHERE id=$4`, [endedAt, duration, writeId, id]);
      await tx.query(`UPDATE tasks SET total_tracked_seconds=total_tracked_seconds+$1,updated_at=$2 WHERE id=$3`, [duration, endedAt, current.taskId]);
      await this.queue(tx, { id: writeId, entity: 'time_entries', entity_id: id, method: 'PATCH', path: `/api/time-entries/${id}`, body: JSON.stringify({ endedAt }), base_version: current.version });
    });
    await this.changed();
    return next;
  }

  async flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    if (!navigator.onLine || !this.pg) return;
    this.flushPromise = this.doFlush().finally(() => { this.flushPromise = null; });
    return this.flushPromise;
  }

  private async doFlush() {
    this.setSnapshot({ phase: 'syncing', error: undefined });
    const result = await this.pg!.query<OutboxRow>(`SELECT * FROM outbox WHERE state='pending' AND next_attempt_at <= $1 ORDER BY created_at LIMIT 100`, [new Date().toISOString()]);
    for (const mutation of result.rows) {
      try {
        const response = await fetch(`${this.apiUrl}${mutation.path}`, {
          method: mutation.method,
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': mutation.id,
            ...(mutation.base_version ? { 'X-Base-Version': String(mutation.base_version) } : {}),
          },
          body: mutation.body ?? undefined,
        });
        const payload = await response.json() as { data?: Record<string, unknown>; error?: { message?: string } };
        if (response.status === 409) {
          let server: Record<string, unknown> = {};
          try { server = JSON.parse(payload.error?.message ?? '{}').current ?? {}; } catch { server = {}; }
          await this.pg!.query(`INSERT INTO conflicts VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`, [
            crypto.randomUUID(), mutation.id, mutation.entity, mutation.entity_id, mutation.body ?? '{}', JSON.stringify(server), new Date().toISOString(),
          ]);
          await this.pg!.query(`UPDATE outbox SET state='conflict',error=$1 WHERE id=$2`, [payload.error?.message ?? 'Conflicto', mutation.id]);
          continue;
        }
        if (!response.ok) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
        if (payload.data) await this.upsertServerRow(mutation.entity, payload.data);
        await this.pg!.query(`UPDATE outbox SET state='sent',error=NULL WHERE id=$1`, [mutation.id]);
      } catch (error) {
        const attempts = mutation.attempts + 1;
        const delay = retryDelayMs(attempts);
        await this.pg!.query(`UPDATE outbox SET attempts=$1,next_attempt_at=$2,error=$3 WHERE id=$4`, [
          attempts, new Date(Date.now() + delay).toISOString(), (error as Error).message, mutation.id,
        ]);
        this.setSnapshot({ phase: 'error', error: (error as Error).message });
        break;
      }
    }
    await this.refreshSnapshot();
    if (!this.snapshot.error) this.setSnapshot({ phase: 'synced', lastSyncedAt: new Date().toISOString() });
  }

  async resolveConflict(id: string, choice: 'local' | 'server'): Promise<void> {
    const conflict = this.snapshot.conflicts.find((item) => item.id === id);
    if (!conflict) return;
    if (choice === 'server') {
      if (Object.keys(conflict.server).length) await this.upsertServerRow(conflict.entity, conflict.server);
      await this.pg!.query(`DELETE FROM outbox WHERE id=$1`, [conflict.mutationId]);
    } else {
      const old = await this.pg!.query<OutboxRow>(`SELECT * FROM outbox WHERE id=$1`, [conflict.mutationId]);
      if (old.rows[0]) {
        const mutation = old.rows[0];
        const nextId = crypto.randomUUID();
        await this.pg!.query(`INSERT INTO outbox (id,entity,entity_id,method,path,body,base_version,created_at,next_attempt_at,state)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,'pending')`, [
          nextId, mutation.entity, mutation.entity_id, mutation.method, mutation.path, mutation.body,
          Number(conflict.server.version ?? mutation.base_version ?? 1), new Date().toISOString(),
        ]);
        await this.pg!.query(`DELETE FROM outbox WHERE id=$1`, [conflict.mutationId]);
      }
    }
    await this.pg!.query(`DELETE FROM conflicts WHERE id=$1`, [id]);
    await this.changed();
  }

  private async changed() {
    await this.refreshSnapshot();
    if (navigator.onLine) void this.flush();
  }

  private async refreshSnapshot() {
    if (!this.pg) return;
    const [taskRows, projectRows, entryRows, outboxCount, conflictRows] = await Promise.all([
      this.pg.query<Record<string, unknown>>(`SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY sort_order DESC, created_at DESC`),
      this.pg.query<Record<string, unknown>>(`SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY sort_order DESC, name`),
      this.pg.query<Record<string, unknown>>(`SELECT * FROM time_entries WHERE deleted_at IS NULL ORDER BY started_at DESC`),
      this.pg.query<{ count: number }>(`SELECT COUNT(*)::integer AS count FROM outbox`),
      this.pg.query<Record<string, unknown>>(`SELECT * FROM conflicts ORDER BY created_at DESC`),
    ]);
    const conflicts: Conflict[] = conflictRows.rows.map((row) => ({
      id: String(row.id), mutationId: String(row.mutation_id), entity: String(row.entity) as EntityName,
      entityId: String(row.entity_id), local: metadata(row.local_value), server: metadata(row.server_value), createdAt: String(row.created_at),
    }));
    this.setSnapshot({
      ready: true,
      tasks: taskRows.rows.map(mapTask),
      projects: projectRows.rows.map(mapProject),
      timeEntries: entryRows.rows.map(mapTimeEntry),
      pending: Number(outboxCount.rows[0]?.count ?? 0),
      conflicts,
    });
  }

  private handleOnline = () => {
    this.setSnapshot({ phase: 'connecting', error: undefined });
    this.shapes.forEach((shape) => { void shape.stream.forceDisconnectAndRefresh(); });
    void this.flush();
  };
  private handleOffline = () => this.setSnapshot({ phase: 'offline' });

  async destroy() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    if (this.interval) window.clearInterval(this.interval);
    this.shapes.forEach((shape) => shape.unsubscribeAll());
    this.shapes = [];
    if (this.pg) await this.pg.close();
    this.pg = null;
    this.userId = '';
    this.snapshot = initialSnapshot;
  }
}

export const electricClient = new OfflineElectricClient();
