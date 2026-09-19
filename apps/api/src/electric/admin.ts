import type { ShapeSubscription } from '@productivity-assistant/electric-client';

interface ElectricAdminConfig {
  electricUrl: string;
  electricSecret: string;
}

export class ElectricAdminClient {
  private config: ElectricAdminConfig;

  constructor(config: ElectricAdminConfig) {
    this.config = config;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.electricUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.electricSecret}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElectricSQL API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // Get all active shape subscriptions
  async getShapeSubscriptions(): Promise<any[]> {
    return this.request('/v1/admin/shapes');
  }

  // Get replication status
  async getReplicationStatus(): Promise<any> {
    return this.request('/v1/admin/replication/status');
  }

  // Trigger manual sync for a shape
  async triggerSync(shapeId: string): Promise<void> {
    await this.request(`/v1/admin/shapes/${shapeId}/sync`, { method: 'POST' });
  }

  // Get shape log/offset info
  async getShapeLog(shapeId: string): Promise<any> {
    return this.request(`/v1/admin/shapes/${shapeId}/log`);
  }

  // Health check
  async healthCheck(): Promise<{ status: string }> {
    return this.request('/health');
  }
}

// Shape definitions for our data model
export const SHAPE_DEFINITIONS = {
  tasks: {
    table: 'tasks',
    where: 'user_id = $1',
    params: ['$userId'],
    primaryKey: ['id'],
  },
  time_entries: {
    table: 'time_entries',
    where: 'user_id = $1',
    params: ['$userId'],
    primaryKey: ['id'],
  },
  projects: {
    table: 'projects',
    where: 'user_id = $1',
    params: ['$userId'],
    primaryKey: ['id'],
  },
} as const;

export function createElectricAdminClient(config: ElectricAdminConfig): ElectricAdminClient {
  return new ElectricAdminClient(config);
}