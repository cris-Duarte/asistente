import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Timer, Mail, Lock, Fingerprint, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useAuthStore } from '@/stores/authStore';
import { toastHelpers } from '@/components/ui/Toaster';

export function Login() {
  const navigate = useNavigate();
  const login = useAuthStore(state => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [method, setMethod] = useState<'email' | 'passkey'>('email');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (method === 'email') {
        // TODO: Implementar login con email/password o magic link
        await new Promise(r => setTimeout(r, 1000));
        login({ id: '1', email, name: 'Cristhian' }, 'mock-jwt-token');
      } else {
        // TODO: Implementar WebAuthn/Passkey
        await new Promise(r => setTimeout(r, 1000));
        login({ id: '1', email: 'passkey-user@example.com', name: 'Passkey User' }, 'mock-jwt-token');
      }
      toastHelpers.success('Bienvenido', 'Has iniciado sesión correctamente');
      navigate('/dashboard');
    } catch (err) {
      setError('Error al iniciar sesión. Intenta de nuevo.');
      toastHelpers.error('Error', 'No se pudo iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 font-semibold text-primary-600 dark:text-primary-400 mb-6">
            <div className="h-10 w-10 rounded-lg bg-primary-600 flex items-center justify-center">
              <Timer className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl">Productivity</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Iniciar sesión</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Accede a tu asistente de productividad personal</p>
        </div>

        <Card className="p-6">
          <div className="mb-6">
            <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              {['email', 'passkey'].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors',
                    method === m
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  )}
                >
                  {m === 'email' ? (
                    <>
                      <Mail className="h-4 w-4 mr-2 inline" />
                      Email
                    </>
                  ) : (
                    <>
                      <Fingerprint className="h-4 w-4 mr-2 inline" />
                      Passkey
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {method === 'email' && (
              <>
                <div>
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    autoComplete="email"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </>
            )}

            {method === 'passkey' && (
              <div className="text-center py-8">
                <Fingerprint className="h-16 w-16 mx-auto text-primary-600 dark:text-primary-400 mb-4" />
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Toca el sensor de huella o usa Face ID / Windows Hello para iniciar sesión
                </p>
                <Button type="button" onClick={handleSubmit} className="w-full" disabled={isLoading}>
                  {isLoading ? 'Autenticando...' : 'Usar Passkey'}
                </Button>
              </div>
            )}

            {method === 'email' && (
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
              </Button>
            )}
          </form>

          <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            <p>¿No tienes cuenta? <Link to="/register" className="text-primary-600 hover:underline">Regístrate</Link></p>
            <p className="mt-2"><Link to="/forgot-password" className="text-primary-600 hover:underline">¿Olvidaste tu contraseña?</Link></p>
          </div>
        </Card>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          Productivity Assistant v0.1.0 - Single user mode
        </p>
      </div>
    </div>
  );
}