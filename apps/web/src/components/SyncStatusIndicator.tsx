import { AlertTriangle, CheckCircle2, CloudOff, Loader2 } from 'lucide-react';
import { useElectric } from '@/context/ElectricContext';

export function SyncStatusIndicator({ showLabel = true }: { showLabel?: boolean; showDetails?: boolean }) {
  const { isInitialized, isSyncing, isSynced, syncError, pending, conflicts } = useElectric();
  const icon = !navigator.onLine ? <CloudOff className="h-4 w-4" />
    : syncError || conflicts.length ? <AlertTriangle className="h-4 w-4" />
      : isSyncing || !isInitialized ? <Loader2 className="h-4 w-4 animate-spin" />
        : <CheckCircle2 className="h-4 w-4" />;
  const label = !navigator.onLine ? 'Sin conexión'
    : conflicts.length ? `${conflicts.length} conflicto${conflicts.length === 1 ? '' : 's'}`
      : syncError ? 'Error de sincronización'
        : pending ? `${pending} pendiente${pending === 1 ? '' : 's'}`
          : isSynced ? 'Sincronizado' : 'Conectando';
  return <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300" title={syncError?.message ?? label}>{icon}{showLabel && label}</span>;
}

export function SyncStatusDetail() {
  const { pending, conflicts, syncError, isSyncing } = useElectric();
  return <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
    <SyncStatusIndicator />
    <p>{pending ? `${pending} cambios locales esperan confirmación.` : 'No hay cambios locales pendientes.'}</p>
    {conflicts.length > 0 && <p className="text-amber-600">Hay {conflicts.length} conflictos por resolver.</p>}
    {syncError && <p className="text-red-600">{syncError.message}</p>}
    {isSyncing && <p>Enviando cambios y recibiendo actualizaciones…</p>}
  </div>;
}

export function SyncStatusCompact() { return <SyncStatusIndicator showLabel={false} />; }
