import { useEffect, useMemo, useRef, useState } from 'react';
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
  GripVertical,
  MessageSquareText,
  Mic,
  Pencil,
  Play,
  PlayCircle,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { api, type Gig, type GigItem, type Instrument, type Song } from '../api';
import { useData } from '../lib/useData';
import { defaultStarterId, partsFor, starterIdFor } from '../lib/parts';
import { useMyInstrument } from '../lib/myInstrument';
import { DangerZone } from '../components/DangerZone';
import { InstrumentSelect } from '../components/InstrumentSelect';

type Row = GigItem & { key: string };

const QUICK_TEXTS = ['Break', 'Encore', 'Speech', 'Tune up'];
const newKey = () => crypto.randomUUID();

export function GigEditorPage() {
  const gigId = Number(useParams().id);
  const navigate = useNavigate();
  const songs = useData(api.songs);
  const instruments = useData(api.instruments);
  const [instrumentId, setInstrumentId] = useMyInstrument();
  const [gig, setGig] = useState<Gig | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
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
  const library = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (songs.data ?? []).filter((s) => !q || s.title.toLowerCase().includes(q));
  }, [songs.data, query]);

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
            <label className="field inline" title="Remembered on this device for every gig">
              <span>My instrument</span>
              <InstrumentSelect instruments={instruments.data ?? []} value={instrumentId} onChange={setInstrumentId} />
            </label>
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
                    onDetails={(patch) =>
                      persist(rows.map((r) => (r.key === row.key && r.kind === 'song' ? { ...r, ...patch } : r)))
                    }
                    onText={(text) => persist(rows.map((r) => (r.key === row.key && r.kind === 'text' ? { ...r, text } : r)))}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          {rows.length === 0 && <p className="empty">Add songs from your library →</p>}

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

        <aside className="panel list-panel">
          <div className="panel-head">
            <h2>Library</h2>
            <Link to="/songs" className="muted small">
              Manage songs
            </Link>
          </div>
          <label className="search">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs" />
          </label>
          <ul className="song-list">
            {library.map((s) => {
              const count = rows.filter((r) => r.kind === 'song' && r.song_id === s.id).length;
              return (
                <li key={s.id}>
                  <button className="song-row" onClick={() => addSong(s)} title="Add to setlist">
                    <span className="song-row-main">
                      <span className="song-title">{s.title}</span>
                    </span>
                    <span className="song-row-meta">
                      {count > 0 && <span className="pill subtle">in set{count > 1 ? ` ×${count}` : ''}</span>}
                      <Plus size={16} />
                    </span>
                  </button>
                </li>
              );
            })}
            {songs.data?.length === 0 && (
              <li className="empty small">
                Your library is empty. <Link to="/songs">Add songs</Link> first.
              </li>
            )}
          </ul>
        </aside>
      </div>

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
  onText: (text: string) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [singers, setSingers] = useState(row.kind === 'song' ? (row.singers ?? '') : '');
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
            {row.singers && (
              <span className="pill subtle" title="Singers">
                <Mic size={12} /> {row.singers}
              </span>
            )}
            {starterId !== defaultStarter && starterName && (
              <span className="pill subtle" title={`${starterName} starts this song`}>
                <PlayCircle size={12} /> {starterName}
              </span>
            )}
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
                <span>Singers</span>
                <input
                  value={singers}
                  maxLength={200}
                  onChange={(e) => setSingers(e.target.value)}
                  onBlur={() => singers.trim() !== (row.singers ?? '') && onDetails({ singers: singers.trim() || null })}
                  placeholder="e.g. Anna, Ville"
                />
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
