import { create } from 'zustand';
import { ApiError, apiRequest } from '@/lib/api';

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

const OWNER_CACHE_KEY = 'productivity-owner';

function cachedOwner(): Owner | null {
  try {
    const value = localStorage.getItem(OWNER_CACHE_KEY);
    return value ? JSON.parse(value) as Owner : null;
  } catch {
    return null;
  }
}

function cacheOwner(user: Owner | null): void {
  if (user) localStorage.setItem(OWNER_CACHE_KEY, JSON.stringify(user));
  else localStorage.removeItem(OWNER_CACHE_KEY);
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  isAuthenticated: false,
  bootstrap: async () => {
    try {
      const user = await apiRequest<Owner>('/api/auth/me');
      cacheOwner(user);
      set({ user, status: 'authenticated', isAuthenticated: true });
    } catch (error) {
      const cached = !(error instanceof ApiError && error.status === 401) ? cachedOwner() : null;
      if (cached) set({ user: cached, status: 'authenticated', isAuthenticated: true });
      else {
        cacheOwner(null);
        set({ user: null, status: 'anonymous', isAuthenticated: false });
      }
    }
  },
  login: (user) => {
    cacheOwner(user);
    set({ user, status: 'authenticated', isAuthenticated: true });
  },
  logout: async () => {
    try { await apiRequest('/api/auth/logout', { method: 'POST' }); }
    finally {
      cacheOwner(null);
      set({ user: null, status: 'anonymous', isAuthenticated: false });
    }
  },
  updateUser: (partial) => set((state) => {
    const user = state.user ? { ...state.user, ...partial } : null;
    cacheOwner(user);
    return { user };
  }),
}));
