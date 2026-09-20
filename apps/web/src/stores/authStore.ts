import { create } from 'zustand';
import { apiRequest } from '@/lib/api';

export interface Owner {
  id: string;
  email: string;
  name: string;
  timezone: string;
  preferences: Record<string, unknown>;
  passkeyCount?: number;
  recoveryRequired?: boolean;
}

interface AuthState {
  user: Owner | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  isAuthenticated: boolean;
  bootstrap: () => Promise<void>;
  login: (user: Owner) => void;
  logout: () => Promise<void>;
  updateUser: (user: Partial<Owner>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  isAuthenticated: false,
  bootstrap: async () => {
    try {
      const user = await apiRequest<Owner>('/api/auth/me');
      set({ user, status: 'authenticated', isAuthenticated: true });
    } catch {
      set({ user: null, status: 'anonymous', isAuthenticated: false });
    }
  },
  login: (user) => set({ user, status: 'authenticated', isAuthenticated: true }),
  logout: async () => {
    try { await apiRequest('/api/auth/logout', { method: 'POST' }); }
    finally { set({ user: null, status: 'anonymous', isAuthenticated: false }); }
  },
  updateUser: (partial) => set((state) => ({ user: state.user ? { ...state.user, ...partial } : null })),
}));
