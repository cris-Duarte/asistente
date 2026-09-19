import { useEffect, useState, useCallback, useRef } from 'react';
import { useLiveQuery } from '@electric-sql/pglite-react';
import { electricClient, type ElectricClientConfig, type ShapeSubscription } from '../lib/electric';
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
    electricClient.liveTasks.bind(electricClient),
    [userId]
  );

  useEffect(() => {
    if (liveTasks) {
      setTasks(liveTasks.rows as Task[]);
      setIsLoading(false);
    }
  }, [liveTasks]);

  return { tasks, isLoading, error, refetch: () => electricClient.queryTasks() };
}

export function useTimeEntries(taskId?: string) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const liveEntries = useLiveQuery(
    electricClient.liveTimeEntries.bind(electricClient),
    [taskId]
  );

  useEffect(() => {
    if (liveEntries) {
      setEntries(liveEntries.rows as TimeEntry[]);
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
    electricClient.liveProjects.bind(electricClient),
    []
  );

  useEffect(() => {
    if (liveProjects) {
      setProjects(liveProjects.rows as Project[]);
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
  const activeEntry = entries.find(e => !e.ended_at);
  const totalTracked = entries.reduce((sum, e) => sum + (e.duration_seconds || 0), 0);

  return {
    activeEntry,
    totalTracked,
    isRunning: !!activeEntry,
  };
}

export function useSyncStatus() {
  const { isInitialized, isSyncing, isSynced, syncError, client } = useElectricClient();
  const [syncStatus, setSyncStatus] = useState({ isSynced: false, isSyncing: false, error: null as Error | null });

  useEffect(() => {
    if (!isInitialized) return;

    const unsubscribe = client.onSyncStatusChange(setSyncStatus);
    // Initial status
    setSyncStatus(client.getSyncStatus());

    return unsubscribe;
  }, [isInitialized, client]);

  return { isInitialized, ...syncStatus };
}