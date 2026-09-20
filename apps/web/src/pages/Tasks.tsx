import { useMemo, useState } from 'react';
import { Archive, Check, Edit3, FolderPlus, LayoutGrid, List, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import type { Project, Task, TaskStatus } from '@productivity-assistant/shared';
import { electricClient, useProjects, useTasks } from '@productivity-assistant/electric-client';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { toastHelpers } from '@/components/ui/Toaster';

const statuses: Array<{ value: TaskStatus; label: string }> = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'active', label: 'Activa' },
  { value: 'paused', label: 'Pausada' },
  { value: 'done', label: 'Completada' },
];

export function Tasks() {
  const { tasks, isLoading } = useTasks();
  const { projects } = useProjects();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TaskStatus | 'all'>('all');
  const [projectId, setProjectId] = useState('all');
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [editing, setEditing] = useState<Task | null>(null);
  const [taskDialog, setTaskDialog] = useState(new URLSearchParams(location.search).get('new') === 'true');
  const [projectDialog, setProjectDialog] = useState(false);

  const filtered = useMemo(() => tasks.filter((task) =>
    (status === 'all' || task.status === status)
    && (projectId === 'all' || task.projectId === projectId)
    && (task.title + ' ' + (task.description ?? '')).toLowerCase().includes(search.toLowerCase())
  ), [tasks, search, status, projectId]);

  function edit(task: Task) {
    setEditing(task);
    setTaskDialog(true);
  }

  async function remove(task: Task) {
    if (!confirm('¿Archivar la tarea “' + task.title + '”?')) return;
    await electricClient.deleteTask(task.id);
    toastHelpers.success('Tarea archivada');
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Tareas</h1><p className="text-gray-500">Los cambios se guardan localmente y se sincronizan al volver la conexión.</p></div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setProjectDialog(true)}><FolderPlus className="h-4 w-4" />Proyecto</Button>
        <Button onClick={() => { setEditing(null); setTaskDialog(true); }}><Plus className="h-4 w-4" />Nueva tarea</Button>
      </div>
    </div>

    <Card className="p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><Input className="pl-9" placeholder="Buscar…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <select className="rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-800" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus | 'all')}>
          <option value="all">Todos los estados</option>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select className="rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-800" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="all">Todos los proyectos</option>{projects.filter((project) => !project.archivedAt).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <div className="flex rounded-lg border border-gray-300 p-1"><Button size="icon" variant={view === 'list' ? 'secondary' : 'ghost'} onClick={() => setView('list')}><List className="h-4 w-4" /></Button><Button size="icon" variant={view === 'kanban' ? 'secondary' : 'ghost'} onClick={() => setView('kanban')}><LayoutGrid className="h-4 w-4" /></Button></div>
      </div>
    </Card>

    {isLoading ? <Card className="p-8 text-center text-gray-500">Preparando datos locales…</Card>
      : view === 'list' ? <div className="space-y-3">{filtered.map((task) => <TaskRow key={task.id} task={task} project={projects.find((item) => item.id === task.projectId)} onEdit={() => edit(task)} onDelete={() => void remove(task)} />)}{filtered.length === 0 && <Empty />}</div>
      : <div className="grid gap-4 xl:grid-cols-4">{statuses.map((column) => <Card key={column.value} className="p-3"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{column.label}</h2><Badge variant="gray">{filtered.filter((task) => task.status === column.value).length}</Badge></div><div className="space-y-2">{filtered.filter((task) => task.status === column.value).map((task) => <TaskCard key={task.id} task={task} onEdit={() => edit(task)} />)}</div></Card>)}</div>}

    <Projects projects={projects} />
    <TaskForm open={taskDialog} onOpenChange={setTaskDialog} task={editing} projects={projects.filter((project) => !project.archivedAt)} />
    <ProjectForm open={projectDialog} onOpenChange={setProjectDialog} />
  </div>;
}

