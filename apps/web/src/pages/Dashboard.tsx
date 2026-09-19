import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Timer, ListTodo, BarChart3, Settings, Plus, Play, Pause, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTasks, useTimer } from '@productivity-assistant/electric-client';
import { useAuthStore } from '@/stores/authStore';
import { formatDuration } from '@/lib/utils';

const quickActions = [
  { name: 'Nueva tarea', href: '/tasks?new=true', icon: Plus, primary: true },
  { name: 'Iniciar timer', href: '/timer', icon: Play, primary: false },
  { name: 'Ver reportes', href: '/reports', icon: BarChart3, primary: false },
  { name: 'Configuración', href: '/settings', icon: Settings, primary: false },
];

export function Dashboard() {
  const { user } = useAuthStore();
  const { tasks, isLoading: tasksLoading } = useTasks(user?.id || '');
  const { activeEntry, totalTracked, isRunning } = useTimer();

  // Calculate stats from live data
  const completedTasks = tasks.filter(t => t.status === 'done').length;
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'active' || t.status === 'paused').length;
  const totalTrackedMinutes = Math.floor(totalTracked / 60);

  const stats = [
    { name: 'Tareas completadas', value: completedTasks.toString(), change: '+3', icon: CheckCircle, color: 'text-green-600 bg-green-100 dark:bg-green-900/30' },
    { name: 'Tiempo total hoy', value: `${totalTrackedMinutes}h ${totalTracked % 60}m`, change: '+1h 15m', icon: Clock, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' },
    { name: 'Racha actual', value: '5 días', change: '+2', icon: TrendingUp, color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30' },
    { name: 'Tareas pendientes', value: pendingTasks.toString(), change: '-2', icon: ListTodo, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
  ];

  const activeTask = tasks.find(t => t.status === 'active');
  const progress = activeTask && activeTask.estimatedMinutes
    ? Math.min((activeTask.totalTrackedSeconds / 60 / activeTask.estimatedMinutes) * 100, 100)
    : 0;

  if (tasksLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400">Bienvenido de vuelta. Aquí está tu resumen de hoy.</p>
        </div>
        <Button asChild>
          <Link to="/tasks?new=true"><Plus className="h-4 w-4 mr-2" /> Nueva tarea</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
                <p className="text-xs text-green-600 dark:text-green-400">{stat.change} vs ayer</p>
              </div>
              <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center', stat.color)}>
                <stat.icon className="h-6 w-6" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Acciones rápidas</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {quickActions.map((action, index) => (
              <Button
                key={index}
                asChild
                variant={action.primary ? 'primary' : 'secondary'}
                className="h-24 flex-col gap-2 justify-center"
              >
                <Link to={action.href}>
                  <action.icon className="h-8 w-8" />
                  <span className="text-center">{action.name}</span>
                </Link>
              </Button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tarea activa</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tasks">Ver todas</Link>
            </Button>
          </div>
          {activeTask ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary-100 flex items-center justify-center">
                    <Timer className="h-5 w-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{activeTask.title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Proyecto: {activeTask.projectId ? 'Cargando...' : 'Sin proyecto'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-mono font-bold text-gray-900 dark:text-gray-100">
                    {isRunning && activeEntry
                      ? formatDuration((activeEntry.durationSeconds || 0) + Math.floor((Date.now() - new Date(activeEntry.startedAt).getTime()) / 1000))
                      : formatDuration(activeTask.totalTrackedSeconds)}
                  </p>
                  <p className="text-xs text-gray-500">{isRunning ? 'En progreso' : 'Pausada'}</p>
                </div>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700">
                <div className="h-full bg-primary-600 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant={isRunning ? 'secondary' : 'primary'} size="sm" onClick={() => {}}>
                  {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button variant="primary" size="sm" onClick={() => {}}>
                  <CheckCircle className="h-4 w-4 mr-1" /> Finalizar
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Timer className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No hay tarea activa</p>
              <Button asChild className="mt-4" variant="outline">
                <Link to="/tasks?new=true"><Plus className="h-4 w-4 mr-2" /> Crear tarea</Link>
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}