import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { apiRequest } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export function Recovery() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const navigate = useNavigate();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiRequest('/api/auth/recovery', { method: 'POST', body: JSON.stringify({ code }) });
      await bootstrap();
      navigate('/settings?section=security', { replace: true });
    } catch (caught) { setError((caught as Error).message); }
    finally { setLoading(false); }
  }

  return <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
    <Card className="w-full max-w-md p-6">
      <KeyRound className="mb-4 h-10 w-10 text-primary-600" />
      <h1 className="text-2xl font-bold">Recuperar acceso</h1>
      <p className="mt-2 text-sm text-gray-500">El código se consumirá y tendrás 15 minutos para registrar una passkey nueva.</p>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div><Label htmlFor="code">Código de recuperación</Label><Input id="code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} autoComplete="one-time-code" /></div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" disabled={loading || code.length < 16}>{loading ? 'Verificando…' : 'Continuar'}</Button>
      </form>
      <Link to="/login" className="mt-5 inline-block text-sm text-primary-600">Volver al acceso</Link>
    </Card>
  </div>;
}
