import { useEffect, useState } from 'react';
import { Bell, Database, Download, Fingerprint, LogOut, Monitor, Palette, Shield, Upload, User } from 'lucide-react';
import { apiRequest, mutationHeaders } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useElectric } from '@/context/ElectricContext';
import { PasskeyManager } from '@/components/auth/PasskeyManager';
import { SyncStatusDetail } from '@/components/SyncStatusIndicator';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { toastHelpers } from '@/components/ui/Toaster';

type Section = 'profile' | 'notifications' | 'appearance' | 'data' | 'security';
interface SessionItem { id: string; userAgent?: string; ipAddress?: string; lastSeenAt: string; current: boolean; }
interface DeviceItem { id: string; name: string; hardwareId: string; firmwareVersion?: string; lastSeenAt?: string; }
interface ExportData { schemaVersion: 1; exportedAt: string; projects: Array<Record<string, unknown>>; tasks: Array<Record<string, unknown>>; timeEntries: Array<Record<string, unknown>>; }

const sections: Array<{ id: Section; label: string; icon: typeof User }> = [
  { id: 'profile', label: 'Perfil', icon: User },
  { id: 'notifications', label: 'Notificaciones', icon: Bell },
  { id: 'appearance', label: 'Apariencia', icon: Palette },
  { id: 'data', label: 'Datos', icon: Database },
  { id: 'security', label: 'Seguridad', icon: Shield },
];

