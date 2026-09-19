import { User, Bell, Palette, Database, Shield, LogOut, Moon, Sun, Download, Upload, Key, Fingerprint, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Separator } from '@/components/ui/Separator';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { PasskeyManager } from '@/components/auth/PasskeyManager';
import { SyncStatusDetail } from '@/components/SyncStatusIndicator';
import { toastHelpers } from '@/components/ui/Toaster';

const settingsSections = [
  { id: 'profile', label: 'Perfil', icon: User },
  { id: 'notifications', label: 'Notificaciones', icon: Bell },
  { id: 'appearance', label: 'Apariencia', icon: Palette },
  { id: 'data', label: 'Datos y sincronización', icon: Database },
  { id: 'security', label: 'Seguridad', icon: Shield },
];

export function Settings() {
  const { user, updateUser, logout } = useAuthStore();
  const [activeSection, setActiveSection] = useState('profile');
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState({ email: true, push: true, daily: false });
  const [syncEnabled, setSyncEnabled] = useState(true);

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode !== null) {
      setDarkMode(savedDarkMode === 'true');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('darkMode', String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleExportJSON = () => {
    toastHelpers.info('Próximamente', 'Exportación JSON en desarrollo');
  };

  const handleExportCSV = () => {
    toastHelpers.info('Próximamente', 'Exportación CSV en desarrollo');
  };

  const handleImportData = () => {
    toastHelpers.info('Próximamente', 'Importación en desarrollo');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Configuración</h1>
        <p className="text-gray-500 dark:text-gray-400">Personaliza tu experiencia de Productivity Assistant.</p>
      </div>

      <div className="flex gap-6">
        <nav className="w-48 flex-shrink-0" aria-label="Secciones de configuración">
          <ul className="space-y-1">
            {settingsSections.map(section => (
              <li key={section.id}>
                <button
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    activeSection === section.id
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                  )}
                >
                  <section.icon className="h-5 w-5" />
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-1 space-y-6">
          {activeSection === 'profile' && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Perfil</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                    <User className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{user?.name || 'Usuario'}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email || 'email@example.com'}</p>
                  </div>
                </div>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="name">Nombre</Label>
                    <Input id="name" defaultValue={user?.name || ''} onChange={e => updateUser({ name: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" defaultValue={user?.email || ''} disabled />
                  </div>
                </div>
                <Button onClick={() => toastHelpers.success('Guardado', 'Perfil actualizado correctamente')}>Guardar cambios</Button>
              </div>
            </Card>
          )}

          {activeSection === 'notifications' && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Notificaciones</h2>
              <div className="space-y-4">
                {[
                  { id: 'email', label: 'Notificaciones por email', description: 'Recibir resúmenes y alertas por correo' },
                  { id: 'push', label: 'Notificaciones push', description: 'Recibir alertas en el navegador' },
                  { id: 'daily', label: 'Resumen diario', description: 'Recibir reporte de actividad cada mañana' },
                ].map(item => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{item.label}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{item.description}</p>
                    </div>
                    <Switch
                      checked={notifications[item.id as keyof typeof notifications]}
                      onCheckedChange={checked => setNotifications(prev => ({ ...prev, [item.id]: checked }))}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeSection === 'appearance' && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Apariencia</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">Modo oscuro</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Cambia entre tema claro y oscuro</p>
                  </div>
                  <Switch checked={darkMode} onCheckedChange={setDarkMode} />
                </div>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-3">
                  {['blue', 'green', 'purple', 'orange', 'red', 'pink'].map(color => (
                    <button
                      key={color}
                      className={cn(
                        'h-10 w-10 rounded-lg border-2 transition-colors',
                        `bg-${color}-500`,
                        darkMode ? 'border-gray-700' : 'border-gray-200'
                      )}
                    />
                  ))}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Color principal (próximamente)</p>
              </div>
            </Card>
          )}

          {activeSection === 'data' && (
            <div className="space-y-6">
              <Card>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Sincronización</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">Sincronización automática</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Sincronizar cambios automáticamente con la nube (ElectricSQL)</p>
                    </div>
                    <Switch checked={syncEnabled} onCheckedChange={setSyncEnabled} />
                  </div>
                  <Separator />
                  <SyncStatusDetail />
                </div>
              </Card>

              <Card>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Backup y Exportación</h2>
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={handleExportJSON}>
                      <Download className="h-4 w-4 mr-2" /> Exportar JSON
                    </Button>
                    <Button variant="outline" onClick={handleExportCSV}>
                      <Download className="h-4 w-4 mr-2" /> Exportar CSV
                    </Button>
                    <Button variant="outline" onClick={handleImportData}>
                      <Upload className="h-4 w-4 mr-2" /> Importar
                    </Button>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Los backups automáticos se guardan diariamente en Cloudflare R2.
                  </p>
                </div>
              </Card>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="space-y-6">
              <PasskeyManager />
              
              <Card>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Sesiones activas</h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                        <Fingerprint className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">Sesión actual</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Este navegador · Activa ahora</p>
                      </div>
                    </div>
                    <span className="badge badge-success">Actual</span>
                  </div>
                </div>
                <Separator />
                <Button variant="danger" onClick={logout}>
                  <LogOut className="h-4 w-4 mr-2" /> Cerrar sesión en todos los dispositivos
                </Button>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}