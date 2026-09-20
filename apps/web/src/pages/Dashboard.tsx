import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Clock, ListTodo, Play, Plus, TrendingUp } from 'lucide-react';
import { useProjects, useTasks, useTimeEntries, useTimer } from '@productivity-assistant/electric-client';
import { Card } from '@/components/ui/Card';
import { useAuthStore } from '@/stores/authStore';
import { formatDuration } from '@/lib/utils';

export function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const { tasks, isLoading } = useTasks();
  const { projects } = useProjects();
  const { timeEntries } = useTimeEntries();
  const { activeEntry } = useTimer();

  const stats = useMemo(() => {
    const today = new Date();
    const todayKey = localDay(today);
    const trackedToday = timeEntries.filter((entry) => localDay(new Date(entry.startedAt)) === todayKey)
      .reduce((sum, entry) => sum + (entry.durationSeconds ?? (entry.endedAt ? Math.floor((Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 1000) : Math.floor((Date.now() - Date.parse(entry.startedAt)) / 1000))), 0);
    const workedDays = new Set(timeEntries.filter((entry) => (entry.durationSeconds ?? 0) > 0).map((entry) => localDay(new Date(entry.startedAt))));
    let streak = 0;
    const cursor = new Date();
    if (!workedDays.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (workedDays.has(localDay(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
    return { trackedToday, streak };
  }, [timeEntries]);

  const pending = tasks.filter((task) => !['done', 'archived'].includes(task.status)).length;
  const completed = tasks.filter((task) => task.status === 'done').length;
  const recent = [...tasks].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);
  const activeTask = activeEntry ? tasks.find((task) => task.id === activeEntry.taskId) : tasks.find((task) => task.status === 'active');

  if (isLoading) return <Card className="p-10 text-center text-gray-500">Preparando tu espacio local…</Card>;
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Hola, {user?.name}</h1><p className="text-gray-500">Este es tu estado actual, calculado con datos reales.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Completadas" value={String(completed)} icon={CheckCircle} />
      <Stat label="Tiempo hoy" value={formatDuration(stats.trackedToday)} icon={Clock} />
      <Stat label="Racha de trabajo" value={stats.streak + (stats.streak === 1 ? ' día' : ' días')} icon={TrendingUp} />
      <Stat label="Pendientes" value={String(pending)} icon={ListTodo} />
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5"><h2 className="mb-4 font-semibold">Acciones rápidas</h2><div className="grid grid-cols-2 gap-3"><QuickLink to="/tasks?new=true" icon={Plus} label="Nueva tarea" /><QuickLink to="/timer" icon={Play} label="Temporizador" /><QuickLink to="/reports" icon={TrendingUp} label="Reportes" /><QuickLink to="/settings" icon={ListTodo} label="Ajustes" /></div></Card>
      <Card className="p-5"><h2 className="mb-4 font-semibold">Trabajo actual</h2>{activeTask ? <div className="rounded-lg bg-primary-50 p-4 dark:bg-primary-950"><p className="font-semibold">{activeTask.title}</p><p className="mt-1 text-sm text-gray-500">{projects.find((project) => project.id === activeTask.projectId)?.name ?? 'Sin proyecto'}</p><Link className="mt-4 inline-flex items-center text-sm font-medium text-primary-600" to="/timer">Abrir temporizador</Link></div> : <p className="py-8 text-center text-gray-500">No hay una tarea activa.</p>}</Card>
    </div>
    <Card className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Actividad reciente</h2><Link to="/tasks" className="text-sm text-primary-600">Ver tareas</Link></div><div className="divide-y dark:divide-gray-700">{recent.map((task) => <div key={task.id} className="flex items-center justify-between py-3"><div><p className="font-medium">{task.title}</p><p className="text-xs text-gray-500">{projects.find((project) => project.id === task.projectId)?.name ?? 'Sin proyecto'}</p></div><span className="text-sm capitalize text-gray-500">{task.status}</span></div>)}{recent.length === 0 && <p className="py-6 text-center text-gray-500">Crea tu primera tarea para comenzar.</p>}</div></Card>
  </div>;
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock }) {
  return <Card className="flex items-center justify-between p-5"><div><p className="text-sm text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div><span className="rounded-xl bg-primary-100 p-3 text-primary-600 dark:bg-primary-950"><Icon className="h-6 w-6" /></span></Card>;
}
function QuickLink({ to, icon: Icon, label }: { to: string; icon: typeof Clock; label: string }) {
  return <Link to={to} className="flex h-24 flex-col items-center justify-center gap-2 rounded-lg bg-gray-100 font-medium hover:bg-gray-200 dark:bg-gray-900 dark:hover:bg-gray-700"><Icon className="h-6 w-6" />{label}</Link>;
}
function localDay(date: Date) { return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate(); }
