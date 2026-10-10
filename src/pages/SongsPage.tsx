import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Music2, Plus, Search, Trash2, Upload } from 'lucide-react';
import { api, fileUrl, type Instrument, type Song } from '../api';
import { useData } from '../lib/useData';
import { instrumentName, partsFor } from '../lib/parts';

export function SongsPage() {
  const songs = useData(api.songs);
  const instruments = useData(api.instruments);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const selectedId = Number(params.get('song')) || null;
  const select = (id: number | null) => setParams(id ? { song: String(id) } : {}, { replace: true });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (songs.data ?? []).filter((s) => !q || s.title.toLowerCase().includes(q));
  }, [songs.data, query]);

  const selected = songs.data?.find((s) => s.id === selectedId) ?? null;

  const replaceSong = (song: Song) =>
    songs.setData((list) => (list ?? []).map((s) => (s.id === song.id ? song : s)));

  async function createSong(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const song = await api.createSong({ title });
    songs.setData((list) => [...(list ?? []), song].sort((a, b) => a.title.localeCompare(b.title)));
    setNewTitle('');
    select(song.id);
  }

  return (
    <div className="split">
      <aside className="panel list-panel">
        <form className="add-row" onSubmit={createSong}>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New song title…" />
          <button className="btn primary icon" disabled={!newTitle.trim()} title="Add song">
            <Plus size={18} />
          </button>
        </form>
        <label className="search">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs" />
        </label>
        <ul className="song-list">
          {filtered.map((s) => (
            <li key={s.id}>
              <button className={`song-row ${s.id === selectedId ? 'active' : ''}`} onClick={() => select(s.id)}>
                <span className="song-row-main">
                  <span className="song-title">{s.title}</span>
                  {s.notes.length > 0 && <span className="muted small">{notePreview(s)}</span>}
                </span>
                <span className="song-row-meta">
                  {s.bpm && <span className="pill">{s.bpm} bpm</span>}
                  <span className="pill subtle">
                    <FileText size={12} /> {s.files.length}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {songs.data && filtered.length === 0 && (
            <li className="empty small">{songs.data.length ? 'No matches.' : 'No songs yet — add your first one above.'}</li>
          )}
        </ul>
      </aside>

      <section className="panel detail-panel">
        {selected && instruments.data ? (
          <SongDetail
            key={selected.id}
            song={selected}
            instruments={instruments.data}
            onChange={replaceSong}
            onDelete={() => {
              songs.setData((list) => (list ?? []).filter((s) => s.id !== selected.id));
              select(null);
            }}
          />
        ) : (
          <div className="placeholder">
            <Music2 size={40} strokeWidth={1.2} />
            <p>Pick a song to edit its tempo and sheet music.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function SongDetail({
  song,
  instruments,
  onChange,
  onDelete,
}: {
  song: Song;
  instruments: Instrument[];
  onChange: (s: Song) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState({
    title: song.title,
    bpm: song.bpm?.toString() ?? '',
    beats: song.beats.toString(),
  });
  const [target, setTarget] = useState<string>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function run(action: () => Promise<Song | void>) {
    setError(null);
    try {
      const result = await action();
      if (result) onChange(result);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const save = (field: keyof typeof form) => {
    const value = form[field];
    const current = field === 'bpm' ? (song.bpm?.toString() ?? '') : String(song[field]);
    if (value === current) return;
    run(() => api.updateSong(song.id, { [field]: value === '' ? null : value } as Partial<Song>));
  };

  async function upload(files: File[]) {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) return setError('Only PDF files can be added.');
    setBusy(true);
    await run(() => api.uploadFiles(song.id, pdfs, target === 'auto' ? 'auto' : target === '' ? null : Number(target)));
    setBusy(false);
  }

  const groups = [
    { id: null as number | null, name: 'All instruments' },
    ...instruments.map((i) => ({ id: i.id as number | null, name: i.name })),
  ]
    .map((g) => ({ ...g, files: song.files.filter((f) => f.instrument_id === g.id) }))
    .filter((g) => g.files.length);

  return (
    <div className="song-detail">
      <div className="detail-head">
        <input
          className="title-input"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          onBlur={() => save('title')}
        />
        <button
          className="btn ghost danger"
          onClick={async () => {
            if (!confirm(`Delete “${song.title}” and all its PDFs?`)) return;
            await api.deleteSong(song.id);
            onDelete();
          }}
        >
          <Trash2 size={16} /> Delete
        </button>
      </div>

      <div className="field-grid tempo">
        <label className="field">
          <span>Tempo (BPM)</span>
          <input
            type="number"
            min={20}
            max={400}
            value={form.bpm}
            onChange={(e) => setForm({ ...form, bpm: e.target.value })}
            onBlur={() => save('bpm')}
            placeholder="e.g. 120"
          />
        </label>
        <label className="field">
          <span>Beats per bar</span>
          <input
            type="number"
            min={1}
            max={16}
            value={form.beats}
            onChange={(e) => setForm({ ...form, beats: e.target.value })}
            onBlur={() => save('beats')}
          />
        </label>
      </div>

      <h3 className="section-title">Notes</h3>
      <NotesPanel
        song={song}
        instruments={instruments}
        onSave={(instrumentId, text) => run(() => api.setNote(song.id, instrumentId, text))}
      />

      <h3 className="section-title">Coverage</h3>
      <div className="coverage">
        {instruments.map((i) => {
          const { source } = partsFor(song, i.id);
          return (
            <span key={i.id} className={`coverage-chip ${source}`} title={coverageLabel(source)}>
              {i.name}
              <small>{source === 'instrument' ? 'own part' : source === 'general' ? 'shared' : 'missing'}</small>
            </span>
          );
        })}
      </div>

      <h3 className="section-title">Sheet music</h3>
      <div
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload([...e.dataTransfer.files]);
        }}
      >
        <Upload size={20} />
        <div className="dropzone-text">
          <strong>{busy ? 'Uploading…' : 'Drop PDFs here'}</strong>
          <span className="muted small">or</span>
          <label className="btn">
            Choose files
            <input
              type="file"
              accept="application/pdf,.pdf"
              multiple
              hidden
              onChange={(e) => {
                upload([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <label className="field inline">
          <span>for</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="auto">Auto (from file name)</option>
            <option value="">All instruments</option>
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      {groups.map((g) => (
        <div key={g.id ?? 'all'} className="file-group">
          <h4>{g.name}</h4>
          <ul>
            {g.files.map((f) => (
              <li key={f.id} className="file-row">
                <FileText size={16} className="muted" />
                <a href={fileUrl(f)} target="_blank" rel="noreferrer" className="file-name">
                  {f.original_name}
                </a>
                <select
                  value={f.instrument_id ?? ''}
                  onChange={(e) =>
                    run(() => api.updateFile(f.id, { instrument_id: e.target.value ? Number(e.target.value) : null }))
                  }
                  aria-label="Instrument"
                >
                  <option value="">{instrumentName(instruments, null)}</option>
                  {instruments.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn ghost icon danger"
                  title="Remove PDF"
                  onClick={() => confirm(`Remove ${f.original_name}?`) && run(() => api.deleteFile(f.id))}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {song.files.length === 0 && <p className="muted small">No sheet music yet.</p>}
    </div>
  );
}

function NotesPanel({
  song,
  instruments,
  onSave,
}: {
  song: Song;
  instruments: Instrument[];
  onSave: (instrumentId: number | null, text: string) => void;
}) {
  const noteOf = (id: number | null) => song.notes.find((n) => n.instrument_id === id)?.text ?? '';
  const [tab, setTab] = useState<number | null>(null);
  const [draft, setDraft] = useState(() => noteOf(null));
  const tabs = [{ id: null as number | null, name: 'Everyone' }, ...instruments.map((i) => ({ id: i.id as number | null, name: i.name }))];
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  return (
    <div className="notes-panel">
      <div className="notes-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id ?? 'all'}
            role="tab"
            aria-selected={t.id === tab}
            className={`notes-tab ${t.id === tab ? 'active' : ''}`}
            onClick={() => {
              if (t.id === tab) return;
              setTab(t.id);
              setDraft(noteOf(t.id));
            }}
          >
            {t.name}
            {noteOf(t.id) && <span className="notes-dot" />}
          </button>
        ))}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() !== noteOf(tab) && onSave(tab, draft)}
        rows={3}
        placeholder={
          tab === null
            ? 'Notes for everyone, e.g. “Count-in 2 bars · Last chorus ×2 · Ends on a hit”'
            : `Only shown when playing ${current.name}, e.g. “Brushes in verse 2”`
        }
      />
    </div>
  );
}

function notePreview(song: Song) {
  const text = song.notes.find((n) => n.instrument_id === null)?.text ?? song.notes[0]?.text ?? '';
  return text.split('\n')[0];
}

function coverageLabel(source: string) {
  if (source === 'instrument') return 'Has its own part';
  if (source === 'general') return 'Uses the “All instruments” PDF';
  return 'Nothing to show — the show will display a placeholder';
}
