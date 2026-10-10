import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Maximize,
  Minimize,
  RectangleVertical,
  StickyNote,
  Timer,
  X,
} from 'lucide-react';
import { api, type Gig, type Instrument, type Song } from '../api';
import { instrumentName, notesFor } from '../lib/parts';
import { buildSlides, loadPageCounts, urlsFor, type Slide } from '../lib/slides';
import { PdfPage } from '../components/PdfPage';
import { Metronome } from '../components/Metronome';
import { InstrumentSelect } from '../components/InstrumentSelect';

type Layout = 'auto' | 1 | 2;

const NEXT_KEYS = new Set([' ', 'ArrowRight', 'ArrowDown', 'PageDown', 'Enter']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']);

export function ShowPage() {
  const gigId = Number(useParams().id);
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
  const [fullscreen, setFullscreen] = useState(false);

  const [pageCounts, setPageCounts] = useState<Map<string, number | Error> | null>(null);
  const [index, setIndex] = useState(0);
  const currentItem = useRef(0);

  // Load everything once.
  useEffect(() => {
    Promise.all([api.gig(gigId), api.songs(), api.instruments()]).then(
      ([g, s, i]) => {
        setGig(g);
        setSongs(new Map(s.map((song) => [song.id, song])));
        setInstruments(i);
        const inst = i.find((x) => x.id === g.instrument_id) ?? null;
        setInstrumentId(inst?.id ?? null);
        setMetronomeOn(Boolean(inst?.metronome));
      },
      (e: Error) => setError(e.message),
    );
  }, [gigId]);

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
        ? buildSlides(items, songs, instrumentId, instrument?.name ?? 'this instrument', pageCounts, perView)
        : [],
    [items, songs, instrumentId, instrument, pageCounts, perView],
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

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('select, input')) return;
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
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      else if (e.key === 'Escape' && !document.fullscreenElement) navigate(`/gigs/${gigId}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, toggleFullscreen, navigate, gigId]);

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
  const songItems = items.map((it, i) => ({ it, i })).filter(({ it }) => it.kind === 'song');
  const songNumber = slide ? songItems.findIndex(({ i }) => i === slide.item) + 1 : 0;
  const nextItem = slide ? items[slide.item + 1] : undefined;
  const nextLabel =
    nextItem?.kind === 'song' ? (songs.get(nextItem.song_id)?.title ?? '—') : nextItem?.kind === 'text' ? nextItem.text : null;

  return (
    <div className="show">
      <header className="show-bar">
        <button className="btn ghost icon" onClick={() => navigate(`/gigs/${gigId}`)} title="Exit (Esc)">
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
            className={`btn ghost icon ${notesOn ? 'on' : ''}`}
            onClick={() => setNotesOn((on) => !on)}
            title="Song notes (N)"
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
          <button className="btn ghost icon" onClick={toggleFullscreen} title="Fullscreen (F)">
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </header>

      <div
        className="stage"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          go(e.clientX - rect.left < rect.width * 0.3 ? -1 : 1);
        }}
      >
        {!slide && <div className="slide-card">This setlist is empty.</div>}
        {slide?.kind === 'pages' && (
          <div className={`spread n${slide.pages.length}`} key={index}>
            {slide.pages.map((p) => (
              <PdfPage key={`${p.url}#${p.page}`} url={p.url} pageNumber={p.page} />
            ))}
          </div>
        )}
        {slide?.kind === 'text' && (
          <div className="slide-card text">
            <span>{slide.text}</span>
          </div>
        )}
        {slide?.kind === 'empty' && (
          <div className="slide-card">
            <span className="slide-card-title">{slide.song?.title ?? 'Unknown song'}</span>
            {slide.song?.bpm && <span className="slide-card-bpm">♩ = {slide.song.bpm}</span>}
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

        {metronomeOn && song?.bpm && (
          <div className="metronome-wrap">
            <Metronome bpm={song.bpm} beats={song.beats} resetKey={slide.item} />
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
      </div>

      <div className="progress" aria-hidden>
        <div style={{ width: `${slides.length ? ((index + 1) / slides.length) * 100 : 0}%` }} />
      </div>
      <span className="sr-only">Instrument: {instrumentName(instruments, instrumentId)}</span>
    </div>
  );
}
