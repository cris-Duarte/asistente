import { useState } from 'react';
import { Fingerprint, Key, Trash2, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { toastHelpers } from '@/components/ui/Toaster';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

export function PasskeyManager() {
  const { user, token, updateUser } = useAuthStore();
  const [hasPasskey, setHasPasskey] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [passkeyName, setPasskeyName] = useState('');

  const checkPasskeyStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setHasPasskey(data.data.hasPasskey);
      }
    } catch (error) {
      console.error('Error checking passkey status:', error);
    }
  };

  const registerPasskey = async () => {
    if (!user) return;
    setIsRegistering(true);
    try {
      // Start registration
      const regResponse = await fetch(`${API_URL}/api/auth/passkey/registration/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.id }),
      });
      const regData = await regResponse.json();
      if (!regData.success) throw new Error(regData.error?.message || 'Failed to start registration');

      // Browser WebAuthn registration
      const credential = await startRegistration(regData.data);

      // Complete registration
      const finishResponse = await fetch(`${API_URL}/api/auth/passkey/registration/finish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.id, response: credential }),
      });
      const finishData = await finishResponse.json();
      if (!finishData.success) throw new Error(finishData.error?.message || 'Registration failed');

      setHasPasskey(true);
      updateUser({ hasPasskey: true });
      toastHelpers.success('Passkey registrada', 'Tu passkey ha sido configurada correctamente');
    } catch (error) {
      if ((error as Error).name !== 'AbortError' && (error as Error).name !== 'NotAllowedError') {
        toastHelpers.error('Error al registrar passkey', (error as Error).message);
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const authenticateWithPasskey = async () => {
    if (!user) return;
    setIsAuthenticating(true);
    try {
      const authResponse = await fetch(`${API_URL}/api/auth/passkey/authentication/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.id }),
      });
      const authData = await authResponse.json();
      if (!authData.success) throw new Error(authData.error?.message || 'Failed to start authentication');

      const assertion = await startAuthentication(authData.data);

      const finishResponse = await fetch(`${API_URL}/api/auth/passkey/authentication/finish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.id, response: assertion }),
      });
      const finishData = await finishResponse.json();
      if (!finishData.success) throw new Error(finishData.error?.message || 'Authentication failed');

      toastHelpers.success('Autenticación exitosa', 'Has iniciado sesión con passkey');
    } catch (error) {
      if ((error as Error).name !== 'AbortError' && (error as Error).name !== 'NotAllowedError') {
        toastHelpers.error('Error de autenticación', (error as Error).message);
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const deletePasskey = async () => {
    // TODO: Implement passkey deletion endpoint
    setHasPasskey(false);
    updateUser({ hasPasskey: false });
    toastHelpers.success('Passkey eliminada', 'La passkey ha sido eliminada');
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Passkeys (WebAuthn)</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Autenticación sin contraseña usando huella digital, Face ID, Windows Hello o llaves de seguridad
          </p>
        </div>
        <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium', hasPasskey ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300')}>
          {hasPasskey ? (
            <>
              <CheckCircle className="h-4 w-4" />
              Configurada
            </>
          ) : (
            <>
              <Key className="h-4 w-4" />
              No configurada
            </>
          )}
        </div>
      </div>

      {!hasPasskey ? (
        <div className="text-center py-8">
          <Fingerprint className="h-16 w-16 mx-auto text-primary-600 dark:text-primary-400 mb-4 opacity-50" />
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Las passkeys te permiten iniciar sesión de forma segura sin contraseñas, usando la autenticación biométrica de tu dispositivo
            (huella digital, Face ID, Windows Hello) o una llave de seguridad física.
          </p>
          <Button onClick={registerPasskey} disabled={isRegistering} className="w-full sm:w-auto" size="lg">
            {isRegistering ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Registrando...
              </>
            ) : (
              <>
                <Fingerprint className="h-4 w-4 mr-2" />
                Configurar Passkey
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                <Fingerprint className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Passkey principal</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{passkeyName || 'Dispositivo actual'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={authenticateWithPasskey} disabled={isAuthenticating}>
                {isAuthenticating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Fingerprint className="h-4 w-4 mr-1" />
                    Probar
                  </>
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={deletePasskey}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Puedes registrar múltiples passkeys en diferentes dispositivos desde la configuración de seguridad de tu navegador/sistema operativo.
          </p>
        </div>
      )}
    </Card>
  );
}