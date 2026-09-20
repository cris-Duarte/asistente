import { useSyncExternalStore } from 'react';
import { electricClient } from './electric';

export function useOfflineData() {
  return useSyncExternalStore(electricClient.subscribe, electricClient.getSnapshot, electricClient.getSnapshot);
}

export function useTasks(_userId?: string) {
  const snapshot = useOfflineData();
  return { tasks: snapshot.tasks, loading: !snapshot.ready, isLoading: !snapshot.ready, error: snapshot.error ? new Error(snapshot.error) : null };
}

export function useProjects() {
  const snapshot = useOfflineData();
  return { projects: snapshot.projects, loading: !snapshot.ready, isLoading: !snapshot.ready, error: snapshot.error ? new Error(snapshot.error) : null };
}

export function useTimeEntries(_taskId?: string) {
  const snapshot = useOfflineData();
  return { timeEntries: snapshot.timeEntries, entries: snapshot.timeEntries, loading: !snapshot.ready, isLoading: !snapshot.ready, error: snapshot.error ? new Error(snapshot.error) : null };
}

export function useTimer(taskId?: string) {
  const snapshot = useOfflineData();
  const activeEntry = snapshot.timeEntries.find((entry) => !entry.endedAt && (!taskId || entry.taskId === taskId)) ?? null;
  return { activeEntry, isEntryRunning: Boolean(activeEntry), entries: snapshot.timeEntries.filter((entry) => !taskId || entry.taskId === taskId) };
}
