import { useEffect, useState } from 'react';
import { Copy, Fingerprint, KeyRound, Plus, Trash2 } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/types';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { toastHelpers } from '@/components/ui/Toaster';
import { useAuthStore } from '@/stores/authStore';

interface PasskeyItem { id: string; name: string; createdAt: string; lastUsedAt?: string; backedUp: boolean; }

export function PasskeyManager() {
  const [items, setItems] = useState<PasskeyItem[]>([]);
  const [name, setName] = useState('Mi passkey');
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const recoveryRequired = useAuthStore((state) => state.user?.recoveryRequired);

  async function load() { setItems(await apiRequest<PasskeyItem[]>('/api/auth/passkeys')); }
  useEffect(() => { void load(); }, []);

  async function add() {
    setBusy(true);
    try {
      const start = await apiRequest<{ options: PublicKeyCredentialCreationOptionsJSON; ceremonyId: string }>('/api/auth/passkeys/options', { method: 'POST' });
      const response = await startRegistration(start.options);
      const result = await apiRequest<{ recoveryCodes?: string[] }>('/api/auth/passkeys/verify', { method: 'POST', body: JSON.stringify({ response, ceremonyId: start.ceremonyId, name }) });
      if (result.recoveryCodes) setCodes(result.recoveryCodes);
      await Promise.all([load(), bootstrap()]);
      toastHelpers.success('Passkey registrada');
    } catch (error) {
      if ((error as Error).name !== 'NotAllowedError') toastHelpers.error('No se pudo registrar', (error as Error).message);
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    await apiRequest('/api/auth/passkeys/' + id, { method: 'DELETE' });
    await load();
  }

  async function rotate() {
    if (!confirm('Los códigos anteriores dejarán de funcionar. ¿Continuar?')) return;
    const result = await apiRequest<{ recoveryCodes: string[] }>('/api/auth/recovery-codes/rotate', { method: 'POST' });
    setCodes(result.recoveryCodes);
  }

  return <Card className="p-5">
    <div className="mb-4"><h2 className="text-lg font-semibold">Passkeys y recuperación</h2><p className="text-sm text-gray-500">Puedes registrar más de un dispositivo y revocarlo por separado.</p></div>
    {recoveryRequired && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Registra una passkey nueva para terminar la recuperación. Al hacerlo recibirás códigos nuevos.</p>}
    <div className="space-y-2">{items.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3"><Fingerprint className="h-5 w-5 text-primary-600" /><div className="flex-1"><p className="font-medium">{item.name}</p><p className="text-xs text-gray-500">Creada {new Date(item.createdAt).toLocaleDateString()} {item.lastUsedAt ? '· último uso ' + new Date(item.lastUsedAt).toLocaleDateString() : ''}</p></div><Button size="icon" variant="ghost" onClick={() => void remove(item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div>)}</div>
    <div className="mt-4 flex gap-2"><Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Nombre de la passkey" /><Button onClick={add} disabled={busy}><Plus className="h-4 w-4" />Agregar</Button></div>
    <Button className="mt-4" variant="outline" onClick={rotate}><KeyRound className="h-4 w-4" />Rotar códigos</Button>
    {codes.length > 0 && <div className="mt-4 rounded-lg bg-gray-100 p-4 dark:bg-gray-900"><p className="mb-2 text-sm font-medium">Guárdalos ahora; solo se muestran una vez.</p><pre className="whitespace-pre-wrap text-xs">{codes.join('\n')}</pre><Button className="mt-3" size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(codes.join('\n'))}><Copy className="h-4 w-4" />Copiar</Button></div>}
  </Card>;
}
