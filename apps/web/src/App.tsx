import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/Toaster';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useAuthStore } from '@/stores/authStore';

const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Tasks = lazy(() => import('@/pages/Tasks').then(m => ({ default: m.Tasks })));
const Timer = lazy(() => import('@/pages/Timer').then(m => ({ default: m.Timer })));
const Reports = lazy(() => import('@/pages/Reports').then(m => ({ default: m.Reports })));
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })));
const Login = lazy(() => import('@/pages/Login').then(m => ({ default: m.Login })));
const Setup = lazy(() => import('@/pages/Setup').then(m => ({ default: m.Setup })));
const Recovery = lazy(() => import('@/pages/Recovery').then(m => ({ default: m.Recovery })));

function ProtectedRoute() {
  const { isAuthenticated, status, user } = useAuthStore();
  const location = useLocation();
  if (status === 'loading') return <LoadingScreen />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (user?.recoveryRequired && location.pathname !== '/settings') return <Navigate to="/settings?section=security" replace />;

  return <Outlet />;
}

function PublicRoute() {
  const { isAuthenticated, status } = useAuthStore();

  if (status === 'loading') return <LoadingScreen />;

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function App() {
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  return (
    <BrowserRouter>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <Suspense fallback={<LoadingScreen />}>
<Routes>
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<Login />} />
              <Route path="/recovery" element={<Recovery />} />
            </Route>
            <Route path="/setup" element={<Setup />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/timer" element={<Timer />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </Suspense>
          <Toaster />
        </div>
    </BrowserRouter>
  );
}

export default App;
