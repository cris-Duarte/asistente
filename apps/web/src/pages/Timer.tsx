import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, Pause, Play } from 'lucide-react';
import { electricClient, useTasks, useTimeEntries, useTimer } from '@productivity-assistant/electric-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { toastHelpers } from '@/components/ui/Toaster';
import { formatDateTime, formatDuration } from '@/lib/utils';

export function Timer() {
  const { tasks } = useTasks();
  const { timeEntries } = useTimeEntries();
  const { activeEntry } = useTimer();
  const [selectedId, setSelectedId] = useState('');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (activeEntry) setSelectedId(activeEntry.taskId);
    else if (!selectedId) setSelectedId(tasks.find((task) => !['done', 'archived'].includes(task.status))?.id ?? '');
  }, [activeEntry, tasks, selectedId]);
  useEffect(() => {
    if (!activeEntry) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeEntry]);

  const selected = tasks.find((task) => task.id === selectedId);
  const elapsed = activeEntry ? Math.max(0, Math.floor((now - Date.parse(activeEntry.startedAt)) / 1000)) : 0;
  const taskTotal = (selected?.totalTrackedSeconds ?? 0) + elapsed;
  const history = useMemo(() => timeEntries.filter((entry) => entry.endedAt).slice(0, 10), [timeEntries]);

  async function start() {
    if (!selected) return;
    setBusy(true);
    try {
      if (selected.status !== 'active') await electricClient.updateTask(selected.id, { status: 'active' });
      await electricClient.startTimer(selected.id);
    } catch (error) { toastHelpers.error('No se pudo iniciar', (error as Error).message); }
    finally { setBusy(false); }
  }

  async function pause(finish = false) {
    if (!activeEntry || !selected) return;
    setBusy(true);
    try {
      await electricClient.stopTimer(activeEntry.id);
      await electricClient.updateTask(selected.id, { status: finish ? 'done' : 'paused' });
    } catch (error) { toastHelpers.error('No se pudo detener', (error as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-3xl space-y-6">
    <div><h1 className="text-2xl font-bold">Temporizador</h1><p className="text-gray-500">Un solo tramo puede estar activo y sobrevive recargas o desconexiones.</p></div>
    <Card className="p-6">
      <label className="mb-2 block text-sm font-medium">Tarea</label>
      <select className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={Boolean(activeEntry)}>
        <option value="">Selecciona una tarea</option>{tasks.filter((task) => !['done', 'archived'].includes(task.status)).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
      </select>
      <div className="py-12 text-center"><Clock className="mx-auto mb-4 h-10 w-10 text-primary-600" /><p className="font-mono text-6xl font-bold tracking-tight">{formatClock(activeEntry ? elapsed : 0)}</p><p className="mt-2 text-sm text-gray-500">Total de la tarea: {formatDuration(taskTotal)}</p></div>
      <div className="flex justify-center gap-3">
        {!activeEntry ? <Button size="lg" onClick={start} disabled={!selected || busy}><Play className="h-5 w-5" />Iniciar</Button> : <>
          <Button size="lg" variant="secondary" onClick={() => void pause(false)} disabled={busy}><Pause className="h-5 w-5" />Pausar</Button>
          <Button size="lg" onClick={() => void pause(true)} disabled={busy}><CheckCircle className="h-5 w-5" />Finalizar tarea</Button>
        </>}
      </div>
    </Card>
    <Card className="p-5"><h2 className="mb-4 font-semibold">Historial reciente</h2><div className="divide-y dark:divide-gray-700">{history.map((entry) => <div key={entry.id} className="flex items-center justify-between py-3"><div><p className="font-medium">{tasks.find((task) => task.id === entry.taskId)?.title ?? 'Tarea eliminada'}</p><p className="text-xs text-gray-500">{formatDateTime(entry.startedAt)}</p></div><span className="font-mono">{formatDuration(entry.durationSeconds ?? 0)}</span></div>)}{history.length === 0 && <p className="py-6 text-center text-gray-500">Todavía no hay tramos terminados.</p>}</div></Card>
  </div>;
}

function formatClock(seconds: number) {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const rest = Math.floor(seconds % 60).toString().padStart(2, '0');
  return hours + ':' + minutes + ':' + rest;
}
