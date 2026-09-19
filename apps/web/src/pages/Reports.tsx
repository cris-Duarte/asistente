import { Download, Calendar, BarChart3, PieChart, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';

const periodOptions = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
  { value: 'year', label: 'Este año' },
  { value: 'all', label: 'Todo el tiempo' },
];

export function Reports() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reportes</h1>
          <p className="text-gray-500 dark:text-gray-400">Analiza tu productividad y tiempo invertido.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value="week" onValueChange={() => {}}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent          />
          <Button variant="outline"><Download className="h-4 w-4 mr-2" /> Exportar</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { name: 'Horas totales', value: '42h 30m', change: '+12%', icon: Clock, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' },
          { name: 'Tareas completadas', value: '28', change: '+5', icon: CheckCircle, color: 'text-green-600 bg-green-100 dark:bg-green-900/30' },
          { name: 'Promedio diario', value: '6h 04m', change: '+8%', icon: TrendingUp, color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30' },
          { name: 'Proyectos activos', value: '5', change: '0', icon: BarChart3, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
        ].map((stat, i) => (
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
          </div>
          <div className="h-64 flex items-center justify-center">
            <p className="text-gray-500 dark:text-gray-400">Gráfico de barras - Próximamente con Recharts</p>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Distribución por tipo de tarea</h2>
          </div>
          <div className="h-64 flex items-center justify-center">
            <p className="text-gray-500 dark:text-gray-400">Gráfico circular - Próximamente con Recharts</p>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Resumen semanal</h2>
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
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="p-3 text-gray-900 dark:text-gray-100">{day}</td>
                  <td className="text-right p-3 font-mono text-gray-900 dark:text-gray-100">{['6h 30m', '7h 15m', '5h 45m', '8h 00m', '6h 30m', '2h 00m', '1h 30m'][i]}</td>
                  <td className="text-right p-3 text-gray-900 dark:text-gray-100">{[5, 6, 4, 7, 5, 2, 1][i]}</td>
                  <td className="text-right p-3 font-mono text-gray-500 dark:text-gray-400">{['1h 18m', '1h 12m', '1h 26m', '1h 08m', '1h 18m', '1h 00m', '1h 30m'][i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}