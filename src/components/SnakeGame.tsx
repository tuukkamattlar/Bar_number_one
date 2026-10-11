import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';

const GRID = 16; // cells per side
const CELL = 20; // canvas pixels per cell
const BEST_KEY = 'bar1.fun.snakeBest';

type Point = { x: number; y: number };
type Dir = 'up' | 'down' | 'left' | 'right';

const STEP: Record<Dir, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
// W A S D only: in show mode the arrow keys (and page-turn pedals) must keep turning pages.
const KEYS: Record<string, Dir> = { w: 'up', a: 'left', s: 'down', d: 'right' };

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function randomFood(snake: Point[]): Point {
  const free: Point[] = [];
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) if (!snake.some((p) => p.x === x && p.y === y)) free.push({ x, y });
  return free[Math.floor(Math.random() * free.length)] ?? { x: 0, y: 0 };
}

const startSnake = (): Point[] => [
  { x: 5, y: 8 },
  { x: 4, y: 8 },
  { x: 3, y: 8 },
];

/** Classic snake: eat, grow, don't hit the walls or yourself. Speeds up as you grow. */
export function SnakeGame({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snake = useRef<Point[]>(startSnake());
  const food = useRef<Point>(randomFood(snake.current));
  const dir = useRef<Dir>('right');
  const queued = useRef<Dir[]>([]); // turns pressed between ticks, applied one per tick
  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  // The key handler reads this, so a turn pressed right after Start isn't lost.
  const playing = useRef(false);
  playing.current = phase === 'playing';
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(loadBest);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const css = getComputedStyle(document.documentElement);
    ctx.fillStyle = '#101217';
    ctx.fillRect(0, 0, GRID * CELL, GRID * CELL);
    // Faint checkerboard so the grid is readable.
    ctx.fillStyle = '#14171d';
    for (let y = 0; y < GRID; y++) for (let x = (y % 2); x < GRID; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    ctx.fillStyle = css.getPropertyValue('--danger').trim() || '#f06a6a';
    ctx.beginPath();
    ctx.arc(food.current.x * CELL + CELL / 2, food.current.y * CELL + CELL / 2, CELL * 0.36, 0, Math.PI * 2);
    ctx.fill();
    snake.current.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? css.getPropertyValue('--accent').trim() || '#f5b544' : '#c99436';
      ctx.fillRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2);
    });
  }, []);

  const turn = useCallback((next: Dir) => {
    const last = queued.current[queued.current.length - 1] ?? dir.current;
    if (next !== last && next !== OPPOSITE[last] && queued.current.length < 3) queued.current.push(next);
  }, []);

  const start = () => {
    snake.current = startSnake();
    food.current = randomFood(snake.current);
    dir.current = 'right';
    queued.current = [];
    playing.current = true;
    setScore(0);
    setPhase('playing');
  };

  // Game loop: one step per tick, a little faster for every bite.
  useEffect(() => {
    if (phase !== 'playing') return;
    let timer = 0;
    const tick = () => {
      dir.current = queued.current.shift() ?? dir.current;
      const head = snake.current[0];
      const next = { x: head.x + STEP[dir.current].x, y: head.y + STEP[dir.current].y };
      const eats = next.x === food.current.x && next.y === food.current.y;
      const body = eats ? snake.current : snake.current.slice(0, -1);
      const dead =
        next.x < 0 || next.y < 0 || next.x >= GRID || next.y >= GRID || body.some((p) => p.x === next.x && p.y === next.y);
      if (dead) {
        setPhase('over');
        return;
      }
      snake.current = [next, ...body];
      if (eats) {
        food.current = randomFood(snake.current);
        setScore((s) => s + 1);
      }
      draw();
      timer = window.setTimeout(tick, Math.max(70, 150 - (snake.current.length - 3) * 4));
    };
    timer = window.setTimeout(tick, 150);
    return () => clearTimeout(timer);
  }, [phase, draw]);

  // Save the best score when a game ends.
  useEffect(() => {
    if (phase !== 'over' || score <= best) return;
    setBest(score);
    try {
      localStorage.setItem(BEST_KEY, String(score));
    } catch {
      // ignore
    }
  }, [phase, score, best]);

  useEffect(draw, [draw, phase]);

  // W A S D steering (arrows are left alone for page turning).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
      const d = KEYS[e.key.toLowerCase()];
      if (!d || !playing.current) return;
      e.preventDefault();
      turn(d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn]);

  // Swipe on the board (phones and tablets).
  const swipeFrom = useRef<Point | null>(null);

  return (
    <div className="snake-game">
      <div className="snake-top">
        <button type="button" className="btn ghost small-btn" onClick={onBack}>
          ← Games
        </button>
        <span className="snake-score">
          Score <strong>{score}</strong>
        </span>
        <span className="muted small">Best {best}</span>
      </div>

      <div className="snake-board">
        <canvas
          ref={canvasRef}
          width={GRID * CELL}
          height={GRID * CELL}
          className="snake-canvas"
          onPointerDown={(e) => (swipeFrom.current = { x: e.clientX, y: e.clientY })}
          onPointerUp={(e) => {
            const from = swipeFrom.current;
            swipeFrom.current = null;
            if (!from) return;
            const dx = e.clientX - from.x;
            const dy = e.clientY - from.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
            turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
          }}
        />
        {phase !== 'playing' && (
          <div className="snake-overlay">
            {phase === 'over' && <p className="snake-over">Game over · {score}</p>}
            <button type="button" className="btn primary" onClick={start}>
              {phase === 'over' ? 'Again' : 'Start'}
            </button>
            <p className="muted small">W A S D, swipe, or the buttons below</p>
          </div>
        )}
      </div>

      <div className="snake-pad" aria-label="Steer the snake">
        <button type="button" className="btn ghost icon up" onClick={() => turn('up')} aria-label="Up">
          <ArrowUp size={18} />
        </button>
        <button type="button" className="btn ghost icon left" onClick={() => turn('left')} aria-label="Left">
          <ArrowLeft size={18} />
        </button>
        <button type="button" className="btn ghost icon down" onClick={() => turn('down')} aria-label="Down">
          <ArrowDown size={18} />
        </button>
        <button type="button" className="btn ghost icon right" onClick={() => turn('right')} aria-label="Right">
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
