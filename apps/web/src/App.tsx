import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/Toaster';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Tasks = lazy(() => import('@/pages/Tasks').then(m => ({ default: m.Tasks })));
const Timer = lazy(() => import('@/pages/Timer').then(m => ({ default: m.Timer })));
const Reports = lazy(() => import('@/pages/Reports').then(m => ({ default: m.Reports })));
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })));
const Login = lazy(() => import('@/pages/Login').then(m => ({ default: m.Login })));

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <div className="flex h-screen overflow-hidden">
                  <Sidebar />
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <Header />
                    <main className="flex-1 overflow-y-auto p-4 md:p-6">
                      <Routes>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/tasks" element={<Tasks />} />
                        <Route path="/timer" element={<Timer />} />
                        <Route path="/reports" element={<Reports />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                      </Routes>
                    </main>
                  </div>
                </div>
              }
            />
          </Routes>
        </Suspense>
        <Toaster />
      </div>
    </BrowserRouter>
  );
}

export default App;