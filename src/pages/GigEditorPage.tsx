import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  GripVertical,
  MessageSquareText,
  Mic,
  Pencil,
  Play,
  PlayCircle,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { api, type Gig, type GigItem, type Instrument, type Singer, type Song } from '../api';
import { useData } from '../lib/useData';
import { defaultStarterId, partsFor, singersFor, starterIdFor } from '../lib/parts';
import { useMyInstrument } from '../lib/myInstrument';
import { DangerZone } from '../components/DangerZone';
import { SingerPicker } from '../components/SingerPicker';
import { SongLibrary } from '../components/SongLibrary';
import { Sheet } from '../components/Sheet';
import { GAP_BETWEEN_SONGS, formatApproxMinutes, formatDuration } from '../lib/duration';

type Row = GigItem & { key: string };

const QUICK_TEXTS = ['Break', 'Encore', 'Speech', 'Tune up'];
const newKey = () => crypto.randomUUID();

export function GigEditorPage() {
  const gigId = Number(useParams().id);
  const navigate = useNavigate();
  const songs = useData(api.songs);
  const instruments = useData(api.instruments);
  const singerList = useData(api.singers);
  const [instrumentId] = useMyInstrument();
  const [gig, setGig] = useState<Gig | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  // The setlist is locked unless editing, so a stray drag or click can't reorder or remove anything.
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.gig(gigId).then(
      (g) => {
        setGig(g);
        setRows((g.items ?? []).map((i) => ({ ...i, key: newKey() })));
      },
      (e: Error) => setError(e.message),
    );
  }, [gigId]);

  const songById = useMemo(() => new Map((songs.data ?? []).map((s) => [s.id, s])), [songs.data]);
  const inSet = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of rows) if (r.kind === 'song') counts.set(r.song_id, (counts.get(r.song_id) ?? 0) + 1);
    return counts;
  }, [rows]);

  // Setlist length: song lengths plus a short gap between songs. Everything after the
  // first "Encore" note counts as the encore.
  const timing = useMemo(() => {
    const measure = (list: Row[]) => {
      const songsIn = list.filter((r) => r.kind === 'song').map((r) => songById.get(r.song_id!));
      const known = songsIn.map((s) => s?.length_sec ?? 0).filter((n) => n > 0);
      return {
        songs: songsIn.length,
        seconds: known.reduce((a, b) => a + b, 0) + GAP_BETWEEN_SONGS * Math.max(0, songsIn.length - 1),
        missing: songsIn.length - known.length,
      };
    };
    const encoreAt = rows.findIndex((r) => r.kind === 'text' && /encore/i.test(r.text ?? ''));
    return { all: measure(rows), main: encoreAt >= 0 ? measure(rows.slice(0, encoreAt)) : null };
  }, [rows, songById]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetStartCount, setSheetStartCount] = useState(0);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Saves are chained so quick successive edits can't land on the server out of order.
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  function persist(next: Row[]) {
    setRows(next);
    const items = next.map(
      ({ kind, song_id, text, singers, starter_id }) => ({ kind, song_id, text, singers, starter_id }) as GigItem,
    );
    saving.current = saving.current
      .then(() => api.saveGigItems(gigId, items))
      .then(() => setError(null), (e: Error) => setError(`Couldn’t save setlist: ${e.message}`));
  }

  function updateGig(patch: Partial<Gig>) {
    if (!gig) return;
    setGig({ ...gig, ...patch });
    api.updateGig(gig.id, patch).catch((e: Error) => setError(e.message));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r.key === active.id);
    const to = rows.findIndex((r) => r.key === over.id);
    persist(arrayMove(rows, from, to));
  }

  const toggleSelected = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  function stopEditing() {
    setEditing(false);
    setSelected(new Set());
  }

  function removeSelected() {
    const n = selected.size;
    if (!n || !confirm(`Remove ${n} item${n > 1 ? 's' : ''} from this setlist? The songs stay in your library.`)) return;
    persist(rows.filter((r) => !selected.has(r.key)));
    setSelected(new Set());
  }

  const addSong = (song: Song) => persist([...rows, { kind: 'song', song_id: song.id, key: newKey() }]);
  const addText = (text: string) => text.trim() && persist([...rows, { kind: 'text', text: text.trim(), key: newKey() }]);

  if (error && !gig) return <p className="error page">{error}</p>;
  if (!gig) return null;

  const songCount = rows.filter((r) => r.kind === 'song').length;
  const totalMissing = rows.filter(
    (r) => r.kind === 'song' && songById.get(r.song_id) && partsFor(songById.get(r.song_id)!, instrumentId).source === 'none',
  ).length;

  return (
    <div className="page">
      <div className="gig-head panel">
        <Link to="/gigs" className="btn ghost icon" title="Back to gigs">
          <ArrowLeft size={18} />
        </Link>
        <div className="gig-head-fields">
          <input
            className="title-input"
            value={gig.name}
            onChange={(e) => setGig({ ...gig, name: e.target.value })}
            onBlur={(e) => updateGig({ name: e.target.value })}
          />
          <div className="gig-head-row">
            <input type="date" value={gig.date ?? ''} onChange={(e) => updateGig({ date: e.target.value || null })} />
          </div>
        </div>
        <div className="gig-head-actions">
          <Link to={`/gigs/${gig.id}/show`} className={`btn primary ${rows.length ? '' : 'disabled'}`}>
            <Play size={16} /> Start show
          </Link>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="split editor-split">
        <section className="panel setlist-panel">
          <div className="panel-head">
            <h2>Setlist</h2>
            <span className="muted small">
              {songCount} songs
              {totalMissing > 0 && (
                <span className="warn">
                  {' '}
                  · <AlertTriangle size={12} /> {totalMissing} without sheet music for this instrument
                </span>
              )}
            </span>
            {rows.length > 0 && (
              <button
                type="button"
                className={`btn small-btn ${editing ? 'primary' : ''}`}
                onClick={() => (editing ? stopEditing() : setEditing(true))}
              >
                {editing ? (
                  <>
                    <Check size={14} /> Done
                  </>
                ) : (
                  <>
                    <Pencil size={14} /> Edit
                  </>
                )}
              </button>
            )}
          </div>

          {timing.all.songs > 0 && (
            <div className="setlist-timing">
              <Clock size={14} />
              {timing.all.missing === timing.all.songs ? (
                <span className="muted">Add song lengths in Songs to see how long the set is.</span>
              ) : (
                <>
                  <span>
                    <strong>{formatApproxMinutes(timing.all.seconds)}</strong> total
                  </span>
                  {timing.main && timing.main.songs < timing.all.songs && (
                    <span>
                      <strong>{formatApproxMinutes(timing.main.seconds)}</strong> without encore
                    </span>
                  )}
                  {timing.all.missing > 0 && (
                    <span className="warn">
                      + {timing.all.missing} song{timing.all.missing > 1 ? 's' : ''} without a length
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {editing && (
            <div className="edit-bar">
              <span className="muted small">Drag ⋮⋮ to reorder · tick rows to remove</span>
              <span className="edit-bar-actions">
                <button type="button" className="btn ghost small-btn" onClick={() => setSelected(new Set(rows.map((r) => r.key)))}>
                  All
                </button>
                <button
                  type="button"
                  className="btn ghost small-btn"
                  disabled={!selected.size}
                  onClick={() => setSelected(new Set())}
                >
                  None
                </button>
                <button type="button" className="btn danger small-btn" disabled={!selected.size} onClick={removeSelected}>
                  <Trash2 size={14} /> Remove{selected.size ? ` ${selected.size}` : ''} from gig
                </button>
              </span>
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
              <ol className="setlist">
                {rows.map((row, index) => (
                  <SetlistRow
                    key={row.key}
                    row={row}
                    number={rows.slice(0, index + 1).filter((r) => r.kind === 'song').length}
                    song={row.kind === 'song' ? songById.get(row.song_id) : undefined}
                    instrumentId={instrumentId}
                    instruments={instruments.data ?? []}
                    editing={editing}
                    selected={selected.has(row.key)}
                    onToggle={() => toggleSelected(row.key)}
                    showFrom={`/gigs/${gigId}/show?from=${index}`}
                    singerList={singerList.data ?? []}
                    onDetails={(patch) =>
                      persist(rows.map((r) => (r.key === row.key && r.kind === 'song' ? { ...r, ...patch } : r)))
                    }
                    onText={(text) => persist(rows.map((r) => (r.key === row.key && r.kind === 'text' ? { ...r, text } : r)))}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          {rows.length === 0 && <p className="empty library-hint">Add songs from your library →</p>}
          <button
            type="button"
            className="btn add-songs-btn"
            onClick={() => {
              setSheetStartCount(songCount);
              setSheetOpen(true);
            }}
          >
            <Plus size={16} /> Add songs
          </button>

          <div className="text-adder">
            <MessageSquareText size={16} className="muted" />
            {QUICK_TEXTS.map((t) => (
              <button key={t} className="chip" onClick={() => addText(t)}>
                + {t}
              </button>
            ))}
            <form
              className="add-row compact"
              onSubmit={(e) => {
                e.preventDefault();
                addText(customText);
                setCustomText('');
              }}
            >
              <input value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="Custom note…" />
              <button className="btn icon" disabled={!customText.trim()} title="Add note">
                <Plus size={16} />
              </button>
            </form>
          </div>
        </section>

        <aside className="panel list-panel library-aside">
          <div className="panel-head">
            <h2>Library</h2>
            <Link to="/songs" className="muted small">
              Manage songs
            </Link>
          </div>
          <SongLibrary songs={songs.data ?? []} singers={singerList.data ?? []} inSet={inSet} onAdd={addSong} />
        </aside>
      </div>

      {sheetOpen && (
        <Sheet
          title="Add songs"
          onClose={closeSheet}
          badge={songCount > sheetStartCount && <span className="pill">+{songCount - sheetStartCount} added</span>}
        >
          <SongLibrary songs={songs.data ?? []} singers={singerList.data ?? []} inSet={inSet} onAdd={addSong} autoFocus />
        </Sheet>
      )}

      <DangerZone
        what="gig"
        name={gig.name}
        detail="The songs stay in your library."
        onDelete={async () => {
          await api.deleteGig(gig.id);
          navigate('/gigs');
        }}
      />
    </div>
  );
}

function SetlistRow({
  row,
  number,
  song,
  instrumentId,
  instruments,
  editing,
  selected,
  onToggle,
  onDetails,
  showFrom,
  singerList,
  onText,
}: {
  row: Row;
  number: number;
  song: Song | undefined;
  instrumentId: number | null;
  instruments: Instrument[];
  editing: boolean;
  selected: boolean;
  onToggle: () => void;
  onDetails: (patch: { singers?: string | null; starter_id?: number | null }) => void;
  showFrom: string;
  singerList: Singer[];
  onText: (text: string) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const defaultSingers = song?.singers ?? '';
  const customSingers = row.kind === 'song' && row.singers != null;
  const effectiveSingers = row.kind === 'song' ? singersFor(row, song) : null;
  const [singers, setSingers] = useState(row.kind === 'song' ? (row.singers ?? defaultSingers) : '');

  function saveSingers(raw = singers) {
    const value = raw.trim();
    if (customSingers ? value === row.singers : value === defaultSingers.trim()) return;
    // Matching the song's default means "use the default" again.
    onDetails({ singers: value === defaultSingers.trim() ? null : value });
  }
  const defaultStarter = defaultStarterId(instruments);
  const starterId = row.kind === 'song' ? starterIdFor(row, instruments) : null;
  const starterName = instruments.find((i) => i.id === starterId)?.name;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
    disabled: !editing,
  });
  const [text, setText] = useState(row.text ?? '');
  const style = { transform: CSS.Transform.toString(transform), transition };

  const parts = song ? partsFor(song, instrumentId) : null;
  const instrument = instruments.find((i) => i.id === instrumentId);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`setlist-row ${row.kind} ${isDragging ? 'dragging' : ''} ${selected ? 'selected' : ''}`}
    >
      {editing && (
        <>
          <input type="checkbox" className="row-check" checked={selected} onChange={onToggle} aria-label="Select" />
          <button className="drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">
            <GripVertical size={16} />
          </button>
        </>
      )}
      {row.kind === 'song' ? (
        <>
          <span className="setlist-number">{number}</span>
          <span className="song-row-main">
            <span className="song-title">{song?.title ?? 'Missing song'}</span>
          </span>
          <span className="song-row-meta">
            {effectiveSingers && (
              <span
                className={`pill subtle ${customSingers ? 'custom' : ''}`}
                title={customSingers ? 'Singers for this gig' : 'Default singers'}
              >
                <Mic size={12} /> {effectiveSingers}
              </span>
            )}
            {starterId !== defaultStarter && starterName && (
              <span className="pill subtle" title={`${starterName} starts this song`}>
                <PlayCircle size={12} /> {starterName}
              </span>
            )}
            {song?.length_sec && <span className="muted small">{formatDuration(song.length_sec)}</span>}
            {song?.key && <span className="pill">{song.key}</span>}
            {song?.bpm && <span className="pill">{song.bpm} bpm</span>}
            {parts?.source === 'general' && instrument && (
              <span className="pill subtle" title={`No ${instrument.name} part — shared sheet will be shown`}>
                shared
              </span>
            )}
            {parts?.source === 'none' && (
              <span className="pill warn" title="Nothing to show for this instrument — a placeholder will appear">
                <AlertTriangle size={12} /> no sheet
              </span>
            )}
          </span>
          <button
            type="button"
            className={`btn ghost icon details-btn ${detailsOpen ? 'on' : ''}`}
            onClick={() => setDetailsOpen((o) => !o)}
            title="Singers and who starts"
            aria-expanded={detailsOpen}
          >
            <SlidersHorizontal size={15} />
          </button>
          {!editing && (
            <Link to={showFrom} className="btn ghost icon start-here" title="Start the show from this song">
              <Play size={15} />
            </Link>
          )}
          {detailsOpen && (
            <div className="row-details">
              <label className="field">
                <span>
                  Singers {customSingers ? '(this gig only)' : defaultSingers ? '(song default)' : ''}
                </span>
                <span className="singers-row">
                  <SingerPicker
                    value={singers}
                    singers={singerList}
                    onChange={setSingers}
                    onCommit={saveSingers}
                    placeholder={customSingers ? 'Nobody sings at this gig' : 'e.g. Marianna, Kalle'}
                  />
                  {customSingers && (
                    <button
                      type="button"
                      className="btn ghost small-btn"
                      title={defaultSingers ? `Back to the song's default: ${defaultSingers}` : 'Back to the song default (none)'}
                      onClick={() => {
                        setSingers(defaultSingers);
                        onDetails({ singers: null });
                      }}
                    >
                      <RotateCcw size={13} /> Restore default
                    </button>
                  )}
                </span>
              </label>
              <label className="field">
                <span>Starts the song</span>
                <select
                  value={starterId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    onDetails({ starter_id: id === defaultStarter ? null : id });
                  }}
                >
                  {starterId === null && <option value="">—</option>}
                  {instruments.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {i.id === defaultStarter ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </>
      ) : (
        <input
          className="text-item-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== row.text && onText(text)}
        />
      )}
    </li>
  );
}
