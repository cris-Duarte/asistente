import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Fingerprint, Loader2, Timer } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { apiRequest } from '@/lib/api';
import { useAuthStore, type Owner } from '@/stores/authStore';

export function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function authenticate() {
    setLoading(true);
    setError('');
    try {
      const start = await apiRequest<{ options: PublicKeyCredentialRequestOptionsJSON; ceremonyId: string }>('/api/auth/passkey/options', { method: 'POST' });
      const response = await startAuthentication(start.options);
      const result = await apiRequest<{ user: Owner }>('/api/auth/passkey/verify', {
        method: 'POST', body: JSON.stringify({ response, ceremonyId: start.ceremonyId }),
      });
      login(result.user);
      navigate('/dashboard', { replace: true });
    } catch (caught) {
      if ((caught as Error).name !== 'NotAllowedError') setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mb-5 inline-flex items-center gap-2 text-xl font-semibold text-primary-600">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600"><Timer className="h-6 w-6 text-white" /></span>
          Productivity
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tu espacio personal</h1>
        <p className="mt-2 text-gray-500">Entra con la passkey guardada en este dispositivo.</p>
      </div>
      <Card className="p-6 text-center">
        <Fingerprint className="mx-auto mb-4 h-16 w-16 text-primary-600" />
        {error && <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-left text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        <Button className="w-full" size="lg" onClick={authenticate} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Fingerprint className="mr-2 h-4 w-4" />}
          {loading ? 'Verificando…' : 'Entrar con passkey'}
        </Button>
        <Link className="mt-5 inline-block text-sm text-primary-600 hover:underline" to="/recovery">Usar un código de recuperación</Link>
      </Card>
      <p className="mt-5 text-center text-xs text-gray-400">Sin contraseñas ni registro público.</p>
    </div>
  </div>;
}

export default Login;
