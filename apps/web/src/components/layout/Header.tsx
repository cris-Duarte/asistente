import { ChevronDown, LogOut, Moon, Sun, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator';

export function Header() {
  const [dark, setDark] = useState(localStorage.getItem('darkMode') === 'true');
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuthStore();
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('darkMode', String(dark)); }, [dark]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return <header className="flex h-16 items-center justify-end gap-2 border-b border-gray-200 bg-white px-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
    <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => setDark(!dark)} aria-label={dark ? 'Modo claro' : 'Modo oscuro'}>{dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
    <SyncStatusIndicator />
    <div className="relative" ref={menuRef}><button className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => setMenu(!menu)}><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700"><User className="h-5 w-5" /></span><ChevronDown className="h-4 w-4" /></button>{menu && <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border bg-white py-2 shadow-lg dark:border-gray-700 dark:bg-gray-800"><div className="border-b px-4 py-2 dark:border-gray-700"><p className="font-medium">{user?.name}</p><p className="truncate text-xs text-gray-500">{user?.email}</p></div><button className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => void logout()}><LogOut className="h-4 w-4" />Cerrar sesión</button></div>}</div>
  </header>;
}
