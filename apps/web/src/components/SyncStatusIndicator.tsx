import { useElectric } from '../context/ElectricContext';
import { Wifi, WifiOff, Sync, AlertCircle, CheckCircle, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';

export function SyncStatusIndicator({ showLabel = false, showDetails = false }: { showLabel?: boolean; showDetails?: boolean }) {
  const { isInitialized, isSyncing, isSynced, syncError, client } = useElectric();

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
      {isSynced ? <CheckCircle className="h-4 w-4" /> : <Sync className="h-4 w-4" />}
      {showLabel && <span className="text-xs">{isSynced ? 'Sincronizado' : 'Pendiente'}</span>}
    </div>
  );
}

export function SyncStatusDetail() {
  const { isInitialized, isSyncing, isSynced, syncError, client } = useElectric();

  if (!isInitialized) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
        <div className="h-12 w-12 mx-auto mb-2 opacity-50">
          <svg className="h-full w-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 1l22 22" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 12 20c7 0 10-7 10-7" />
            <path d="M5 12.54a10.94 10.94 0 0 1 5.28-5.28" />
          </svg>
        </div>
        <p>Sincronización no iniciada</p>
        <p className="text-sm mt-1">Inicia sesión para activar la sincronización</p>
      </div>
    );
  }

  const subscriptions = ['tasks', 'time_entries', 'projects'].map(key => {
    const sub = client.getSubscription(key);
    return {
      key,
      label: key === 'time_entries' ? 'Registros de tiempo' : key === 'tasks' ? 'Tareas' : 'Proyectos',
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
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  Error
                </span>
              ) : sub.isSynced ? (
                <span className="text-green-500 flex items-center gap-1">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  OK
                </span>
              ) : (
                <span className="text-yellow-500 flex items-center gap-1">
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
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

export function SyncStatusCompact() {
  const { isInitialized, isSyncing, isSynced, syncError } = useElectric();

  if (!isInitialized) {
    return (
      <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500" title="Sincronización no iniciada">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 1l22 22" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 12 20c7 0 10-7 10-7" />
          <path d="M5 12.54a10.94 10.94 0 0 1 5.28-5.28" />
        </svg>
      </div>
    );
  }

  if (syncError) {
    return (
      <div className="flex items-center gap-1.5 text-red-500" title={`Error: ${syncError.message}`}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="flex items-center gap-1.5 text-yellow-500" title="Sincronizando...">
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-green-500" title="Sincronizado">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    </div>
  );
}