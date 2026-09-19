import { useElectric } from '@/context/ElectricContext';
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SyncStatusIndicator({ showLabel = false }: { showLabel?: boolean }) {
  const { isInitialized, isSyncing, isSynced, syncError } = useElectric();

  if (!isInitialized) {
    return (
      <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500" title="Sincronización no iniciada">
        <WifiOff className="h-4 w-4" />
        {showLabel && <span className="text-xs">Offline</span>}
      </div>
    );
  }

  if (syncError) {
    return (
      <div className="flex items-center gap-1.5 text-red-500" title={`Error: ${syncError.message}`}>
        <AlertCircle className="h-4 w-4" />
        {showLabel && <span className="text-xs">Error</span>}
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="flex items-center gap-1.5 text-yellow-500" title="Sincronizando...">
        <Loader2 className="h-4 w-4 animate-spin" />
        {showLabel && <span className="text-xs">Sincronizando...</span>}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1.5', isSynced ? 'text-green-500' : 'text-yellow-500')} title={isSynced ? 'Sincronizado' : 'Pendiente'}>
      {isSynced ? <CheckCircle className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
      {showLabel && <span className="text-xs">{isSynced ? 'Sincronizado' : 'Pendiente'}</span>}
    </div>
  );
}

export function SyncStatusDetail() {
  const { isInitialized, isSyncing, isSynced, syncError, client } = useElectric();

  if (!isInitialized) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
        <WifiOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>Sincronización no iniciada</p>
        <p className="text-sm mt-1">Inicia sesión para activar la sincronización</p>
      </div>
    );
  }

  const subscriptions = ['tasks', 'time_entries', 'projects'].map(key => {
    const sub = client.getSubscription(key);
    return {
      key,
      label: key === 'time_entries' ? 'Registros de tiempo' : key,
      isSynced: sub?.isSynced ?? false,
      error: sub?.error ?? null,
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">Estado de sincronización</h3>
        <SyncStatusIndicator showLabel />
      </div>

      <div className="space-y-2">
        {subscriptions.map(sub => (
          <div key={sub.key} className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">{sub.label}</span>
            <div className="flex items-center gap-2">
              {sub.error ? (
                <span className="text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Error
                </span>
              ) : sub.isSynced ? (
                <span className="text-green-500 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  OK
                </span>
              ) : (
                <span className="text-yellow-500 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Pendiente
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {syncError && (
        <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/30 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-400">
            <strong>Error:</strong> {syncError.message}
          </p>
        </div>
      )}
    </div>
  );
}