import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Contrast,
  Gamepad2,
  Maximize,
  MessageSquarePlus,
  Mic,
  Minimize,
  Minus,
  PlayCircle,
  Plus,
  RectangleVertical,
  RotateCcw,
  StickyNote,
  Timer,
  X,
} from 'lucide-react';
import { api, type Gig, type Instrument, type Song, type StickyNote as Sticky } from '../api';
import { instrumentName, notesFor, singersFor, starterIdFor } from '../lib/parts';
import { buildSlides, loadPageCounts, urlsFor, type Slide } from '../lib/slides';
import { PdfPage } from '../components/PdfPage';
import { Metronome } from '../components/Metronome';
import { Entertainment } from '../components/Entertainment';
import { StickyLayer, type ActiveSticky } from '../components/StickyLayer';
import { InstrumentSelect } from '../components/InstrumentSelect';
import { getMyInstrument, setMyInstrument } from '../lib/myInstrument';

type Layout = 'auto' | 1 | 2;

const NEXT_KEYS = new Set([' ', 'ArrowRight', 'ArrowDown', 'PageDown', 'Enter']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']);

function loadSetting(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function saveSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the setting just won't stick.
  }
}

/** Dark pages (inverted colours) are display-only and remembered per device. */
const INVERT_KEY = 'bar1.invertPages';
function loadInvert() {
  try {
    return localStorage.getItem(INVERT_KEY) === '1';
  } catch {
    return false;
  }
}
function saveInvert(on: boolean) {
  try {
    localStorage.setItem(INVERT_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the setting just won't stick.
  }
}

/** Shown when a song has no sheet music for the chosen instrument. */
const NO_PART_LINES = [
  'Nuotti jäi kotiin',
  'Treeneissä tää meni',
  'Nuotti hukassa, basistin syy',
  'Kuuntele ja seuraa',
  'Soita sitä mitä muutkin',
  'Laskee neljään ja toivoo parasta',
];

function randomLine(except?: number) {
  let i;
  do i = Math.floor(Math.random() * NO_PART_LINES.length);
  while (i === except);
  return i;
}

/** Starts on a random line and swaps to a different one every 15 s. */
function NoPartLine() {
  const [line, setLine] = useState(() => randomLine());
  useEffect(() => {
    const t = setInterval(() => setLine((prev) => randomLine(prev)), 15_000);
    return () => clearInterval(t);
  }, []);
  return <span className="meme-text">{NO_PART_LINES[line]}</span>;
}

export function ShowPage() {
  const params = useParams();
  const gigId = Number(params.id);
  // /practice/:songId: a one-song "gig" for practising, no saved setlist involved.
  const practiceSongId = params.songId ? Number(params.songId) : null;
  const exitTo = practiceSongId ? '/practice' : `/gigs/${gigId}`;
  const navigate = useNavigate();

  const [gig, setGig] = useState<Gig | null>(null);
  const [songs, setSongs] = useState<Map<number, Song>>(new Map());
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [instrumentId, setInstrumentId] = useState<number | null>(null);
  const [layout, setLayout] = useState<Layout>('auto');
  const [landscape, setLandscape] = useState(() => window.innerWidth >= window.innerHeight);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [notesOn, setNotesOn] = useState(true);
  const [inverted, setInverted] = useState(loadInvert);
  const toggleInvert = useCallback(
    () =>
      setInverted((on) => {
        saveInvert(!on);
        return !on;
      }),
    [],
  );
  const [fullscreen, setFullscreen] = useState(false);
  // Entertainment split screen: off at the start of every show; its size is remembered per device.
  const [funOn, setFunOn] = useState(false);
  const [split, setSplit] = useState(() => {
    const v = Number(loadSetting('bar1.fun.split'));
    return v >= 0.25 && v <= 0.85 ? v : 0.6;
  });
  const [noPeeking, setNoPeeking] = useState(false);
  // Sticky notes on the sheets: shown in gigs, written only in practice ("add" mode).
  const [stickies, setStickies] = useState<Sticky[]>([]);
  const [addingNotes, setAddingNotes] = useState(false);
  const [activeSticky, setActiveSticky] = useState<ActiveSticky | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => saveSetting('bar1.fun.split', String(split)), [split]);

  const [pageCounts, setPageCounts] = useState<Map<string, number | Error> | null>(null);
  const [index, setIndex] = useState(0);
  // Live tempo tweaks per setlist position, for this show only (not saved to the song).
  const [tempoTweaks, setTempoTweaks] = useState<Map<number, number>>(new Map());
  // `?from=N` (setlist position) starts the show at that song.
  const [searchParams] = useSearchParams();
  const currentItem = useRef(Math.max(0, Number(searchParams.get('from')) || 0));

  // Load everything once.
  useEffect(() => {
    const loadGig =
      practiceSongId !== null
        ? Promise.resolve<Gig>({
            id: 0,
            name: 'Practice',
            date: null,
            instrument_id: null,
            song_count: 1,
            items: [{ kind: 'song', song_id: practiceSongId }],
          })
        : api.gig(gigId);
    api.stickyNotes().then(setStickies, () => setStickies([]));
    Promise.all([loadGig, api.songs(), api.instruments()]).then(
      ([g, s, i]) => {
        if (practiceSongId !== null && !s.some((song) => song.id === practiceSongId)) {
          setError('This song is no longer in the library.');
          return;
        }
        setGig(g);
        setSongs(new Map(s.map((song) => [song.id, song])));
        setInstruments(i);
        const inst = i.find((x) => x.id === getMyInstrument()) ?? null;
        setInstrumentId(inst?.id ?? null);
        setMetronomeOn(Boolean(inst?.metronome));
      },
      (e: Error) => setError(e.message),
    );
  }, [gigId, practiceSongId]);

  useEffect(() => {
    const onResize = () => setLandscape(window.innerWidth >= window.innerHeight);
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);

  const items = gig?.items ?? [];
  const instrument = instruments.find((i) => i.id === instrumentId) ?? null;
  const perView = layout === 'auto' ? (landscape ? 2 : 1) : layout;

  // Find out how many pages each needed PDF has (cached across instrument switches).
  const urls = useMemo(() => urlsFor(items, songs, instrumentId), [items, songs, instrumentId]);
  useEffect(() => {
    if (!gig) return;
    let cancelled = false;
    loadPageCounts(urls).then((counts) => !cancelled && setPageCounts(counts));
    return () => {
      cancelled = true;
    };
  }, [gig, urls]);

  const slides: Slide[] = useMemo(
    () =>
      pageCounts
        ? buildSlides(
            items,
            songs,
            instrumentId,
            instrument?.name ?? 'this instrument',
            pageCounts,
            perView,
            practiceSongId === null,
          )
        : [],
    [items, songs, instrumentId, instrument, pageCounts, perView, practiceSongId],
  );

  // When the slide list changes (instrument / layout switch), stay on the same song.
  useEffect(() => {
    if (!slides.length) return;
    const i = slides.findIndex((s) => s.item >= currentItem.current);
    setIndex(i === -1 ? slides.length - 1 : i);
  }, [slides]);

  const go = useCallback(
    (delta: number) =>
      setIndex((i) => {
        const next = Math.max(0, Math.min(slides.length - 1, i + delta));
        if (slides[next]) currentItem.current = slides[next].item;
        return next;
      }),
    [slides],
  );

  // Your instrument's notes plus untagged ones; with no instrument picked, everything.
  const visibleStickies = stickies.filter(
    (n) => instrumentId === null || n.instrument_id === null || n.instrument_id === instrumentId,
  );
  const activeStickyRef = useRef(activeSticky);
  activeStickyRef.current = activeSticky;

  async function saveSticky(text: string) {
    const a = activeSticky;
    if (!a) return;
    if (a.kind === 'new') {
      const note = await api.createStickyNote({ file_id: a.fileId, page: a.page, x: a.x, y: a.y, text, instrument_id: instrumentId });
      setStickies((list) => [...list, note]);
    } else {
      const note = await api.updateStickyNote(a.id, { text });
      setStickies((list) => list.map((n) => (n.id === note.id ? note : n)));
    }
    setActiveSticky(null);
  }

  async function deleteSticky(note: Sticky) {
    await api.deleteStickyNote(note.id);
    setStickies((list) => list.filter((n) => n.id !== note.id));
    setActiveSticky(null);
  }

  /** Drag the divider: the sheet music gets 25–85 % of the space. */
  function startSplitDrag(e: React.PointerEvent) {
    e.preventDefault();
    const el = bodyRef.current;
    if (!el) return;
    document.body.classList.add('dragging-split');
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const f = landscape ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height;
      setSplit(Math.min(0.85, Math.max(0.25, f)));
    };
    const up = () => {
      document.body.classList.remove('dragging-split');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('select, input, textarea')) return;
      // Space/Enter on a button in the entertainment panel presses that button; page-turn keys
      // (arrows, PageUp/PageDown from a pedal) keep working whatever is focused.
      if ((e.key === ' ' || e.key === 'Enter') && e.target instanceof Element && e.target.closest('.fun-panel button')) {
        return;
      }
      if (e.key === ' ' && e.shiftKey) {
        e.preventDefault();
        go(-1);
      } else if (NEXT_KEYS.has(e.key)) {
        e.preventDefault();
        go(1);
      } else if (PREV_KEYS.has(e.key)) {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'Home') go(-Infinity);
      else if (e.key === 'End') go(Infinity);
      else if (e.key === 'm' || e.key === 'M') setMetronomeOn((on) => !on);
      else if (e.key === 'n' || e.key === 'N') setNotesOn((on) => !on);
      else if (e.key === 'i' || e.key === 'I') toggleInvert();
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      else if (e.key === 'e' || e.key === 'E') setFunOn((on) => !on);
      else if (e.key === 'Escape' && activeStickyRef.current) setActiveSticky(null);
      else if (e.key === 'Escape' && !document.fullscreenElement) navigate(exitTo);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, toggleFullscreen, toggleInvert, navigate, exitTo]);

  if (error) return <div className="show-message">{error}</div>;
  if (!gig || !pageCounts)
    return (
      <div className="show-message">
        <img src="/bar_nro_1_logo.png" alt="" />
        Loading sheet music…
      </div>
    );

  const slide = slides[index];
  const song = slide && slide.kind !== 'text' ? slide.song : null;
  const notes = song ? notesFor(song, instrumentId) : { shared: '', own: '' };
  const gigItem = slide ? items[slide.item] : undefined;
  const songItem = gigItem?.kind === 'song' ? gigItem : null;
  const singers = songItem ? singersFor(songItem, song) : null;
  const youStart = Boolean(songItem && instrumentId !== null && starterIdFor(songItem, instruments) === instrumentId);
  const songItems = items.map((it, i) => ({ it, i })).filter(({ it }) => it.kind === 'song');
  const songNumber = slide ? songItems.findIndex(({ i }) => i === slide.item) + 1 : 0;
  const nextItem = slide ? items[slide.item + 1] : undefined;
  const nextLabel =
    nextItem?.kind === 'song' ? (songs.get(nextItem.song_id)?.title ?? '—') : nextItem?.kind === 'text' ? nextItem.text : null;

  return (
    <div className="show">
      <header className="show-bar">
        <button className="btn ghost icon" onClick={() => navigate(exitTo)} title="Exit (Esc)">
          <X size={18} />
        </button>
        <div className="show-now">
          {slide?.kind === 'text' ? (
            <span className="show-title">{slide.text}</span>
          ) : (
            <>
              <span className="show-count">
                {songNumber}/{songItems.length}
              </span>
              <span className="show-title">{song?.title ?? '—'}</span>
              {youStart && (
                <span className="show-you-start" title="You count this song in">
                  <PlayCircle size={13} /> You start
                </span>
              )}
              {singers && (
                <span className="show-singers">
                  <Mic size={13} /> {singers}
                </span>
              )}
              {slide?.kind === 'pages' && slide.partCount > 1 && (
                <span className="show-part">
                  {slide.part + 1}/{slide.partCount}
                </span>
              )}
              {slide?.kind === 'pages' && slide.source === 'general' && instrument && (
                <span className="pill subtle">shared sheet</span>
              )}
            </>
          )}
        </div>
        {nextLabel && (
          <div className="show-next">
            Next <strong>{nextLabel}</strong>
          </div>
        )}
        <div className="show-tools">
          <InstrumentSelect
            className="compact"
            instruments={instruments}
            value={instrumentId}
            onChange={(id) => {
              setMyInstrument(id);
              setInstrumentId(id);
              setMetronomeOn(Boolean(instruments.find((i) => i.id === id)?.metronome));
            }}
          />
          <button
            className="btn ghost icon"
            onClick={() => setLayout(perView === 2 ? 1 : 2)}
            title={perView === 2 ? 'Show one page' : 'Show two pages side by side'}
          >
            {perView === 2 ? <Columns2 size={18} /> : <RectangleVertical size={18} />}
          </button>
          <button
            className={`btn ghost icon ${inverted ? 'on' : ''}`}
            onClick={toggleInvert}
            title="Dark pages (I)"
          >
            <Contrast size={18} />
          </button>
          {practiceSongId !== null && (
            <button
              className={`btn ghost add-notes-btn ${addingNotes ? 'on' : ''}`}
              onClick={() => {
                setAddingNotes((on) => !on);
                setActiveSticky(null);
              }}
              title="Tap the music to pin a sticky note there"
              aria-pressed={addingNotes}
            >
              <MessageSquarePlus size={17} /> <span className="add-notes-label">{addingNotes ? 'Done' : 'Add note'}</span>
            </button>
          )}
          <button
            className={`btn ghost icon ${notesOn ? 'on' : ''}`}
            onClick={() => setNotesOn((on) => !on)}
            title="Song notes and sticky notes (N)"
          >
            <StickyNote size={18} />
          </button>
          <button
            className={`btn ghost icon ${metronomeOn ? 'on' : ''}`}
            onClick={() => setMetronomeOn((on) => !on)}
            title="Visual metronome (M)"
          >
            <Timer size={18} />
          </button>
          <button
            className={`btn ghost icon ${funOn ? 'on' : ''}`}
            onClick={() => setFunOn((on) => !on)}
            title="Entertainment (E)"
            aria-pressed={funOn}
          >
            <Gamepad2 size={18} />
          </button>
          <button className="btn ghost icon" onClick={toggleFullscreen} title="Fullscreen (F)">
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </header>

      <div ref={bodyRef} className={`show-body ${landscape ? 'row' : 'col'}`}>
      <div
        className={`stage ${inverted ? 'inverted' : ''}`}
        style={funOn ? { flex: `0 0 calc(${split * 100}% - 5px)` } : undefined}
        onClick={(e) => {
          // While adding notes, or with a note open, a tap on the page doesn't turn it.
          if (addingNotes || activeSticky) return setActiveSticky(null);
          const rect = e.currentTarget.getBoundingClientRect();
          go(e.clientX - rect.left < rect.width * 0.3 ? -1 : 1);
        }}
      >
        {!slide && <div className="slide-card">This setlist is empty.</div>}
        {slide?.kind === 'pages' && (
          <div className={`spread n${slide.pages.length}`} key={index}>
            {slide.pages.map((p) => (
              <PdfPage
                key={`${p.url}#${p.page}`}
                url={p.url}
                pageNumber={p.page}
                onPick={addingNotes ? (x, y) => setActiveSticky({ kind: 'new', fileId: p.fileId, page: p.page, x, y }) : undefined}
                overlay={
                  (notesOn || addingNotes) && (
                    <StickyLayer
                      notes={visibleStickies.filter((n) => n.file_id === p.fileId && n.page === p.page)}
                      active={
                        activeSticky &&
                        (activeSticky.kind === 'note' ||
                          (activeSticky.fileId === p.fileId && activeSticky.page === p.page))
                          ? activeSticky
                          : null
                      }
                      editable={practiceSongId !== null}
                      onOpen={(n) => setActiveSticky({ kind: 'note', id: n.id })}
                      onClose={() => setActiveSticky(null)}
                      onSave={saveSticky}
                      onDelete={deleteSticky}
                    />
                  )
                }
              />
            ))}
          </div>
        )}
        {slide?.kind === 'text' && (
          <div className="slide-card text">
            <span>{slide.text}</span>
          </div>
        )}
        {slide?.kind === 'empty' && slide.noPart && (
          <div className="slide-card meme">
            <NoPartLine key={index} />
            <span className="meme-note">(nuotti tälle soittimelle on hukassa järjestelmästä)</span>
            <img className="meme-img" src="/jazz_stops.jpg" alt="(jazz music stops)" />
            <span className="meme-sub">
              {slide.song?.title ?? 'Unknown song'}
              {slide.song?.key && <> · {slide.song.key}</>}
              {slide.song?.bpm && <> · ♩ = {slide.song.bpm}</>}
            </span>
          </div>
        )}
        {slide?.kind === 'empty' && !slide.noPart && (
          <div className="slide-card">
            <span className="slide-card-title">{slide.song?.title ?? 'Unknown song'}</span>
            {slide.song?.bpm && <span className="slide-card-bpm">♩ = {slide.song.bpm}</span>}
            {slide.song?.key && <span className="slide-card-bpm">{slide.song.key}</span>}
            <span className="muted">{slide.reason}</span>
          </div>
        )}

        {notesOn && (notes.shared || notes.own) && (
          <aside className="show-notes" onClick={(e) => e.stopPropagation()}>
            {notes.shared && <p>{notes.shared}</p>}
            {notes.own && (
              <p className="own">
                <span className="show-notes-label">{instrument?.name}</span>
                {notes.own}
              </p>
            )}
          </aside>
        )}

        {metronomeOn && song?.bpm && slide && (
          // Hidden (but still running) while a game says no peeking, e.g. counting a minute.
          <div className={`metronome-wrap ${noPeeking ? 'hidden' : ''}`} onClick={(e) => e.stopPropagation()}>
            <TempoMetronome
              savedBpm={song.bpm}
              bpm={tempoTweaks.get(slide.item) ?? song.bpm}
              beats={song.beats}
              resetKey={slide.item}
              onBpm={(bpm) =>
                setTempoTweaks((prev) => {
                  const next = new Map(prev);
                  if (bpm === song.bpm) next.delete(slide.item);
                  else next.set(slide.item, bpm);
                  return next;
                })
              }
            />
          </div>
        )}

        <button className="nav-hint prev" onClick={(e) => (e.stopPropagation(), go(-1))} disabled={index === 0}>
          <ChevronLeft size={28} />
        </button>
        <button
          className="nav-hint next"
          onClick={(e) => (e.stopPropagation(), go(1))}
          disabled={index >= slides.length - 1}
        >
          <ChevronRight size={28} />
        </button>

        <ShowTimer hidden={noPeeking} />
      </div>

      {funOn && (
        <>
          <div
            className="split-handle"
            role="separator"
            aria-orientation={landscape ? 'vertical' : 'horizontal'}
            aria-label="Drag to resize"
            tabIndex={0}
            onPointerDown={(e) => startSplitDrag(e)}
            onKeyDown={(e) => {
              const step = { ArrowLeft: -0.05, ArrowUp: -0.05, ArrowRight: 0.05, ArrowDown: 0.05 }[e.key];
              if (step === undefined) return;
              e.preventDefault();
              e.stopPropagation();
              setSplit((v) => Math.min(0.85, Math.max(0.25, v + step)));
            }}
          />
          <aside className="fun-panel">
            <Entertainment onTimerHidden={setNoPeeking} />
          </aside>
        </>
      )}
      </div>

      <div className="progress" aria-hidden>
        <div style={{ width: `${slides.length ? ((index + 1) / slides.length) * 100 : 0}%` }} />
      </div>
      <span className="sr-only">Instrument: {instrumentName(instruments, instrumentId)}</span>
    </div>
  );
}

