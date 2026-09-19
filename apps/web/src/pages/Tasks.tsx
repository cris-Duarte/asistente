import { Plus, Search, Filter, MoreVertical, Edit, Trash2, Check, Clock, Flag, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';

const mockTasks = [
  { id: '1', title: 'Revisar PR #247', project: 'Frontend', status: 'active', priority: 'high', estimated: '2h', tracked: '1h 30m' },
  { id: '2', title: 'Escribir documentación API', project: 'Backend', status: 'pending', priority: 'medium', estimated: '3h', tracked: '0m' },
  { id: '3', title: 'Refactor auth module', project: 'Backend', status: 'paused', priority: 'high', estimated: '4h', tracked: '2h 15m' },
  { id: '4', title: 'Diseñar dashboard', project: 'Design', status: 'done', priority: 'low', estimated: '5h', tracked: '5h 30m' },
  { id: '5', title: 'Fix memory leak', project: 'Frontend', status: 'pending', priority: 'high', estimated: '2h', tracked: '0m' },
];

const statusOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'active', label: 'En progreso' },
  { value: 'paused', label: 'Pausadas' },
  { value: 'done', label: 'Completadas' },
];

export function Tasks() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState<'list' | 'kanban'>('list');

  const filteredTasks = mockTasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(search.toLowerCase()) ||
      task.project.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tareas</h1>
          <p className="text-gray-500 dark:text-gray-400">Gestiona y organiza tus tareas eficientemente.</p>
        </div>
        <Button asChild>
          <Link to="/tasks?new=true"><Plus className="h-4 w-4 mr-2" /> Nueva tarea</Link>
        </Button>
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar tareas..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setView('list')} className={view === 'list' ? 'bg-gray-100 dark:bg-gray-800' : ''}>
              <ListTodo className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setView('kanban')} className={view === 'kanban' ? 'bg-gray-100 dark:bg-gray-800' : ''}>
              <LayoutDashboard className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {view === 'list' ? (
          <div className="space-y-3">
            {filteredTasks.map(task => (
              <div key={task.id} className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</h3>
                    <Badge variant={task.priority === 'high' ? 'danger' : task.priority === 'medium' ? 'warning' : 'gray'}>{task.priority}</Badge>
                    <Badge variant={task.status === 'done' ? 'success' : task.status === 'active' ? 'primary' : task.status === 'paused' ? 'warning' : 'gray'}>{task.status}</Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1"><Flag className="h-3 w-3" /> {task.project}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {task.tracked} / {task.estimated}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon"><Play className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            {filteredTasks.length === 0 && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                No se encontraron tareas
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-5">
            {statusOptions.filter(o => o.value !== 'all').map(status => (
              <div key={status.value} className="flex flex-col">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{status.label}</h3>
                <div className="flex-1 space-y-2 min-h-[300px] bg-gray-50/50 rounded-lg p-2 dark:bg-gray-800/50">
                  {filteredTasks.filter(t => t.status === status.value).map(task => (
                    <div key={task.id} className="p-3 rounded-lg bg-white border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm">{task.title}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{task.project}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}