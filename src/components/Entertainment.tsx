import { useEffect, useRef, useState } from 'react';
import { Brain, Gamepad2, Link2, Timer, Worm } from 'lucide-react';
import { SnakeGame } from './SnakeGame';

type Tab = 'brainrot' | 'games';

/** Per-device memory for the panel's little settings. Failing storage just means defaults. */
function load(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/**
 * The split-screen side panel in show mode: brain rot video or a little game.
 * `onTimerHidden` lets a game hide the show timer while it runs.
 */
export function Entertainment({ onTimerHidden }: { onTimerHidden: (hidden: boolean) => void }) {
  const [tab, setTab] = useState<Tab>(() => (load('bar1.fun.tab', 'brainrot') === 'games' ? 'games' : 'brainrot'));
  const pick = (t: Tab) => {
    setTab(t);
    save('bar1.fun.tab', t);
  };

  // Leaving the games tab (or closing the panel) never leaves the timer hidden.
  useEffect(() => {
    if (tab !== 'games') onTimerHidden(false);
  }, [tab, onTimerHidden]);
  useEffect(() => () => onTimerHidden(false), [onTimerHidden]);

  return (
    <div className="fun">
      <div className="fun-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'brainrot'} className={tab === 'brainrot' ? 'on' : ''} onClick={() => pick('brainrot')}>
          <Brain size={15} /> Brain rot
        </button>
        <button role="tab" aria-selected={tab === 'games'} className={tab === 'games' ? 'on' : ''} onClick={() => pick('games')}>
          <Gamepad2 size={15} /> Games
        </button>
      </div>
      <div className="fun-body">{tab === 'brainrot' ? <BrainRot /> : <Games onTimerHidden={onTimerHidden} />}</div>
    </div>
  );
}

// ---------- Brain rot ----------

/** A long, muted Subway Surfers gameplay video (uploader marks it free to use). Swappable below. */
const DEFAULT_VIDEO = 'https://www.youtube.com/watch?v=OYqBLPc01Dg';

/** YouTube links (watch, youtu.be, shorts, embed) → video id. */
function youtubeId(url: string) {
  const m = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m?.[1] ?? null;
}

function BrainRot() {
  const [url, setUrl] = useState(() => load('bar1.fun.video', DEFAULT_VIDEO));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url);

  const id = youtubeId(url);
  const apply = () => {
    const next = draft.trim() || DEFAULT_VIDEO;
    setUrl(next);
    save('bar1.fun.video', next);
    setEditing(false);
  };

  return (
    <div className="brainrot">
      {id ? (
        <iframe
          key={id}
          className="brainrot-video"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&modestbranding=1&playsinline=1&rel=0`}
          title="Brain rot"
          allow="autoplay; encrypted-media; picture-in-picture"
        />
      ) : (
        <video key={url} className="brainrot-video" src={url} autoPlay muted loop playsInline />
      )}

      {editing ? (
        <form
          className="brainrot-link"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="YouTube or video link" autoFocus />
          <button className="btn small-btn primary">Use</button>
          <button
            type="button"
            className="btn small-btn ghost"
            onClick={() => {
              setDraft(DEFAULT_VIDEO);
            }}
          >
            Default
          </button>
        </form>
      ) : (
        <button type="button" className="btn ghost small-btn brainrot-change" onClick={() => setEditing(true)} title="Use another video">
          <Link2 size={13} /> Change video
        </button>
      )}
    </div>
  );
}

// ---------- Games ----------

const GAMES = [
  { id: 'minute', name: 'One minute', blurb: 'Count a minute in your head. How close can you get?', icon: Timer },
  { id: 'snake', name: 'Snake', blurb: 'Eat, grow, don’t bite yourself. W A S D or swipe.', icon: Worm },
] as const;
type GameId = (typeof GAMES)[number]['id'];

function Games({ onTimerHidden }: { onTimerHidden: (hidden: boolean) => void }) {
  const [game, setGame] = useState<GameId | null>(null);

  if (game === 'minute') return <OneMinute onBack={() => setGame(null)} onTimerHidden={onTimerHidden} />;
  if (game === 'snake') return <SnakeGame onBack={() => setGame(null)} />;

  return (
    <div className="game-list">
      {GAMES.map((g) => (
        <button key={g.id} type="button" className="game-card" onClick={() => setGame(g.id)}>
          <g.icon size={22} />
          <span>
            <strong>{g.name}</strong>
            <span className="muted small">{g.blurb}</span>
          </span>
        </button>
      ))}
      <p className="muted small">More games coming.</p>
    </div>
  );
}

/** Rate an attempt by how far off it was, in seconds. */
function verdict(off: number) {
  const a = Math.abs(off);
  if (a < 0.5) return 'Inhuman. Are you a click track?';
  if (a < 1.5) return 'Metronome brain!';
  if (a < 3) return 'Solid.';
  if (a < 6) return 'Close-ish.';
  if (a < 12) return 'Were you counting or vibing?';
  return 'Time is a social construct.';
}

function OneMinute({ onBack, onTimerHidden }: { onBack: () => void; onTimerHidden: (hidden: boolean) => void }) {
  const TARGET = 60;
  const startRef = useRef(0);
  const [phase, setPhase] = useState<'ready' | 'counting' | 'done'>('ready');
  const [result, setResult] = useState<number | null>(null);
  const [best, setBest] = useState<number | null>(() => {
    const v = Number(load('bar1.fun.minuteBest', ''));
    return Number.isFinite(v) && load('bar1.fun.minuteBest', '') !== '' ? v : null;
  });

  // No peeking at the show timer while counting.
  useEffect(() => {
    onTimerHidden(phase === 'counting');
  }, [phase, onTimerHidden]);

  const start = () => {
    startRef.current = performance.now();
    setResult(null);
    setPhase('counting');
  };
  const stop = () => {
    const seconds = (performance.now() - startRef.current) / 1000;
    setResult(seconds);
    setPhase('done');
    const off = Math.abs(seconds - TARGET);
    if (best === null || off < best) {
      setBest(off);
      save('bar1.fun.minuteBest', String(off));
    }
  };

  const off = result === null ? 0 : result - TARGET;
  return (
    <div className="minute-game">
      <button type="button" className="btn ghost small-btn game-back" onClick={onBack} disabled={phase === 'counting'}>
        ← Games
      </button>

      {phase === 'ready' && (
        <>
          <p className="minute-text">Press start, count to 60 in your head, then press stop.</p>
          <button type="button" className="btn primary minute-btn" onClick={start}>
            Start
          </button>
        </>
      )}

      {phase === 'counting' && (
        <>
          <p className="minute-text">Counting… press when you think a minute has passed.</p>
          <button type="button" className="btn primary minute-btn counting" onClick={stop}>
            Stop
          </button>
        </>
      )}

      {phase === 'done' && result !== null && (
        <>
          <div className="minute-result">{result.toFixed(1)} s</div>
          <p className={`minute-off ${Math.abs(off) < 1.5 ? 'good' : Math.abs(off) < 6 ? '' : 'bad'}`}>
            {Math.abs(off) < 0.05 ? 'Spot on!' : `${Math.abs(off).toFixed(1)} s too ${off < 0 ? 'early' : 'late'}`}
          </p>
          <p className="minute-text">{verdict(off)}</p>
          <button type="button" className="btn primary minute-btn" onClick={start}>
            Again
          </button>
        </>
      )}

      {best !== null && <p className="muted small">Best on this device: {best.toFixed(1)} s off</p>}
    </div>
  );
}
