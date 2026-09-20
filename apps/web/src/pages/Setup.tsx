import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Fingerprint, Loader2 } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { apiRequest } from '@/lib/api';
import { useAuthStore, type Owner } from '@/stores/authStore';

export function Setup() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const token = useMemo(() => new URLSearchParams(location.hash.slice(1)).get('token') ?? '', []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [codes, setCodes] = useState<string[]>([]);

  async function configure() {
    if (!token) return setError('El enlace no contiene un token de configuración.');
    setLoading(true);
    setError('');
    try {
      const start = await apiRequest<{ options: PublicKeyCredentialCreationOptionsJSON; ceremonyId: string }>('/api/auth/setup/passkey/options', {
        method: 'POST', body: JSON.stringify({ token }),
      });
      const response = await startRegistration(start.options);
      const result = await apiRequest<{ user: Owner; recoveryCodes: string[] }>('/api/auth/setup/passkey/verify', {
        method: 'POST', body: JSON.stringify({ token, response, ceremonyId: start.ceremonyId, name: 'Passkey principal' }),
      });
      login(result.user);
      setCodes(result.recoveryCodes);
      history.replaceState(null, '', '/setup');
    } catch (caught) {
      if ((caught as Error).name !== 'NotAllowedError') setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyCodes() { await navigator.clipboard.writeText(codes.join('\n')); }

  return <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
    <Card className="w-full max-w-lg p-6">
      {codes.length ? <div>
        <Check className="mb-3 h-10 w-10 text-green-600" />
        <h1 className="text-2xl font-bold">Cuenta preparada</h1>
        <p className="mt-2 text-sm text-gray-500">Guarda estos códigos ahora. No volverán a mostrarse.</p>
        <pre className="my-5 whitespace-pre-wrap rounded-lg bg-gray-100 p-4 text-sm dark:bg-gray-800">{codes.join('\n')}</pre>
        <div className="flex gap-3"><Button variant="outline" onClick={copyCodes}><Copy className="mr-2 h-4 w-4" />Copiar</Button><Button onClick={() => navigate('/dashboard', { replace: true })}>Continuar</Button></div>
      </div> : <div className="text-center">
        <Fingerprint className="mx-auto mb-4 h-16 w-16 text-primary-600" />
        <h1 className="text-2xl font-bold">Configurar propietario</h1>
        <p className="my-4 text-gray-500">Crea la passkey que usarás para entrar. El enlace se invalidará después.</p>
        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Button className="w-full" onClick={configure} disabled={loading || !token}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear passkey</Button>
      </div>}
    </Card>
  </div>;
}
