import { useEffect, useState } from 'react';

/** True while the media query matches, e.g. useMediaQuery('(max-width: 860px)'). */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Same breakpoint as the stylesheet's phone layout. */
export const PHONE = '(max-width: 860px)';
