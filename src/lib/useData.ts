import { useCallback, useEffect, useState } from 'react';

/** Minimal fetch-on-mount hook with a manual reload and local setter for optimistic updates. */
export function useData<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => load().then(setData, (e: Error) => setError(e.message)), deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, setData, error, reload };
}