export function Settings() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const logout = useAuthStore((state) => state.logout);
  const { conflicts, client } = useElectric();
  const [section, setSection] = useState<Section>((new URLSearchParams(location.search).get('section') as Section) || (user?.recoveryRequired ? 'security' : 'profile'));
  const [name, setName] = useState(user?.name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [notifications, setNotifications] = useState(Boolean(user?.preferences.notifications));
  const [dark, setDark] = useState(localStorage.getItem('darkMode') === 'true');
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [pairingCode, setPairingCode] = useState('');

  async function loadSecurity() {
    const [sessionItems, deviceItems] = await Promise.all([
      apiRequest<SessionItem[]>('/api/auth/sessions'),
      apiRequest<DeviceItem[]>('/api/devices'),
    ]);
    setSessions(sessionItems);
    setDevices(deviceItems);
  }
  useEffect(() => { if (section === 'security') void loadSecurity(); }, [section]);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('darkMode', String(dark)); }, [dark]);

  async function saveProfile() {
    const result = await apiRequest<{ name: string; timezone: string; preferences: Record<string, unknown> }>('/api/auth/me', {
      method: 'PATCH', body: JSON.stringify({ name, timezone, preferences: { ...user?.preferences, notifications, darkMode: dark } }),
    });
    updateUser(result);
    toastHelpers.success('Preferencias guardadas');
  }

  async function toggleNotifications(enabled: boolean) {
    if (enabled) {
      if (!('Notification' in window)) return toastHelpers.error('No disponible', 'Este navegador no admite notificaciones.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return toastHelpers.warning('Permiso no concedido');
      new Notification('Productivity', { body: 'Las notificaciones locales están activas.' });
    }
    setNotifications(enabled);
  }

  async function exportData(kind: 'json' | 'csv') {
    const data = await apiRequest<ExportData>('/api/export');
    if (kind === 'json') return download('productivity-backup.json', JSON.stringify(data, null, 2), 'application/json');
    const rows = [['id', 'titulo', 'estado', 'proyecto', 'creada', 'actualizada'], ...data.tasks.map((task) => [String(task.id), String(task.title), String(task.status), String(task.projectId ?? ''), String(task.createdAt), String(task.updatedAt)])];
    download('productivity-tasks.csv', rows.map((row) => row.map(csvCell).join(',')).join('\n'), 'text/csv');
  }

  async function importData(file: File) {
    try {
      const data = JSON.parse(await file.text()) as ExportData;
      const preview = await apiRequest<{ counts: { projects: number; tasks: number; timeEntries: number } }>('/api/import/preview', { method: 'POST', body: JSON.stringify(data) });
      const message = 'Se importarán ' + preview.counts.projects + ' proyectos, ' + preview.counts.tasks + ' tareas y ' + preview.counts.timeEntries + ' registros de tiempo. ¿Continuar?';
      if (!confirm(message)) return;
      await apiRequest('/api/import/apply', { method: 'POST', headers: mutationHeaders(), body: JSON.stringify(data) });
      toastHelpers.success('Importación completada');
    } catch (error) { toastHelpers.error('Importación inválida', (error as Error).message); }
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="text-2xl font-bold">Configuración</h1><p className="text-gray-500">Perfil, datos locales y acceso a tu cuenta.</p></div>
    <div className="grid gap-6 md:grid-cols-[190px_1fr]">
      <nav className="space-y-1">{sections.map((item) => <button key={item.id} className={'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm ' + (section === item.id ? 'bg-primary-50 text-primary-700 dark:bg-primary-950' : 'hover:bg-gray-100 dark:hover:bg-gray-800')} onClick={() => setSection(item.id)}><item.icon className="h-4 w-4" />{item.label}</button>)}</nav>
      <div className="space-y-5">
        {section === 'profile' && <Card className="space-y-4 p-5"><h2 className="font-semibold">Perfil del propietario</h2><div><Label>Nombre</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div><div><Label>Email</Label><Input value={user?.email ?? ''} disabled /></div><div><Label>Zona horaria</Label><Input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></div><Button onClick={saveProfile}>Guardar</Button></Card>}
        {section === 'notifications' && <Card className="p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Notificaciones locales</h2><p className="text-sm text-gray-500">El navegador mostrará avisos mientras su plataforma permita ejecutar la PWA.</p></div><Switch checked={notifications} onCheckedChange={(value) => void toggleNotifications(value)} /></div><Button className="mt-5" onClick={saveProfile}>Guardar preferencia</Button></Card>}
        {section === 'appearance' && <Card className="p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Modo oscuro</h2><p className="text-sm text-gray-500">Se conserva en este navegador y en tus preferencias.</p></div><Switch checked={dark} onCheckedChange={setDark} /></div><Button className="mt-5" onClick={saveProfile}>Guardar preferencia</Button></Card>}
        {section === 'data' && <><Card className="p-5"><h2 className="mb-4 font-semibold">Sincronización</h2><SyncStatusDetail /><Button className="mt-4" variant="outline" onClick={() => void client.flush()}>Sincronizar ahora</Button></Card><Card className="p-5"><h2 className="mb-4 font-semibold">Exportar e importar</h2><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void exportData('json')}><Download className="h-4 w-4" />JSON</Button><Button variant="outline" onClick={() => void exportData('csv')}>CSV</Button><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm font-medium"><Upload className="h-4 w-4" />Importar<input className="hidden" type="file" accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importData(file); }} /></label></div></Card>{conflicts.length > 0 && <Card className="p-5"><h2 className="mb-4 font-semibold">Conflictos</h2><div className="space-y-3">{conflicts.map((conflict) => <div key={conflict.id} className="rounded-lg border p-3"><p className="text-sm font-medium">{conflict.entity} · {conflict.entityId}</p><p className="my-2 text-xs text-gray-500">El mismo registro cambió en más de un dispositivo.</p><div className="flex gap-2"><Button size="sm" onClick={() => void client.resolveConflict(conflict.id, 'local')}>Conservar local</Button><Button size="sm" variant="outline" onClick={() => void client.resolveConflict(conflict.id, 'server')}>Aceptar servidor</Button></div></div>)}</div></Card>}</>}
        {section === 'security' && <><PasskeyManager /><Card className="p-5"><h2 className="mb-4 font-semibold">Sesiones</h2><div className="space-y-2">{sessions.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3"><Fingerprint className="h-5 w-5" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.userAgent ?? 'Navegador'}</p><p className="text-xs text-gray-500">{new Date(item.lastSeenAt).toLocaleString()} {item.current ? '· actual' : ''}</p></div>{!item.current && <Button size="sm" variant="outline" onClick={async () => { await apiRequest('/api/auth/sessions/' + item.id, { method: 'DELETE' }); await loadSecurity(); }}>Revocar</Button>}</div>)}</div><Button className="mt-4" variant="outline" onClick={async () => { await apiRequest('/api/auth/sessions', { method: 'DELETE' }); await loadSecurity(); }}>Cerrar las demás</Button></Card><Card className="p-5"><h2 className="mb-2 font-semibold">Tab5 vinculadas</h2><div className="mb-4 flex gap-2"><Input inputMode="numeric" maxLength={8} placeholder="Código de 8 dígitos" value={pairingCode} onChange={(event) => setPairingCode(event.target.value.replace(/\D/g, ''))} /><Button disabled={pairingCode.length !== 8} onClick={async () => { await apiRequest('/api/devices/pair', { method: 'POST', body: JSON.stringify({ code: pairingCode }) }); setPairingCode(''); await loadSecurity(); }}>Vincular</Button></div>{devices.map((device) => <div key={device.id} className="flex items-center gap-3 border-t py-3"><Monitor className="h-5 w-5" /><div className="flex-1"><p className="font-medium">{device.name}</p><p className="text-xs text-gray-500">{device.hardwareId} {device.firmwareVersion ? '· ' + device.firmwareVersion : ''}</p></div><Button size="sm" variant="danger" onClick={async () => { await apiRequest('/api/devices/' + device.id, { method: 'DELETE' }); await loadSecurity(); }}>Revocar</Button></div>)}</Card><Button variant="danger" onClick={() => void logout()}><LogOut className="h-4 w-4" />Cerrar sesión</Button></>}
      </div>
    </div>
  </div>;
}

function csvCell(value: string) { return '"' + value.replaceAll('"', '""') + '"'; }
function download(name: string, content: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
