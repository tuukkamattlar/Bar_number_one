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
import { AlertTriangle, ArrowLeft, GripVertical, MessageSquareText, Play, Plus, Search, Trash2, X } from 'lucide-react';
import { api, type Gig, type GigItem, type Instrument, type Song } from '../api';
import { useData } from '../lib/useData';
import { partsFor } from '../lib/parts';
import { InstrumentSelect } from '../components/InstrumentSelect';

type Row = GigItem & { key: string };

const QUICK_TEXTS = ['Break', 'Encore', 'Speech', 'Tune up'];
const newKey = () => crypto.randomUUID();

export function GigEditorPage() {
  const gigId = Number(useParams().id);
  const navigate = useNavigate();
  const songs = useData(api.songs);
  const instruments = useData(api.instruments);
  const [gig, setGig] = useState<Gig | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [customText, setCustomText] = useState('');

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
    const items = next.map(({ kind, song_id, text }) => ({ kind, song_id, text }) as GigItem);
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

  const addSong = (song: Song) => persist([...rows, { kind: 'song', song_id: song.id, key: newKey() }]);
  const addText = (text: string) => text.trim() && persist([...rows, { kind: 'text', text: text.trim(), key: newKey() }]);

  if (error && !gig) return <p className="error page">{error}</p>;
  if (!gig) return null;

  const songCount = rows.filter((r) => r.kind === 'song').length;
  const totalMissing = rows.filter(
    (r) => r.kind === 'song' && songById.get(r.song_id) && partsFor(songById.get(r.song_id)!, gig.instrument_id).source === 'none',
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
            <InstrumentSelect
              instruments={instruments.data ?? []}
              value={gig.instrument_id}
              onChange={(instrument_id) => updateGig({ instrument_id })}
            />
          </div>
        </div>
        <div className="gig-head-actions">
          <button
            className="btn ghost danger icon"
            title="Delete gig"
            onClick={async () => {
              if (!confirm(`Delete gig “${gig.name}”? Songs stay in your library.`)) return;
              await api.deleteGig(gig.id);
              navigate('/gigs');
            }}
          >
            <Trash2 size={16} />
          </button>
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
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
              <ol className="setlist">
                {rows.map((row, index) => (
                  <SetlistRow
                    key={row.key}
                    row={row}
                    number={rows.slice(0, index + 1).filter((r) => r.kind === 'song').length}
                    song={row.kind === 'song' ? songById.get(row.song_id) : undefined}
                    instrumentId={gig.instrument_id}
                    instruments={instruments.data ?? []}
                    onRemove={() => persist(rows.filter((r) => r.key !== row.key))}
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
    </div>
  );
}

function SetlistRow({
  row,
  number,
  song,
  instrumentId,
  instruments,
  onRemove,
  onText,
}: {
  row: Row;
  number: number;
  song: Song | undefined;
  instrumentId: number | null;
  instruments: Instrument[];
  onRemove: () => void;
  onText: (text: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key });
  const [text, setText] = useState(row.text ?? '');
  const style = { transform: CSS.Transform.toString(transform), transition };

  const parts = song ? partsFor(song, instrumentId) : null;
  const instrument = instruments.find((i) => i.id === instrumentId);

  return (
    <li ref={setNodeRef} style={style} className={`setlist-row ${row.kind} ${isDragging ? 'dragging' : ''}`}>
      <button className="drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">
        <GripVertical size={16} />
      </button>
      {row.kind === 'song' ? (
        <>
          <span className="setlist-number">{number}</span>
          <span className="song-row-main">
            <span className="song-title">{song?.title ?? 'Missing song'}</span>
          </span>
          <span className="song-row-meta">
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
        </>
      ) : (
        <input
          className="text-item-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== row.text && onText(text)}
        />
      )}
      <button className="btn ghost icon" onClick={onRemove} title="Remove from setlist">
        <X size={16} />
      </button>
    </li>
  );
}