/** The show-mode metronome with − / + underneath for nudging the tempo live. */
function TempoMetronome({
  savedBpm,
  bpm,
  beats,
  resetKey,
  onBpm,
}: {
  savedBpm: number;
  bpm: number;
  beats: number;
  resetKey: number;
  onBpm: (bpm: number) => void;
}) {
  const nudge = (delta: number) => onBpm(Math.max(20, Math.min(400, bpm + delta)));
  const changed = bpm !== savedBpm;
  return (
    <div className={`tempo-metronome ${changed ? 'changed' : ''}`}>
      <Metronome bpm={bpm} beats={beats} resetKey={resetKey} />
      <div className="tempo-nudge">
        <button type="button" className="btn ghost" onClick={() => nudge(-1)} title="Slower (−1 BPM)" aria-label="Slower">
          <Minus size={16} />
        </button>
        {changed && (
          <button
            type="button"
            className="btn ghost tempo-reset"
            onClick={() => onBpm(savedBpm)}
            title={`Back to ${savedBpm} BPM`}
          >
            <RotateCcw size={13} /> {savedBpm}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={() => nudge(1)} title="Faster (+1 BPM)" aria-label="Faster">
          <Plus size={16} />
        </button>
        <button type="button" className="btn ghost keikkatempo" onClick={() => nudge(10)} title="+10 BPM">
          Keikkatempo
        </button>
      </div>
    </div>
  );
}

/** Time since show mode opened, in the bottom-left corner. */
function ShowTimer({ hidden }: { hidden: boolean }) {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const total = Math.floor((now - start) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  const text = h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  return (
    <div className={`show-timer ${hidden ? 'hidden' : ''}`} title="Time since the show started" aria-label={`Elapsed ${text}`}>
      {text}
    </div>
  );
}
