import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle, Clock, Download } from 'lucide-react';
import { useProjects, useTasks, useTimeEntries } from '@productivity-assistant/electric-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatDuration } from '@/lib/utils';

type Period = 'week' | 'month' | 'year' | 'all';

export function Reports() {
  const { tasks } = useTasks();
  const { projects } = useProjects();
  const { timeEntries } = useTimeEntries();
  const [period, setPeriod] = useState<Period>('week');
  const [projectId, setProjectId] = useState('all');

  const start = useMemo(() => {
    if (period === 'all') return new Date(0);
    const date = new Date();
    if (period === 'week') date.setDate(date.getDate() - 6);
    if (period === 'month') date.setMonth(date.getMonth() - 1);
    if (period === 'year') date.setFullYear(date.getFullYear() - 1);
    date.setHours(0, 0, 0, 0);
    return date;
  }, [period]);
  const entries = useMemo(() => timeEntries.filter((entry) => {
    const task = tasks.find((item) => item.id === entry.taskId);
    return new Date(entry.startedAt) >= start && (projectId === 'all' || task?.projectId === projectId);
  }), [timeEntries, tasks, start, projectId]);
  const total = entries.reduce((sum, entry) => sum + (entry.durationSeconds ?? 0), 0);
  const completed = tasks.filter((task) => task.status === 'done' && new Date(task.updatedAt) >= start && (projectId === 'all' || task.projectId === projectId)).length;

  const byProject = useMemo(() => projects.filter((project) => !project.archivedAt).map((project) => ({
    project,
    seconds: entries.filter((entry) => tasks.find((task) => task.id === entry.taskId)?.projectId === project.id).reduce((sum, entry) => sum + (entry.durationSeconds ?? 0), 0),
  })).filter((item) => item.seconds > 0).sort((a, b) => b.seconds - a.seconds), [projects, entries, tasks]);
  const byDay = useMemo(() => {
    const values = new Map<string, { seconds: number; sessions: number }>();
    for (const entry of entries) {
      const key = new Date(entry.startedAt).toLocaleDateString('es-PY');
      const value = values.get(key) ?? { seconds: 0, sessions: 0 };
      value.seconds += entry.durationSeconds ?? 0;
      value.sessions += 1;
      values.set(key, value);
    }
    return [...values].map(([date, value]) => ({ date, ...value })).reverse();
  }, [entries]);

  function exportCsv() {
    const rows = [['inicio', 'fin', 'duracion_segundos', 'tarea', 'proyecto']];
    for (const entry of entries) {
      const task = tasks.find((item) => item.id === entry.taskId);
      const project = projects.find((item) => item.id === task?.projectId);
      rows.push([entry.startedAt, entry.endedAt ?? '', String(entry.durationSeconds ?? 0), task?.title ?? '', project?.name ?? '']);
    }
    download('reporte-productividad.csv', rows.map((row) => row.map(csvCell).join(',')).join('\n'), 'text/csv');
  }
  function exportJson() {
    download('reporte-productividad.json', JSON.stringify({ period, projectId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, entries }, null, 2), 'application/json');
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">Reportes</h1><p className="text-gray-500">Duraciones calculadas en tu zona horaria: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p></div><div className="flex flex-wrap gap-2"><select className="h-10 rounded-lg border bg-white px-3 dark:bg-gray-800" value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="week">Últimos 7 días</option><option value="month">Último mes</option><option value="year">Último año</option><option value="all">Todo</option></select><select className="h-10 rounded-lg border bg-white px-3 dark:bg-gray-800" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="all">Todos los proyectos</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" />CSV</Button><Button variant="outline" onClick={exportJson}>JSON</Button></div></div>
    <div className="grid gap-4 sm:grid-cols-3"><Metric label="Tiempo registrado" value={formatDuration(total)} icon={Clock} /><Metric label="Tareas completadas" value={String(completed)} icon={CheckCircle} /><Metric label="Sesiones" value={String(entries.length)} icon={CalendarDays} /></div>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5"><h2 className="mb-4 font-semibold">Tiempo por proyecto</h2><div className="space-y-4">{byProject.map(({ project, seconds }) => <div key={project.id}><div className="mb-1 flex justify-between text-sm"><span>{project.name}</span><span className="font-mono">{formatDuration(seconds)}</span></div><div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full" style={{ width: total ? String(seconds / total * 100) + '%' : '0%', background: project.color ?? '#3b82f6' }} /></div></div>)}{byProject.length === 0 && <p className="py-8 text-center text-gray-500">Sin tiempo registrado en este período.</p>}</div></Card>
      <Card className="p-5"><h2 className="mb-4 font-semibold">Actividad por día</h2><div className="max-h-80 overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-gray-500"><th className="py-2">Día</th><th className="py-2 text-right">Sesiones</th><th className="py-2 text-right">Tiempo</th></tr></thead><tbody>{byDay.map((day) => <tr key={day.date} className="border-b dark:border-gray-700"><td className="py-3">{day.date}</td><td className="text-right">{day.sessions}</td><td className="text-right font-mono">{formatDuration(day.seconds)}</td></tr>)}</tbody></table></div></Card>
    </div>
  </div>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock }) { return <Card className="flex items-center justify-between p-5"><div><p className="text-sm text-gray-500">{label}</p><p className="text-2xl font-bold">{value}</p></div><Icon className="h-7 w-7 text-primary-600" /></Card>; }
function csvCell(value: string) { return '"' + value.replaceAll('"', '""') + '"'; }
function download(name: string, content: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
