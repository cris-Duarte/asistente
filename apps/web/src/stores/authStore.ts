import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  setToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) => {
        set({ user, token, isAuthenticated: true });
        // Also set cookie for middleware
        document.cookie = `access_token=${token}; path=/; max-age=${15 * 60}; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
      },
      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
        document.cookie = 'access_token=; path=/; max-age=0; SameSite=Strict';
      },
      updateUser: (userData) => set(state => ({ user: state.user ? { ...state.user, ...userData } : null })),
      setToken: (token) => {
        set({ token, isAuthenticated: !!token });
        if (token) {
          document.cookie = `access_token=${token}; path=/; max-age=${15 * 60}; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
        } else {
          document.cookie = 'access_token=; path=/; max-age=0; SameSite=Strict';
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Initialize token from cookie on client side
if (typeof window !== 'undefined') {
  const cookies = document.cookie.split('; ').reduce((acc, cookie) => {
    const [key, value] = cookie.split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  if (cookies.access_token && !useAuthStore.getState().token) {
    useAuthStore.getState().setToken(cookies.access_token);
  }
}