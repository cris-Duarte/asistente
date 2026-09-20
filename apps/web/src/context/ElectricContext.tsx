import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { electricClient, useOfflineData, type Conflict } from '@productivity-assistant/electric-client';
import { useAuthStore } from '@/stores/authStore';
import { API_URL } from '@/lib/api';

interface ElectricContextValue {
  isInitialized: boolean;
  isSyncing: boolean;
  isSynced: boolean;
  syncError: Error | null;
  pending: number;
  conflicts: Conflict[];
  client: typeof electricClient;
}

const ElectricContext = createContext<ElectricContextValue | null>(null);

export function ElectricProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const snapshot = useOfflineData();

  useEffect(() => {
    if (isAuthenticated && user) void electricClient.initialize(user.id, API_URL);
    if (!isAuthenticated) void electricClient.destroy();
  }, [isAuthenticated, user?.id]);

  return <ElectricContext.Provider value={{
    isInitialized: snapshot.ready,
    isSyncing: snapshot.phase === 'syncing' || snapshot.phase === 'connecting',
    isSynced: snapshot.phase === 'synced',
    syncError: snapshot.error ? new Error(snapshot.error) : null,
    pending: snapshot.pending,
    conflicts: snapshot.conflicts,
    client: electricClient,
  }}>{children}</ElectricContext.Provider>;
}

export function useElectric() {
  const context = useContext(ElectricContext);
  if (!context) throw new Error('useElectric debe usarse dentro de ElectricProvider');
  return context;
}
