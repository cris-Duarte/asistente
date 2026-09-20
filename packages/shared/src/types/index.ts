export type UUID = string;
export type ISODateString = string;

export function uuid(v: string): UUID {
  return v as UUID;
}

export function isoDate(v: string): ISODateString {
  return v as ISODateString;
}

export interface BaseEntity {
  id: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString;
  version: number;
  lastWriteId?: string;
}

export type TaskStatus = 'pending' | 'active' | 'paused' | 'done' | 'archived';
export type TimeEntrySource = 'manual' | 'pomodoro' | 'auto' | 'imported';

export interface Task extends BaseEntity {
  userId: UUID;
  title: string;
  description?: string;
  status: TaskStatus;
  projectId?: UUID;
  parentTaskId?: UUID;
  sortOrder: number;
  estimatedMinutes?: number;
  totalTrackedSeconds: number;
  isParallel: boolean;
  metadata: TaskMetadata;
}

export interface TaskMetadata {
  tags: string[];
  energyLevel: 'low' | 'medium' | 'high';
  context: 'deep_work' | 'admin' | 'creative' | 'communication';
  [key: string]: unknown;
}

export interface Subtask {
  id: UUID;
  title: string;
  completed: boolean;
  sortOrder: number;
}

export interface TimeEntry {
  id: UUID;
  taskId: UUID;
  userId: UUID;
  startedAt: ISODateString;
  endedAt?: ISODateString;
  durationSeconds?: number;
  source: TimeEntrySource;
  deviceId: string;
  metadata: Record<string, unknown>;
  syncedAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString;
  version: number;
  lastWriteId?: string;
}

export interface Project extends BaseEntity {
  userId: UUID;
  name: string;
  color?: string;
  icon?: string;
  sortOrder: number;
  archivedAt?: ISODateString;
}

export interface User extends BaseEntity {
  email: string;
  name: string;
  timezone: string;
  preferences: Record<string, unknown>;
}

export interface SyncState {
  clientId: string;
  lastMutationId: number;
  lastPulledAt: ISODateString;
}

export interface DomainEvent {
  type: 'task.created' | 'task.updated' | 'task.deleted' | 'task.completed' | 'time.logged' | 'focus.session.started' | 'focus.session.ended';
  payload: unknown;
  timestamp: ISODateString;
  correlationId: UUID;
  userId: UUID;
  deviceId: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
