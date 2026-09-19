import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { electricClient } from '../lib/electric';

export function useBackgroundSync() {
  const { isAuthenticated, token } = useAuthStore();
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingMutationsRef = useRef<Array<{ type: string; data: any }>>([]);

  // Register for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (pendingMutationsRef.current.length > 0) {
        setPendingSync(true);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Queue mutations when offline
  const queueMutation = useCallback((mutation: { type: string; data: any }) => {
    if (!isOnline) {
      pendingMutationsRef.current.push({ ...mutation, timestamp: Date.now() });
      // Store in IndexedDB for persistence
      storePendingMutations(pendingMutationsRef.current);
    }
  }, []);

  // Process pending mutations when online
  const processPendingMutations = useCallback(async () => {
    if (!isOnline || pendingMutationsRef.current.length === 0) return;

    const mutations = [...pendingMutationsRef.current];
    pendingMutationsRef.current = [];

    for (const mutation of mutations) {
      try {
        // Retry the mutation
        await retryMutation(mutation);
      } catch (error) {
        console.error('Failed to retry mutation:', error);
        // Re-queue failed mutation
        pendingMutationsRef.current.unshift(mutation);
      }
    }

    // Update IndexedDB
    storePendingMutations(pendingMutationsRef.current);
  }, []);

  // Periodic sync
  useEffect(() => {
    if (!isOnline) return;

    syncIntervalRef.current = setInterval(() => {
      processPendingMutations();
    }, 30000); // Every 30 seconds

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isOnline, processPendingMutations]);

  return {
    isOnline,
    pendingSync,
    pendingCount: pendingMutationsRef.current.length,
    queueMutation,
    processPendingMutations,
  };
}

function storePendingMutations(mutations: any[]): void {
  try {
    localStorage.setItem('pendingMutations', JSON.stringify(mutations));
  } catch (error) {
    console.error('Failed to store pending mutations:', error);
  }
}

async function retryMutation(mutation: { type: string; data: any }): Promise<void> {
  // This would need to be implemented based on your API
  // For now, we'll just log
  console.log('Retrying mutation:', mutation);
}

// Hook for registering service worker background sync
export function useServiceWorkerSync() {
  const [swSupported, setSwSupported] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        setSwSupported(true);
        setSwRegistration(registration);
      });
    }
  }, []);

  const registerBackgroundSync = useCallback(async (tag: string) => {
    if (!swSupported || !swRegistration) return false;

    try {
      await swRegistration.sync.register(tag);
      return true;
    } catch (error) {
      console.error('Background sync registration failed:', error);
      return false;
    }
  }, [swSupported, swRegistration]);

  return { swSupported, swRegistration, registerBackgroundSync };
}