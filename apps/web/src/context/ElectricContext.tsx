import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { electricClient, type ElectricClientConfig } from '../lib/electric';
import { useAuthStore } from '../stores/authStore';
import { toastHelpers } from '../components/ui/Toaster';

interface ElectricProviderProps {
  children: ReactNode;
}

interface ElectricContextValue {
  isInitialized: boolean;
  isSyncing: boolean;
  isSynced: boolean;
  syncError: Error | null;
  client: typeof electricClient;
  initialize: (config: ElectricClientConfig) => Promise<void>;
  destroy: () => Promise<void>;
}

const ElectricContext = createContext<ElectricContextValue | null>(null);

export function ElectricProvider({ children }: ElectricProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const { user, token, isAuthenticated } = useAuthStore();

  const initialize = async (config: ElectricClientConfig) => {
    if (isInitialized) return;
    try {
      setIsSyncing(true);
      setSyncError(null);
      await electricClient.initialize(config);
      setIsInitialized(true);
      toastHelpers.success('Sincronización iniciada', 'Conectado a ElectricSQL');
    } catch (error) {
      setSyncError(error as Error);
      toastHelpers.error('Error de sincronización', (error as Error).message);
    } finally {
      setIsSyncing(false);
    }
  };

  const destroy = async () => {
    await electricClient.destroy();
    setIsInitialized(false);
  };

  // Auto-initialize when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user && token && !isInitialized) {
      initialize({
        electricUrl: import.meta.env.VITE_ELECTRIC_URL || 'http://localhost:3000',
        userId: user.id,
        authToken: token,
        persistenceKey: `electric-${user.id}`,
      });
    } else if (!isAuthenticated && isInitialized) {
      destroy();
    }
  }, [isAuthenticated, user, token, isInitialized]);

  const isSynced = electricClient.isSynced();

  return (
    <ElectricContext.Provider
      value={{
        isInitialized,
        isSyncing,
        isSynced,
        syncError,
        client: electricClient,
        initialize,
        destroy,
      }}
    >
      {children}
    </ElectricContext.Provider>
  );
}

export function useElectric() {
  const context = useContext(ElectricContext);
  if (!context) {
    throw new Error('useElectric must be used within an ElectricProvider');
  }
  return context;
}