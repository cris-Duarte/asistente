import { useState, useMemo } from 'react';
import { Download, Calendar, BarChart3, PieChart, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line, AreaChart, Area,
} from 'recharts';
import { cn } from '@/lib/utils';
import { useTasks, useTimeEntries, useProjects, electricClient } from '@productivity-assistant/electric-client';
import { useAuthStore } from '@/stores/authStore';
import { formatDuration, formatDate } from '@/lib/utils';

const periodOptions = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
  { value: 'year', label: 'Este año' },
  { value: 'all', label: 'Todo el tiempo' },
];

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];

export function Reports() {
  const { user } = useAuthStore();
  const [period, setPeriod] = useState('week');
  const { tasks } = useTasks(user?.id || '');
  const { entries, isLoading: entriesLoading } = useTimeEntries();
  const { projects } = useProjects();

  // Calculate stats
  const stats = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(0);
    }

    const periodEntries = entries.filter(e => new Date(e.startedAt) >= startDate);
    const totalSeconds = periodEntries.reduce((sum, e) => sum + (e.durationSeconds || 0), 0);
    const completedTasks = tasks.filter(t => t.status === 'done' && new Date(t.updatedAt) >= startDate).length;
    const activeProjects = new Set(periodEntries.map(e => e.taskId).filter(Boolean)).size;

    return [
      { name: 'Horas totales', value: formatDuration(totalSeconds), change: '+12%', icon: Clock, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' },
      { name: 'Tareas completadas', value: completedTasks.toString(), change: '+5', icon: CheckCircle, color: 'text-green-600 bg-green-100 dark:bg-green-900/30' },
      { name: 'Promedio diario', value: formatDuration(Math.floor(totalSeconds / Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))))), change: '+8%', icon: TrendingUp, color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30' },
      { name: 'Proyectos activos', value: activeProjects.toString(), change: '0', icon: BarChart3, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
    ];
  }, [period, entries, tasks]);

  // Time by project data
  const projectTimeData = useMemo(() => {
    const projectTime: Record<string, { name: string; time: number; color: string }> = {};
    
    entries.forEach((entry, idx) => {
      const task = tasks.find(t => t.id === entry.taskId);
      const project = projects.find(p => p.id === task?.projectId);
      const projectName = project?.name || 'Sin proyecto';
      
      if (!projectTime[projectName]) {
        projectTime[projectName] = {
          name: projectName,
          time: 0,
          color: COLORS[Object.keys(projectTime).length % COLORS.length],
        };
      }
      projectTime[projectName].time += entry.durationSeconds || 0;
    });

    return Object.values(projectTime)
      .sort((a, b) => b.time - a.time)
      .map(p => ({ ...p, hours: Math.floor(p.time / 3600), minutes: Math.floor((p.time % 3600) / 60) }));
  }, [entries, tasks, projects]);

  // Daily data for line chart
  const dailyData = useMemo(() => {
    const days = 7;
    const data: Array<{ date: string; hours: number; tasks: number }> = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      
      const dayEntries = entries.filter(e => {
        const entryDate = new Date(e.startedAt);
        return entryDate >= date && entryDate < nextDate;
      });
      
      const totalSeconds = dayEntries.reduce((sum, e) => sum + (e.durationSeconds || 0), 0);
      const uniqueTasks = new Set(dayEntries.map(e => e.taskId)).size;
      
      data.push({
        date: date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }),
        hours: Math.floor(totalSeconds / 3600) + (totalSeconds % 3600) / 60 / 100,
        tasks: uniqueTasks,
      });
    }
    
    return data;
  }, [entries]);

  // Task status distribution
  const statusData = useMemo(() => {
    const counts = tasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts).map(([status, count]) => ({
      status,
      count,
      label: status.charAt(0).toUpperCase() + status.slice(1),
    }));
  }, [tasks]);

  if (entriesLoading) {
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reportes</h1>
          <p className="text-gray-500 dark:text-gray-400">Analiza tu productividad y tiempo invertido.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline"><Download className="h-4 w-4 mr-2" /> Exportar</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
                <p className="text-xs text-green-600 dark:text-green-400">{stat.change} vs período anterior</p>
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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tiempo por proyecto</h2>
            <Badge variant="secondary">{projectTimeData.length} proyectos</Badge>
          </div>
          <div className="h-72">
            {projectTimeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectTimeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--grid-stroke, #e5e7eb)" />
                  <XAxis type="number" tickFormatter={v => `${v}h`} stroke="#9ca3af" />
                  <YAxis dataKey="name" type="category" width={120} stroke="#9ca3af" tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [`${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`, 'Tiempo']}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  />
                  <Bar dataKey="time" radius={[0, 4, 4, 0]}>
                    {projectTimeData.map((_, i) => (
                      <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-72 flex items-center justify-center text-gray-500 dark:text-gray-400">
                No hay datos de tiempo para el período seleccionado
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Distribución de tareas</h2>
            <Badge variant="secondary">{tasks.length} tareas</Badge>
          </div>
          <div className="h-72">
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="label"
                    label={({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {statusData.map((_, i) => (
                      <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [value.toString(), 'Tareas']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-72 flex items-center justify-center text-gray-500 dark:text-gray-400">
                No hay tareas registradas
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tendencia semanal</h2>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke, #e5e7eb)" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                <YAxis stroke="#9ca3af" tickFormatter={v => `${v}h`} />
                <Tooltip
                  labelFormatter={(date: string) => date}
                  formatter={(value: number, name: string) => [
                    name === 'hours' ? `${value.toFixed(2)}h` : `${value} tareas`,
                    name === 'hours' ? 'Horas' : 'Tareas',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="hours"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorHours)"
                />
                <Area
                  type="monotone"
                  dataKey="tasks"
                  stroke="#8b5cf6"
                  fillOpacity={1}
                  fill="url(#colorTasks)"
                  yAxisId="right"
                />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Resumen semanal</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left p-3 font-medium text-gray-500 dark:text-gray-400">Día</th>
                  <th className="text-right p-3 font-medium text-gray-500 dark:text-gray-400">Horas</th>
                  <th className="text-right p-3 font-medium text-gray-500 dark:text-gray-400">Tareas</th>
                  <th className="text-right p-3 font-medium text-gray-500 dark:text-gray-400">Promedio/tarea</th>
                </tr>
              </thead>
              <tbody>
                {dailyData.map((day, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="p-3 text-gray-900 dark:text-gray-100">{day.date}</td>
                    <td className="text-right p-3 font-mono text-gray-900 dark:text-gray-100">{day.hours.toFixed(2)}h</td>
                    <td className="text-right p-3 text-gray-900 dark:text-gray-100">{day.tasks}</td>
                    <td className="text-right p-3 font-mono text-gray-500 dark:text-gray-400">
                      {day.tasks > 0 ? (day.hours / day.tasks).toFixed(2) + 'h' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}