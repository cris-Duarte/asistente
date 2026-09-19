import { useCallback, useState } from 'react';
import { electricClient } from '../lib/electric';
import { useAuthStore } from '../stores/authStore';
import { toastHelpers } from '../components/ui/Toaster';
import type { Task, TimeEntry, Project } from '@productivity-assistant/shared';
import { uuid } from '../lib/utils';

interface OptimisticUpdate<T> {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: 'task' | 'timeEntry' | 'project';
  previousData: T | null;
  newData: T | null;
  timestamp: number;
}

interface UseMutationsReturn {
  createTask: (task: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'version'>) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  createTimeEntry: (entry: Omit<TimeEntry, 'id' | 'synced_at' | 'duration_seconds'>) => Promise<TimeEntry>;
  updateTimeEntry: (id: string, updates: Partial<TimeEntry>) => Promise<TimeEntry>;
  createProject: (project: Omit<Project, 'id' | 'created_at' | 'updated_at'>) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  isMutating: boolean;
  error: Error | null;
}

export function useMutations(): UseMutationsReturn {
  const { user, token } = useAuthStore();
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pendingMutations, setPendingMutations] = useState<Array<{
    id: string;
    type: 'create' | 'update' | 'delete';
    entity: 'task' | 'timeEntry' | 'project';
    timestamp: number;
  }>([]);

  const addPendingMutation = useCallback((mutation: { type: 'create' | 'update' | 'delete'; entity: 'task' | 'timeEntry' | 'project' }) => {
    const id = Math.random().toString(36).substring(2, 9);
    setPendingMutations(prev => [...prev, { id, ...mutation, timestamp: Date.now() }]);
    return id;
  }, []);

  const removePendingMutation = useCallback((id: string) => {
    setPendingMutations(prev => prev.filter(m => m.id !== id));
  }, []);

  const createTask = useCallback(async (task: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'version'>): Promise<Task> => {
    if (!electricClient.isInitialized()) {
      throw new Error('ElectricClient not initialized');
    }
    
    setIsMutating(true);
    setError(null);
    const mutationId = addPendingMutation({ type: 'create', entity: 'task' });

    try {
      const newTask = {
        ...task,
        user_id: electricClient.config?.userId || '',
        total_tracked_seconds: 0,
        sort_order: Date.now(),
      };
      
      await electricClient.createTask(newTask);
      toastHelpers.success('Creada', 'Tarea creada correctamente');
      
      // The live query will automatically update
      return { 
        ...newTask, 
        id: 'temp-' + Date.now(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      } as Task;
    } catch (err) {
      setError(err as Error);
      toastHelpers.error('Error', (err as Error).message);
      throw err;
    } finally {
      setIsMutating(false);
      removePendingMutation(mutationId);
    }
  }, []);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>): Promise<Task> => {
    if (!electricClient.isInitialized()) {
      throw new Error('ElectricClient not initialized');
    }
    
    setIsMutating(true);
    setError(null);
    const mutationId = addPendingMutation({ type: 'update', entity: 'task' });

    try {
      await electricClient.updateTask(id, updates);
      toastHelpers.success('Actualizada', 'Tarea actualizada correctamente');
      
      return { id, ...updates } as Task;
    } catch (err) {
      setError(err as Error);
      toastHelpers.error('Error', (err as Error).message);
      throw err;
    } finally {
      setIsMutating(false);
      removePendingMutation(mutationId);
    }
  }, []);

  const deleteTask = useCallback(async (id: string): Promise<void> => {
    if (!electricClient.isInitialized()) {
      throw new Error('ElectricClient not initialized');
    }
    
    setIsMutating(true);
    setError(null);
    const mutationId = addPendingMutation({ type: 'delete', entity: 'task' });

    try {
      await electricClient.deleteTask(id);
      toastHelpers.success('Eliminada', 'Tarea eliminada correctamente');
    } catch (err) {
      setError(err as Error);
      toastHelpers.error('Error', (err as Error).message);
      throw err;
    } finally {
      setIsMutating(false);
      removePendingMutation(mutationId);
    }
  }, []);

  const createTimeEntry = useCallback(async (entry: Omit<TimeEntry, 'id' | 'synced_at' | 'duration_seconds'>): Promise<TimeEntry> => {
    if (!electricClient.isInitialized()) {
      throw new Error('ElectricClient not initialized');
    }
    
    setIsMutating(true);
    setError(null);
    const mutationId = addPendingMutation({ type: 'create', entity: 'timeEntry' });

    try {
      await electricClient.createTimeEntry(entry);
      toastHelpers.success('Registrada', 'Tiempo registrado correctamente');
      
      return {
        ...entry,
        id: 'temp-' + Date.now(),
        synced_at: new Date().toISOString(),
        duration_seconds: entry.ended_at ? Math.floor((new Date(entry.ended_at).getTime() - new Date(entry.started_at).getTime()) / 1000) : 0,
      } as TimeEntry;
    } catch (err) {
      setError(err as Error);
      toastHelpers.error('Error', (err as Error).message);
      throw err;
    } finally {
      setIsMutating(false);
      removePendingMutation(mutationId);
    }
  }, []);

  const updateTimeEntry = useCallback(async (id: string, updates: Partial<TimeEntry>): Promise<TimeEntry> => {
    if (!electricClient.isInitialized()) {
      throw new Error('ElectricClient not initialized');
    }
    
    setIsMutating(true);
    setError(null);
    const mutationId = addPendingMutation({ type: 'update', entity: 'timeEntry' });

    try {
      await electricClient.updateTimeEntry(id, updates);
      toastHelpers.success('Actualizada', 'Registro actualizado correctamente');
      
      return { id, ...updates } as TimeEntry;
    } catch (err) {
      setError(err as Error);
      toastHelpers.error('Error', (err as Error).message);
      throw err;
    } finally {
      setIsMutating(false);
      removePendingMutation(mutationId);
    }
  }, []);

  const createProject = useCallback(async (project: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project> => {
    if (!electricClient.isInitialized()) {
      throw new Error('ElectricClient not initialized');
    }
    
    setIsMutating(true);
    setError(null);
    const mutationId = addPendingMutation({ type: 'create', entity: 'project' });

    try {
      await electricClient.createProject(project);
      toastHelpers.success('Creado', 'Proyecto creado correctamente');
      
      return { 
        ...project, 
        id: 'temp-' + Date.now(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Project;
    } catch (err) {
      setError(err as Error);
      toastHelpers.error('Error', (err as Error).message);
      throw err;
    } finally {
      setIsMutating(false);
      removePendingMutation(mutationId);
    }
  }, []);

  const updateProject = useCallback(async (id: string, updates: Partial<Project>): Promise<Project> => {
    if (!electricClient.isInitialized()) {
      throw new Error('ElectricClient not initialized');
    }
    
    setIsMutating(true);
    setError(null);
    const mutationId = addPendingMutation({ type: 'update', entity: 'project' });

    try {
      await electricClient.updateProject(id, updates);
      toastHelpers.success('Actualizado', 'Proyecto actualizado correctamente');
      
      return { id, ...updates } as Project;
    } catch (err) {
      setError(err as Error);
      toastHelpers.error('Error', (err as Error).message);
      throw err;
    } finally {
      setIsMutating(false);
      removePendingMutation(mutationId);
    }
  }, []);

  const deleteProject = useCallback(async (id: string): Promise<void> => {
    if (!electricClient.isInitialized()) {
      throw new Error('ElectricClient not initialized');
    }
    
    setIsMutating(true);
    setError(null);
    const mutationId = addPendingMutation({ type: 'delete', entity: 'project' });

    try {
      await electricClient.deleteProject(id);
      toastHelpers.success('Eliminado', 'Proyecto eliminado correctamente');
    } catch (err) {
      setError(err as Error);
      toastHelpers.error('Error', (err as Error).message);
      throw err;
    } finally {
      setIsMutating(false);
      removePendingMutation(mutationId);
    }
  }, []);

  return {
    createTask,
    updateTask,
    deleteTask,
    createTimeEntry,
    updateTimeEntry,
    createProject,
    updateProject,
    deleteProject,
    isMutating,
    error,
  };
}