function TaskRow({ task, project, onEdit, onDelete }: { task: Task; project?: Project; onEdit: () => void; onDelete: () => void }) {
  return <Card className="flex items-center gap-4 p-4">
    <button className="rounded-full border p-2" title="Completar" onClick={() => void electricClient.updateTask(task.id, { status: task.status === 'done' ? 'pending' : 'done' })}><Check className={'h-4 w-4 ' + (task.status === 'done' ? 'text-green-600' : 'text-gray-300')} /></button>
    <div className="min-w-0 flex-1"><p className={'font-medium ' + (task.status === 'done' ? 'line-through text-gray-400' : '')}>{task.title}</p><p className="truncate text-sm text-gray-500">{project?.name ?? 'Sin proyecto'} · {task.estimatedMinutes ? task.estimatedMinutes + ' min estimados' : 'Sin estimación'}</p></div>
    <Badge variant={task.status === 'done' ? 'success' : task.status === 'active' ? 'primary' : task.status === 'paused' ? 'warning' : 'gray'}>{statuses.find((item) => item.value === task.status)?.label ?? task.status}</Badge>
    <Button size="icon" variant="ghost" onClick={onEdit}><Edit3 className="h-4 w-4" /></Button>
    <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4 text-red-500" /></Button>
  </Card>;
}

function TaskCard({ task, onEdit }: { task: Task; onEdit: () => void }) {
  return <button className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-primary-400 dark:border-gray-700 dark:bg-gray-900" onClick={onEdit}><p className="font-medium">{task.title}</p><p className="mt-1 text-xs text-gray-500">{task.estimatedMinutes ? task.estimatedMinutes + ' min' : 'Sin estimación'}</p></button>;
}

function Empty() { return <Card className="p-10 text-center text-gray-500">No hay tareas para estos filtros.</Card>; }

function TaskForm({ open, onOpenChange, task, projects }: { open: boolean; onOpenChange: (open: boolean) => void; task: Task | null; projects: Project[] }) {
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      title: String(form.get('title') ?? ''),
      description: String(form.get('description') ?? '') || undefined,
      status: String(form.get('status') ?? 'pending') as TaskStatus,
      projectId: String(form.get('projectId') ?? '') || undefined,
      estimatedMinutes: form.get('estimatedMinutes') ? Number(form.get('estimatedMinutes')) : undefined,
    };
    setSaving(true);
    try {
      if (task) await electricClient.updateTask(task.id, input);
      else await electricClient.createTask(input);
      onOpenChange(false);
      toastHelpers.success(task ? 'Tarea actualizada' : 'Tarea creada');
    } catch (error) { toastHelpers.error('No se pudo guardar', (error as Error).message); }
    finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{task ? 'Editar tarea' : 'Nueva tarea'}</DialogTitle></DialogHeader><form key={task?.id ?? 'new'} className="mt-5 space-y-4" onSubmit={submit}>
    <div><Label htmlFor="title">Título</Label><Input id="title" name="title" required defaultValue={task?.title} /></div>
    <div><Label htmlFor="description">Descripción</Label><Textarea id="description" name="description" defaultValue={task?.description} /></div>
    <div className="grid grid-cols-2 gap-3"><div><Label>Estado</Label><select name="status" defaultValue={task?.status ?? 'pending'} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 dark:bg-gray-800">{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><div><Label>Proyecto</Label><select name="projectId" defaultValue={task?.projectId ?? ''} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 dark:bg-gray-800"><option value="">Sin proyecto</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div></div>
    <div><Label htmlFor="estimatedMinutes">Estimación en minutos</Label><Input id="estimatedMinutes" name="estimatedMinutes" type="number" min="1" defaultValue={task?.estimatedMinutes} /></div>
    <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}

function ProjectForm({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await electricClient.createProject({ name: String(form.get('name')), color: String(form.get('color')) });
    onOpenChange(false);
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Nuevo proyecto</DialogTitle></DialogHeader><form className="mt-5 space-y-4" onSubmit={submit}><div><Label>Nombre</Label><Input name="name" required /></div><div><Label>Color</Label><Input name="color" type="color" defaultValue="#3B82F6" /></div><DialogFooter><Button type="submit">Crear proyecto</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Projects({ projects }: { projects: Project[] }) {
  return <Card className="p-4"><h2 className="mb-3 font-semibold">Proyectos</h2><div className="grid gap-2 md:grid-cols-2">{projects.map((project) => <div key={project.id} className="flex items-center gap-3 rounded-lg border p-3"><span className="h-3 w-3 rounded-full" style={{ background: project.color ?? '#94a3b8' }} /><span className={'flex-1 ' + (project.archivedAt ? 'text-gray-400 line-through' : '')}>{project.name}</span><Button size="icon" variant="ghost" title={project.archivedAt ? 'Restaurar' : 'Archivar'} onClick={() => void electricClient.archiveProject(project.id, Boolean(project.archivedAt))}>{project.archivedAt ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</Button></div>)}</div></Card>;
}
