import { useSyncExternalStore } from 'react';

/**
 * The instrument this device plays. Kept per browser, not per gig, so one setlist serves
 * the whole band. Every page reads it live, so changing it in the top bar updates them all.
 */
const STORAGE_KEY = 'bar1.myInstrument';
const listeners = new Set<() => void>();

export function getMyInstrument(): number | null {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function setMyInstrument(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // Private mode or blocked storage: the choice just won't stick.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  // Another tab changed it.
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && notify();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener('storage', onStorage);
  };
}

export function useMyInstrument() {
  const id = useSyncExternalStore(subscribe, getMyInstrument);
  return [id, setMyInstrument] as const;
}
