import { PGlite } from '@electric-sql/pglite';
import { electricSync } from '@electric-sql/pglite-sync';
import { live } from '@electric-sql/pglite/live';
import type { Task, TimeEntry, Project, SyncState, UUID, ISODateString } from '@productivity-assistant/shared';

export interface ElectricClientConfig {
  electricUrl: string;
  userId: string;
  authToken: string;
  persistenceKey?: string;
}

export interface ShapeSubscription {
  unsubscribe: () => void;
  stream: any;
  isSynced: boolean;
  error: Error | null;
}

// Type augmentation for PGlite with extensions
interface ExtendedPGlite extends PGlite {
  electric: {
    syncShapeToTable: (options: any) => Promise<any>;
  };
  live: {
    query: (sql: string, params: any[]) => any;
  };
}

interface ExtendedPGlite extends PGlite {
  electric: {
    syncShapeToTable: (options: any) => Promise<any>;
  };
  live: {
    query: (sql: string, params: any[]) => any;
  };
}

// Helper functions to cast rows to proper branded types
function castTaskRows(rows: any[]): Task[] {
  return rows.map(row => ({
    ...row,
    id: row.id as UUID,
    userId: row.user_id as UUID,
    projectId: row.project_id as UUID | undefined,
    parentTaskId: row.parent_task_id as UUID | undefined,
    createdAt: row.created_at as ISODateString,
    updatedAt: row.updated_at as ISODateString,
    deletedAt: row.deleted_at as ISODateString | undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
  }));
}

function castTimeEntryRows(rows: any[]): TimeEntry[] {
  return rows.map(row => ({
    ...row,
    id: row.id as UUID,
    taskId: row.task_id as UUID,
    userId: row.user_id as UUID,
    startedAt: row.started_at as ISODateString,
    endedAt: row.ended_at as ISODateString | undefined,
    syncedAt: row.synced_at as ISODateString,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
  }));
}

function castProjectRows(rows: any[]): Project[] {
  return rows.map(row => ({
    ...row,
    id: row.id as UUID,
    userId: row.user_id as UUID,
    createdAt: row.created_at as ISODateString,
    updatedAt: row.updated_at as ISODateString,
    archivedAt: row.archived_at as ISODateString | undefined,
  }));
}

export class ElectricClient {
  private pg: ExtendedPGlite | null = null;
  private config: ElectricClientConfig | null = null;
  private subscriptions: Map<string, ShapeSubscription> = new Map();
  private isInitialized = false;

  async initialize(config: ElectricClientConfig): Promise<void> {
    if (this.isInitialized) {
      console.warn('ElectricClient already initialized');
      return;
    }

    this.config = config;
    const persistenceKey = config.persistenceKey || `electric-${config.userId}`;

    const pg = await PGlite.create({
      dataDir: `idb://${persistenceKey}`,
      extensions: {
        electric: electricSync(),
        live,
      },
    }) as ExtendedPGlite;

    this.pg = pg;

    // Create tables matching backend schema
    await this.createTables();

    this.isInitialized = true;
    console.log('ElectricClient initialized');
  }

  private async createTables(): Promise<void> {
    if (!this.pg) throw new Error('PGlite not initialized');

    await this.pg.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        project_id TEXT,
        parent_task_id TEXT,
        sort_order INTEGER DEFAULT 0,
        estimated_minutes INTEGER,
        total_tracked_seconds INTEGER DEFAULT 0,
        is_parallel INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        version INTEGER DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON tasks(user_id);
      CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);
      CREATE INDEX IF NOT EXISTS tasks_deleted_at_idx ON tasks(deleted_at);

      CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_seconds INTEGER,
        source TEXT DEFAULT 'manual',
        device_id TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        synced_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS time_entries_task_id_idx ON time_entries(task_id);
      CREATE INDEX IF NOT EXISTS time_entries_user_id_idx ON time_entries(user_id);
      CREATE INDEX IF NOT EXISTS time_entries_started_at_idx ON time_entries(started_at);

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        icon TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );

      CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id);

      CREATE TABLE IF NOT EXISTS sync_state (
        client_id TEXT PRIMARY KEY,
        last_mutation_id INTEGER DEFAULT 0,
        last_pulled_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  async syncTasks(): Promise<ShapeSubscription> {
    return this.subscribeToShape('tasks', 'tasks', ['id'], { 
      table: 'tasks', 
      where: 'user_id = $1', 
      params: [this.config!.userId] 
    });
  }

  async syncTimeEntries(): Promise<ShapeSubscription> {
    return this.subscribeToShape('time_entries', 'time_entries', ['id'], {
      table: 'time_entries',
      where: 'user_id = $1',
      params: [this.config!.userId]
    });
  }

  async syncProjects(): Promise<ShapeSubscription> {
    return this.subscribeToShape('projects', 'projects', ['id'], {
      table: 'projects',
      where: 'user_id = $1',
      params: [this.config!.userId]
    });
  }

  async syncAll(): Promise<Map<string, ShapeSubscription>> {
    const [tasks, timeEntries, projects] = await Promise.all([
      this.syncTasks(),
      this.syncTimeEntries(),
      this.syncProjects(),
    ]);

    this.subscriptions.set('tasks', tasks);
    this.subscriptions.set('time_entries', timeEntries);
    this.subscriptions.set('projects', projects);

    return this.subscriptions;
  }

  private async subscribeToShape(
    shapeKey: string,
    table: string,
    primaryKey: string[],
    shapeParams: { table: string; where: string; params: string[] }
  ): Promise<ShapeSubscription> {
    if (!this.pg || !this.config) throw new Error('ElectricClient not initialized');

    const subscription = await this.pg.electric.syncShapeToTable({
      shape: {
        url: `${this.config.electricUrl}/v1/shape`,
        params: shapeParams,
      },
      table,
      primaryKey,
      shapeKey,
      onError: (error: Error) => {
        console.error(`Sync error for ${shapeKey}:`, error);
        const sub = this.subscriptions.get(shapeKey);
        if (sub) {
          sub.error = error;
        }
      },
    });

    const shapeSub: ShapeSubscription = {
      unsubscribe: () => subscription.unsubscribe(),
      stream: subscription.stream,
      isSynced: false,
      error: null,
    };

    subscription.stream.on('headers', () => {
      shapeSub.isSynced = true;
    });

    return shapeSub;
  }

  async queryTasks(): Promise<Task[]> {
    if (!this.pg) throw new Error('PGlite not initialized');
    const result = await this.pg.query('SELECT * FROM tasks WHERE user_id = $1 AND deleted_at IS NULL ORDER BY sort_order DESC, created_at DESC', [this.config!.userId]);
    return castTaskRows(result.rows);
  }

  async queryTimeEntries(taskId?: string): Promise<TimeEntry[]> {
    if (!this.pg) throw new Error('PGlite not initialized');
    let query = 'SELECT * FROM time_entries WHERE user_id = $1';
    const params: any[] = [this.config!.userId];
    if (taskId) {
      query += ' AND task_id = $2';
      params.push(taskId);
    }
    query += ' ORDER BY started_at DESC';
    const result = await this.pg.query(query, params);
    return castTimeEntryRows(result.rows);
  }

  async queryProjects(): Promise<Project[]> {
    if (!this.pg) throw new Error('PGlite not initialized');
    const result = await this.pg.query('SELECT * FROM projects WHERE user_id = $1 AND archived_at IS NULL ORDER BY sort_order DESC, created_at DESC', [this.config!.userId]);
    return castProjectRows(result.rows);
  }

  // Live queries for reactive UI
  liveTasks() {
    if (!this.pg) throw new Error('PGlite not initialized');
    return this.pg.live.query('SELECT * FROM tasks WHERE user_id = $1 AND deleted_at IS NULL ORDER BY sort_order DESC, created_at DESC', [this.config!.userId]);
  }

  liveTimeEntries(taskId?: string) {
    if (!this.pg) throw new Error('PGlite not initialized');
    let query = 'SELECT * FROM time_entries WHERE user_id = $1';
    const params: any[] = [this.config!.userId];
    if (taskId) {
      query += ' AND task_id = $2';
      params.push(taskId);
    }
    query += ' ORDER BY started_at DESC';
    return this.pg.live.query(query, params);
  }

  liveProjects() {
    if (!this.pg) throw new Error('PGlite not initialized');
    return this.pg.live.query('SELECT * FROM projects WHERE user_id = $1 AND archived_at IS NULL ORDER BY sort_order DESC, created_at DESC', [this.config!.userId]);
  }

  // Write operations (go through API, not direct ElectricSQL)
  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'created_at' | 'updated_at'>): Promise<void> {
    const response = await fetch(`${this.config!.electricUrl.replace('/v1/shape', '')}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config!.authToken}`,
        'X-Device-ID': 'web',
      },
      body: JSON.stringify(task),
    });
    if (!response.ok) throw new Error('Failed to create task');
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<void> {
    const response = await fetch(`${this.config!.electricUrl.replace('/v1/shape', '')}/api/tasks/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config!.authToken}`,
        'X-Device-ID': 'web',
      },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error('Failed to update task');
  }

  async deleteTask(id: string): Promise<void> {
    const response = await fetch(`${this.config!.electricUrl.replace('/v1/shape', '')}/api/tasks/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.config!.authToken}`,
        'X-Device-ID': 'web',
      },
    });
    if (!response.ok) throw new Error('Failed to delete task');
  }

  async createTimeEntry(entry: Omit<TimeEntry, 'id' | 'synced_at' | 'duration_seconds' | 'version' | 'createdAt' | 'updatedAt' | 'created_at' | 'updated_at'>): Promise<void> {
    const response = await fetch(`${this.config!.electricUrl.replace('/v1/shape', '')}/api/time-entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config!.authToken}`,
        'X-Device-ID': 'web',
      },
      body: JSON.stringify(entry),
    });
    if (!response.ok) throw new Error('Failed to create time entry');
  }

  async updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<void> {
    const response = await fetch(`${this.config!.electricUrl.replace('/v1/shape', '')}/api/time-entries/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config!.authToken}`,
        'X-Device-ID': 'web',
      },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error('Failed to update time entry');
  }

  async createProject(project: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    const response = await fetch(`${this.config!.electricUrl.replace('/v1/shape', '')}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config!.authToken}`,
        'X-Device-ID': 'web',
      },
      body: JSON.stringify(project),
    });
    if (!response.ok) throw new Error('Failed to create project');
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    const response = await fetch(`${this.config!.electricUrl.replace('/v1/shape', '')}/api/projects/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config!.authToken}`,
        'X-Device-ID': 'web',
      },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error('Failed to update project');
  }

  async deleteProject(id: string): Promise<void> {
    const response = await fetch(`${this.config!.electricUrl.replace('/v1/shape', '')}/api/projects/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.config!.authToken}`,
        'X-Device-ID': 'web',
      },
    });
    if (!response.ok) throw new Error('Failed to delete project');
  }

  getSubscription(shapeKey: string): ShapeSubscription | undefined {
    return this.subscriptions.get(shapeKey);
  }

  isSynced(): boolean {
    for (const sub of this.subscriptions.values()) {
      if (!sub.isSynced) return false;
    }
    return this.subscriptions.size > 0;
  }

  async destroy(): Promise<void> {
    for (const sub of this.subscriptions.values()) {
      sub.unsubscribe();
    }
    this.subscriptions.clear();
    if (this.pg) {
      await this.pg.close();
      this.pg = null;
    }
    this.isInitialized = false;
  }
}

// Singleton instance
export const electricClient = new ElectricClient();