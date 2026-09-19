import { useEffect, useState, useCallback, useRef } from 'react';
import { useLiveQuery } from '@electric-sql/pglite-react';
import { electricClient, type ElectricClientConfig, type ShapeSubscription } from './electric';
import type { Task, TimeEntry, Project } from '@productivity-assistant/shared';

export function useElectricClient(config?: ElectricClientConfig) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const subscriptionsRef = useRef<Map<string, ShapeSubscription>>(new Map());

  useEffect(() => {
    if (config && !isInitialized) {
      const init = async () => {
        try {
          setIsSyncing(true);
          await electricClient.initialize(config);
          const subs = await electricClient.syncAll();
          subscriptionsRef.current = subs;
          setIsInitialized(true);
        } catch (error) {
          setSyncError(error as Error);
        } finally {
          setIsSyncing(false);
        }
      };
      init();
    }
  }, [config, isInitialized]);

  const destroy = useCallback(async () => {
    await electricClient.destroy();
    subscriptionsRef.current.clear();
    setIsInitialized(false);
  }, []);

  return {
    client: electricClient,
    isInitialized,
    isSyncing,
    syncError,
    subscriptions: subscriptionsRef.current,
    isSynced: electricClient.isSynced(),
    destroy,
  };
}

export function useTasks(userId: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const liveTasks = useLiveQuery(
    `SELECT * FROM tasks WHERE user_id = $1 AND deleted_at IS NULL ORDER BY sort_order DESC, created_at DESC`,
    [userId]
  );

  useEffect(() => {
    if (liveTasks) {
      setTasks(liveTasks as unknown as Task[]);
      setIsLoading(false);
    }
  }, [liveTasks]);

  return { tasks, isLoading, error, refetch: () => electricClient.queryTasks() };
}

export function useTimeEntries(taskId?: string) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const query = taskId
    ? `SELECT * FROM time_entries WHERE user_id = $1 AND task_id = $2 ORDER BY started_at DESC`
    : `SELECT * FROM time_entries WHERE user_id = $1 ORDER BY started_at DESC`;
  const params = taskId ? [undefined, taskId] : [undefined];

  const liveEntries = useLiveQuery(query, params);

  useEffect(() => {
    if (liveEntries) {
      setEntries(liveEntries as unknown as TimeEntry[]);
      setIsLoading(false);
    }
  }, [liveEntries]);

  return { entries, isLoading, error, refetch: () => electricClient.queryTimeEntries(taskId) };
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const liveProjects = useLiveQuery(
    `SELECT * FROM projects WHERE user_id = $1 AND archived_at IS NULL ORDER BY sort_order DESC, created_at DESC`,
    [undefined]
  );

  useEffect(() => {
    if (liveProjects) {
      setProjects(liveProjects as unknown as Project[]);
      setIsLoading(false);
    }
  }, [liveProjects]);

  return { projects, isLoading, error, refetch: () => electricClient.queryProjects() };
}

export function useActiveTask(userId: string) {
  const { tasks } = useTasks(userId);
  const activeTask = tasks.find(t => t.status === 'active');
  return activeTask;
}

export function useTimer(taskId?: string) {
  const { entries } = useTimeEntries(taskId);
  const activeEntry = entries.find(e => !e.endedAt);
  const totalTracked = entries.reduce((sum: number, e: TimeEntry) => sum + (e.durationSeconds || 0), 0);

  return {
    activeEntry,
    totalTracked,
    isRunning: !!activeEntry,
  };
}