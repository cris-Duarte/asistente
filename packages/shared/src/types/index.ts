export type UUID = string & { readonly __brand: unique symbol };
export type ISODateString = string & { readonly __brand: unique symbol };

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
  aiSuggestedBreakdown?: Subtask[];
  aiEstimatedDuration?: number;
  aiPriorityScore?: number;
  agentContext?: {
    relevantFiles: string[];
    relatedConversations: string[];
    nextActions: string[];
  };
  embeddingsVector?: number[];
  [key: string]: unknown;
}

export interface Subtask {
  id: UUID;
  title: string;
  completed: boolean;
  sortOrder: number;
}

export interface TimeEntry extends BaseEntity {
  taskId: UUID;
  userId: UUID;
  startedAt: ISODateString;
  endedAt?: ISODateString;
  durationSeconds?: number;
  source: TimeEntrySource;
  deviceId: string;
  metadata: Record<string, unknown>;
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
  passkeyCredentialId?: string;
  publicKey: string;
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