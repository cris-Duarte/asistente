import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Timer, Mail, Lock, Fingerprint, AlertCircle, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useAuthStore } from '@/stores/authStore';
import { toastHelpers } from '@/components/ui/Toaster';
import { cn } from '@/lib/utils';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

export function Login() {
  const navigate = useNavigate();
  const login = useAuthStore(state => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [method, setMethod] = useState<'email' | 'passkey'>('passkey');

  const registerPasskey = async () => {
    setError('');
    setIsLoading(true);
    try {
      // Start registration
      const regResponse = await fetch(`${API_URL}/api/auth/passkey/registration/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const regData = await regResponse.json();
      if (!regData.success) throw new Error(regData.error?.message || 'Failed to start registration');

      // Browser WebAuthn registration
      const credential = await startRegistration(regData.data);

      // Complete registration
      const finishResponse = await fetch(`${API_URL}/api/auth/passkey/registration/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, response: credential }),
      });
      const finishData = await finishResponse.json();
      if (!finishData.success) throw new Error(finishData.error?.message || 'Registration failed');

      login({ id: finishData.data.userId, email, name: email.split('@')[0] }, finishData.data.accessToken);
      toastHelpers.success('Bienvenido', 'Cuenta creada y passkey registrada');
      navigate('/dashboard');
    } catch (err) {
      if ((err as Error).name !== 'AbortError' && (err as Error).name !== 'NotAllowedError') {
        setError('Error al registrar passkey. Intenta de nuevo.');
        toastHelpers.error('Error', (err as Error).message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const authenticatePasskey = async () => {
    setError('');
    setIsLoading(true);
    try {
      // Start authentication
      const authResponse = await fetch(`${API_URL}/api/auth/passkey/authentication/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const authData = await authResponse.json();
      if (!authData.success) throw new Error(authData.error?.message || 'Failed to start authentication');

      // Browser WebAuthn authentication
      const assertion = await startAuthentication(authData.data);

      // Complete authentication
      const finishResponse = await fetch(`${API_URL}/api/auth/passkey/authentication/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, response: assertion }),
      });
      const finishData = await finishResponse.json();
      if (!finishData.success) throw new Error(finishData.error?.message || 'Authentication failed');

      login({ id: finishData.data.userId, email, name: email.split('@')[0] }, finishData.data.accessToken);
      toastHelpers.success('Bienvenido', 'Has iniciado sesión correctamente');
      navigate('/dashboard');
    } catch (err) {
      if ((err as Error).name !== 'AbortError' && (err as Error).name !== 'NotAllowedError') {
        setError('Error al autenticar. Intenta de nuevo.');
        toastHelpers.error('Error', (err as Error).message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Magic link or password login
      const response = await fetch(`${API_URL}/api/auth/email/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error?.message || 'Login failed');

      login({ id: data.data.userId, email, name: email.split('@')[0] }, data.data.accessToken);
      toastHelpers.success('Bienvenido', 'Has iniciado sesión correctamente');
      navigate('/dashboard');
    } catch (err) {
      setError('Credenciales inválidas. Intenta de nuevo.');
      toastHelpers.error('Error', (err as Error).message);
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
                  onClick={() => { setMethod(m); setError(''); }}
                  className={cn(
                    'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors',
                    method === m
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  )}
                >
                  {m === 'email' ? (
                    <> <Mail className="h-4 w-4 mr-2 inline" /> Email </>
                  ) : (
                    <> <Fingerprint className="h-4 w-4 mr-2 inline" /> Passkey </>
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

          <form onSubmit={method === 'email' ? handleEmailLogin : (e => { e.preventDefault(); authenticatePasskey(); })} className="space-y-4">
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
                disabled={isLoading}
              />
            </div>

            {method === 'email' && (
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
                  disabled={isLoading}
                />
              </div>
            )}

            {method === 'passkey' && (
              <div className="text-center py-8">
                <Fingerprint className="h-16 w-16 mx-auto text-primary-600 dark:text-primary-400 mb-4" />
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {email ? (
                    <>Usa tu passkey para iniciar sesión como <strong>{email}</strong></>
                  ) : (
                    'Ingresa tu email y usa Face ID, Touch ID, Windows Hello o llave de seguridad'
                  )}
                </p>
                <Button type="submit" className="w-full" disabled={isLoading || !email}>
                  {isLoading ? (
                    <> <Loader2 className="h-4 w-4 animate-spin mr-2" /> Autenticando... </>
                  ) : (
                    <> <Fingerprint className="h-4 w-4 mr-2" /> {email ? 'Iniciar sesión' : 'Continuar con Passkey'} </>
                  )}
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
            <p>¿No tienes cuenta? <Link to="/register" className="text-primary-600 hover:underline">Regístrate con Passkey</Link></p>
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