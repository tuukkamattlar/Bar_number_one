import { useState } from 'react';

/** The instrument this device plays. Kept per browser, not per gig, so one setlist serves the whole band. */
const STORAGE_KEY = 'bar1.myInstrument';

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
}

export function useMyInstrument() {
  const [id, setId] = useState(getMyInstrument);
  const set = (next: number | null) => {
    setMyInstrument(next);
    setId(next);
  };
  return [id, set] as const;
}
