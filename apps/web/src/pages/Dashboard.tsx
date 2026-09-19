import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Timer, ListTodo, BarChart3, Settings, Plus, Play, Pause, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const stats = [
  { name: 'Tareas completadas', value: '12', change: '+3', icon: CheckCircle, color: 'text-green-600 bg-green-100 dark:bg-green-900/30' },
  { name: 'Tiempo total', value: '8h 42m', change: '+1h 15m', icon: Clock, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' },
  { name: 'Racha actual', value: '5 días', change: '+2', icon: TrendingUp, color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30' },
  { name: 'Tareas pendientes', value: '7', change: '-2', icon: ListTodo, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
];

const quickActions = [
  { name: 'Nueva tarea', href: '/tasks?new=true', icon: Plus, primary: true },
  { name: 'Iniciar timer', href: '/timer', icon: Play, primary: false },
  { name: 'Ver reportes', href: '/reports', icon: BarChart3, primary: false },
  { name: 'Configuración', href: '/settings', icon: Settings, primary: false },
];

export function Dashboard() {
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
            <Button variant="ghost" size="sm">Ver todas</Button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary-100 flex items-center justify-center">
                  <Timer className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Revisar PR #247</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Proyecto: Frontend</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-mono font-bold text-gray-900 dark:text-gray-100">0:42:13</p>
                <p className="text-xs text-gray-500">En progreso</p>
              </div>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700">
              <div className="h-full bg-primary-600 rounded-full" style={{ width: '70%' }} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm"><Pause className="h-4 w-4" /></Button>
              <Button variant="primary" size="sm"><CheckCircle className="h-4 w-4 mr-1" /> Finalizar</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}