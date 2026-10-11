import type { SingerMode } from '../lib/singers';

/** AND / OR switch at the end of the singer chips: picked singers must all sing, or any of them. Tap to flip. */
export function SingerModeToggle({ mode, onChange }: { mode: SingerMode; onChange: (mode: SingerMode) => void }) {
  const and = mode === 'all';
  return (
    <button
      type="button"
      className="mode-toggle"
      onClick={() => onChange(and ? 'any' : 'all')}
      title={and ? 'AND: songs where all picked singers sing. Tap for OR.' : 'OR: songs where any picked singer sings. Tap for AND.'}
      aria-label={and ? 'Picked singers: AND (all must sing). Tap for OR.' : 'Picked singers: OR (any of them). Tap for AND.'}
    >
      <span className={and ? 'on' : ''}>AND</span>
      <span aria-hidden>/</span>
      <span className={and ? '' : 'on'}>OR</span>
    </button>
  );
}
