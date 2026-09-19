import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, RotateCcw, Clock, X, Flag, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { useTimer, useTasks, electricClient } from '@productivity-assistant/electric-client';
import { useAuthStore } from '@/stores/authStore';
import { toastHelpers } from '@/components/ui/Toaster';
import { formatDuration } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { uuid, isoDate } from '@productivity-assistant/shared';

export function Timer() {
  const { user } = useAuthStore();
  const { tasks } = useTasks(user?.id || '');
  const { activeEntry, totalTracked, isRunning: isEntryRunning } = useTimer();
  
  const [selectedTask, setSelectedTask] = useState<typeof tasks[0] | null>(tasks[0] || null);
  const [localTime, setLocalTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [showTaskSelector, setShowTaskSelector] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const intervalRef = useRef<number>();

  // Sync with active entry from ElectricSQL
  useEffect(() => {
    if (activeEntry && !isRunning) {
      const elapsed = Math.floor((Date.now() - new Date(activeEntry.startedAt).getTime()) / 1000);
      setLocalTime((activeEntry.durationSeconds || 0) + elapsed);
      setIsRunning(true);
      setSelectedTask(tasks.find(t => t.id === activeEntry.taskId) || null);
    } else if (!activeEntry && isRunning) {
      // Local timer running without server entry - keep local state
    }
  }, [activeEntry, tasks]);

  // Timer interval
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setLocalTime(t => t + 1);
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  const startTimer = useCallback(async () => {
    if (!selectedTask) {
      toastHelpers.warning('Selecciona una tarea', 'Elige una tarea antes de iniciar el timer');
      setShowTaskSelector(true);
      return;
    }

    try {
      await electricClient.createTimeEntry({
        taskId: uuid(selectedTask.id),
        userId: uuid(user!.id),
        startedAt: isoDate(new Date().toISOString()),
        source: 'manual',
        deviceId: 'web',
        metadata: {},
      });
      setIsRunning(true);
    } catch (error) {
      toastHelpers.error('Error', (error as Error).message);
    }
  }, [selectedTask, user]);

  const pauseTimer = useCallback(async () => {
    if (!activeEntry) {
      setIsRunning(false);
      return;
    }

    try {
      await electricClient.updateTimeEntry(activeEntry.id, {
        endedAt: isoDate(new Date().toISOString()),
      });
      setIsRunning(false);
    } catch (error) {
      toastHelpers.error('Error', (error as Error).message);
    }
  }, [activeEntry]);

  const resetTimer = useCallback(async () => {
    if (activeEntry) {
      try {
        await electricClient.updateTimeEntry(activeEntry.id, {
          endedAt: isoDate(new Date(activeEntry.startedAt).toISOString()),
        });
      } catch (error) {
        toastHelpers.error('Error', (error as Error).message);
      }
    }
    setIsRunning(false);
    setLocalTime(0);
  }, [activeEntry]);

  const progress = selectedTask?.estimatedMinutes
    ? Math.min((localTime / 60 / selectedTask.estimatedMinutes) * 100, 100)
    : 0;

  // Calculate display time (including active entry duration if running)
  const displayTime = isRunning && activeEntry
    ? localTime + (activeEntry.durationSeconds || 0)
    : localTime;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Timer</h1>
        <p className="text-gray-500 dark:text-gray-400">Registra tu tiempo de trabajo con precisión.</p>
      </div>

      <Card className="p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tarea actual</label>
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={() => setShowTaskSelector(true)}
            disabled={isRunning}
          >
            <div className="flex items-center gap-3">
              <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', selectedTask ? 'bg-primary-100' : 'bg-gray-100 dark:bg-gray-700')}>
                <Clock className={cn('h-5 w-5', selectedTask ? 'text-primary-600' : 'text-gray-400')} />
              </div>
              <div className="text-left flex-1">
                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {selectedTask?.title || 'Seleccionar tarea'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {selectedTask?.projectId ? 'Cargando proyecto...' : 'Sin proyecto'}
                </p>
              </div>
            </div>
            <RotateCcw className={cn('h-5 w-5 text-gray-400', isRunning && 'opacity-50')} />
          </Button>
        </div>

        <div className="relative mb-8">
          <svg className="w-64 h-64 mx-auto transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="8"
              className="dark:stroke-gray-700"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="url(#gradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${progress * 2.83} ${283 - progress * 2.83}`}
              strokeDashoffset="0"
              className="transition-all duration-300"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 50 50"
                to="360 50 50"
                dur="60s"
                repeatCount="indefinite"
              />
            </circle>
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-5xl font-mono font-bold text-gray-900 dark:text-gray-100">{formatDuration(displayTime)}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {selectedTask?.estimatedMinutes > 0 ? `de ${formatDuration(selectedTask.estimatedMinutes * 60)}` : 'Sin límite'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          {isRunning ? (
            <Button variant="secondary" size="lg" onClick={pauseTimer} className="w-20" disabled={!activeEntry}>
              <Pause className="h-6 w-6" />
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={startTimer} className="w-20" disabled={!selectedTask}>
              <Play className="h-6 w-6" />
            </Button>
          )}
          <Button variant="outline" size="lg" onClick={resetTimer} className="w-20" disabled={!isRunning && displayTime === 0}>
            <Square className="h-6 w-6" />
          </Button>
        </div>

        <div className="mt-6 h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700">
          <div
            className={cn('h-full bg-primary-600 rounded-full transition-all duration-300', progress >= 100 && 'bg-green-500')}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
          {progress >= 100 ? '¡Tiempo estimado completado!' : selectedTask ? `${Math.round(progress)}% del tiempo estimado` : 'Selecciona una tarea para ver progreso'}
        </p>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Sesiones de hoy</h2>
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)}>
            Ver historial
          </Button>
        </div>
        <div className="space-y-2">
          {activeEntry ? (
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary-50 dark:bg-primary-900/20 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary-100 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 text-primary-600 animate-spin" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{selectedTask?.title || 'Tarea actual'}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">En progreso · {formatDuration(displayTime)}</p>
                </div>
              </div>
              <span className="font-mono font-medium text-primary-600 dark:text-primary-400">{formatDuration(displayTime)}</span>
            </div>
          ) : null}
          
          {totalTracked > 0 && (
            <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-2">
              Total hoy: <strong className="text-gray-900 dark:text-gray-100">{formatDuration(totalTracked)}</strong>
            </div>
          )}

          <div className="space-y-2">
            {/* Recent sessions would come from time entries query */}
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">
              El historial completo se muestra en la vista de Reportes
            </p>
          </div>
        </div>
      </Card>

      <Dialog open={showTaskSelector} onOpenChange={setShowTaskSelector}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Seleccionar tarea</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {tasks.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-4">No hay tareas disponibles. Crea una en la sección de Tareas.</p>
            ) : (
              tasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => {
                    setSelectedTask(task);
                    setShowTaskSelector(false);
                  }}
                  className={cn(
                    'w-full text-left p-3 rounded-lg border transition-colors',
                    selectedTask?.id === task.id
                      ? 'bg-primary-50 border-primary-200 dark:bg-primary-900/30 dark:border-primary-800'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                  )}
                >
                  <p className="font-medium text-gray-900 dark:text-gray-100">{task.title}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {task.estimatedMinutes ? `${task.estimatedMinutes}m estimados` : 'Sin estimación'} · {formatDuration(task.totalTrackedSeconds)} registrados
                  </p>
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskSelector(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historial de sesiones</DialogTitle>
          </DialogHeader>
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">
            El historial completo se sincroniza desde ElectricSQL y se muestra en Reportes.
          </p>
          <DialogFooter>
            <Button variant="primary" onClick={() => setShowHistory(false)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}