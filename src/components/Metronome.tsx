import { useEffect, useRef, useState } from 'react';

interface Props {
  bpm: number;
  beats: number;
  /** Changing this restarts the count so bar 1 lines up with a new song. */
  resetKey: string | number;
}

const FLASH_MS = 110;

/**
 * Silent visual metronome. Timing is derived from performance.now() each frame,
 * so it doesn't drift; React only re-renders when the lit beat changes.
 * Tap it to restart the count on beat 1.
 */
export function Metronome({ bpm, beats, resetKey }: Props) {
  const startRef = useRef(performance.now());
  const [state, setState] = useState({ beat: 0, on: true });

  useEffect(() => {
    startRef.current = performance.now();
  }, [resetKey, bpm, beats]);

  useEffect(() => {
    let frame = 0;
    const interval = 60000 / bpm;
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const beat = Math.floor(elapsed / interval) % beats;
      const on = elapsed % interval < FLASH_MS;
      setState((prev) => (prev.beat === beat && prev.on === on ? prev : { beat, on }));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [bpm, beats]);

  return (
    <button
      type="button"
      className="metronome"
      title="Tap to restart on beat 1"
      onClick={(e) => {
        e.stopPropagation();
        startRef.current = performance.now();
      }}
    >
      <span className="metronome-dots">
        {Array.from({ length: beats }, (_, i) => (
          <span
            key={i}
            className={[
              'metronome-dot',
              i === 0 ? 'accent' : '',
              i === state.beat ? 'current' : '',
              i === state.beat && state.on ? 'flash' : '',
            ].join(' ')}
          />
        ))}
      </span>
      <span className="metronome-bpm">{bpm}</span>
    </button>
  );
}
