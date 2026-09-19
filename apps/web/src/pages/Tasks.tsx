import { Plus, Search, Edit, Trash2, Clock, Flag, Play, Loader2, ListTodo, LayoutDashboard } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { useTasks, useProjects, electricClient } from '@productivity-assistant/electric-client';
import { useAuthStore } from '@/stores/authStore';
import { toastHelpers } from '@/components/ui/Toaster';
import { formatDuration } from '@/lib/utils';
import { uuid } from '@productivity-assistant/shared';

const statusOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'active', label: 'En progreso' },
  { value: 'paused', label: 'Pausadas' },
  { value: 'done', label: 'Completadas' },
];

const priorityOptions = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
];

interface TaskFormData {
  title: string;
  description: string;
  status: 'pending' | 'active' | 'paused' | 'done';
  priority: 'low' | 'medium' | 'high';
  projectId: string;
  estimatedMinutes: number;
  isParallel: boolean;
}

export function Tasks() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [formData, setFormData] = useState<TaskFormData>({
    title: '',
    description: '',
    status: 'pending',
    priority: 'medium',
    projectId: '',
    estimatedMinutes: 0,
    isParallel: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { tasks, isLoading } = useTasks(user?.id || '');
  const { projects } = useProjects();

  // Check if we should open create dialog from URL
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setIsCreateOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(search.toLowerCase()) ||
      task.description?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingTask) {
        await electricClient.updateTask(editingTask.id, {
          title: formData.title,
          description: formData.description,
          status: formData.status,
          metadata: {
            ...editingTask.metadata,
            priority: formData.priority,
          },
          projectId: formData.projectId ? uuid(formData.projectId) : undefined,
          estimatedMinutes: formData.estimatedMinutes || undefined,
          isParallel: formData.isParallel,
        });
        toastHelpers.success('Actualizada', 'Tarea actualizada correctamente');
      } else {
        await electricClient.createTask({
          userId: uuid(user!.id),
          title: formData.title,
          description: formData.description,
          status: formData.status,
          projectId: formData.projectId ? uuid(formData.projectId) : undefined,
          estimatedMinutes: formData.estimatedMinutes || undefined,
          isParallel: formData.isParallel,
          metadata: {
            tags: [],
            energyLevel: 'medium',
            context: 'deep_work',
            priority: formData.priority,
          },
          totalTrackedSeconds: 0,
          sortOrder: Date.now(),
        });
        toastHelpers.success('Creada', 'Tarea creada correctamente');
      }
      resetForm();
    } catch (error) {
      toastHelpers.error('Error', (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (task: any) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.metadata?.priority || 'medium',
      projectId: task.projectId || '',
      estimatedMinutes: task.estimatedMinutes || 0,
      isParallel: task.isParallel || false,
    });
    setIsCreateOpen(true);
  };

  const handleDelete = async (task: any) => {
    if (!confirm('¿Eliminar esta tarea?')) return;
    try {
      await electricClient.deleteTask(task.id);
      toastHelpers.success('Eliminada', 'Tarea eliminada correctamente');
    } catch (error) {
      toastHelpers.error('Error', (error as Error).message);
    }
  };

  const handleStatusChange = async (task: any, newStatus: string) => {
    try {
      await electricClient.updateTask(task.id, { status: newStatus as any });
    } catch (error) {
      toastHelpers.error('Error', (error as Error).message);
    }
  };

  const resetForm = () => {
    setEditingTask(null);
    setFormData({
      title: '',
      description: '',
      status: 'pending',
      priority: 'medium',
      projectId: '',
      estimatedMinutes: 0,
      isParallel: false,
    });
    setIsCreateOpen(false);
  };

  const openCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tareas</h1>
            <p className="text-gray-500 dark:text-gray-400">Gestiona y organiza tus tareas eficientemente.</p>
          </div>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Nueva tarea</Button>
        </div>
        <Card>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse h-20 bg-gray-100 dark:bg-gray-800 rounded-lg" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tareas</h1>
          <p className="text-gray-500 dark:text-gray-400">Gestiona y organiza tus tareas eficientemente.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Nueva tarea</Button>
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
            {filteredTasks.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                {search || statusFilter !== 'all' ? 'No se encontraron tareas' : 'No hay tareas aún. Crea tu primera tarea.'}
              </div>
            ) : (
              filteredTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  projects={projects}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                />
              ))
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-5">
            {statusOptions.filter(o => o.value !== 'all').map(status => (
              <div key={status.value} className="flex flex-col">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{status.label}</h3>
                <div className="flex-1 space-y-2 min-h-[300px] bg-gray-50/50 rounded-lg p-2 dark:bg-gray-800/50">
                  {filteredTasks.filter(t => t.status === status.value).map(task => (
                    <TaskCard key={task.id} task={task} projects={projects} onEdit={handleEdit} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTask ? 'Editar tarea' : 'Nueva tarea'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">Título *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="¿Qué necesitas hacer?"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Detalles adicionales..."
                  rows={3}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="status">Estado</Label>
                  <Select value={formData.status} onValueChange={v => setFormData(prev => ({ ...prev, status: v as any }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.filter(o => o.value !== 'all').map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="priority">Prioridad</Label>
                  <Select value={formData.priority} onValueChange={v => setFormData(prev => ({ ...prev, priority: v as any }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Prioridad" />
                    </SelectTrigger>
                    <SelectContent>
                      {priorityOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="projectId">Proyecto</Label>
                  <Select value={formData.projectId} onValueChange={v => setFormData(prev => ({ ...prev, projectId: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar proyecto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sin proyecto</SelectItem>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="estimatedMinutes">Tiempo estimado (min)</Label>
                  <Input
                    id="estimatedMinutes"
                    type="number"
                    value={formData.estimatedMinutes}
                    onChange={e => setFormData(prev => ({ ...prev, estimatedMinutes: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isParallel"
                  checked={formData.isParallel}
                  onChange={e => setFormData(prev => ({ ...prev, isParallel: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <Label htmlFor="isParallel" className="text-sm font-normal cursor-pointer">
                  Permitir ejecución en paralelo
                </Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={resetForm}>Cancelar</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : ''}
                  {editingTask ? 'Actualizar' : 'Crear'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}

function TaskRow({ task, projects, onEdit, onDelete, onStatusChange }: any) {
  const project = projects.find(p => p.id === task.projectId);
  const statusColors: Record<string, string> = {
    pending: 'gray',
    active: 'primary',
    paused: 'warning',
    done: 'success',
  };

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</h3>
          <Badge variant={task.metadata?.priority === 'high' ? 'danger' : task.metadata?.priority === 'medium' ? 'warning' : 'gray'}>
            {task.metadata?.priority || 'media'}
          </Badge>
          <Badge variant={statusColors[task.status] || 'gray'}>{task.status}</Badge>
        </div>
        {task.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{task.description}</p>
        )}
        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
          {project && <span className="flex items-center gap-1"><Flag className="h-3 w-3" /> {project.name}</span>}
          {(task.estimatedMinutes || task.totalTrackedSeconds) && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(task.totalTrackedSeconds)}
              {task.estimatedMinutes && ` / ${task.estimatedMinutes}m`}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" onClick={() => onStatusChange(task, task.status === 'active' ? 'paused' : 'active')}>
          <Play className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onEdit(task)}>
          <Edit className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(task)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TaskCard({ task, projects, onEdit, onDelete }: any) {
  const project = projects.find(p => p.id === task.projectId);

  return (
    <div className="p-3 rounded-lg bg-white border border-gray-200 dark:bg-gray-800 dark:border-gray-700" onDoubleClick={() => onEdit(task)}>
      <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{task.title}</h4>
      {project && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{project.name}</p>}
      <div className="flex items-center gap-1 mt-2">
        <Badge variant={task.metadata?.priority === 'high' ? 'danger' : task.metadata?.priority === 'medium' ? 'warning' : 'gray'} className="text-xs">
          {task.metadata?.priority || 'media'}
        </Badge>
      </div>
    </div>
  );
}