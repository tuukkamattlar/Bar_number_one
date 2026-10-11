import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Mic, Play, Search, X } from 'lucide-react';
import { api } from '../api';
import { useData } from '../lib/useData';
import { partsFor } from '../lib/parts';
import { useMyInstrument } from '../lib/myInstrument';
import { fold, matchesSearch, singerHighlighted, splitSingers, type SingerMode } from '../lib/singers';
import { SingerModeToggle } from '../components/SingerModeToggle';


export function PracticePage() {
  const songs = useData(api.songs);
  const singerRows = useData(api.songSingers);
  const roster = useData(api.singers);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [myInstrument] = useMyInstrument();

  // Singers per song: the song's defaults first, then anyone a gig has set for it.
  const singersBySong = useMemo(() => {
    const map = new Map<number, string[]>();
    const add = (songId: number, raw: string) => {
      const list = map.get(songId) ?? [];
      for (const name of splitSingers(raw)) {
        if (!list.some((n) => fold(n) === fold(name))) list.push(name);
      }
      map.set(songId, list);
    };
    for (const s of songs.data ?? []) if (s.singers) add(s.id, s.singers);
    for (const row of singerRows.data ?? []) add(row.song_id, row.singers);
    return map;
  }, [songs.data, singerRows.data]);

  const allSingers = useMemo(() => {
    const names = new Map<string, string>();
    for (const s of roster.data ?? []) names.set(fold(s.name), s.name);
    for (const list of singersBySong.values()) for (const n of list) names.set(fold(n), names.get(fold(n)) ?? n);
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }, [singersBySong, roster.data]);

  // Singers picked with the chips; a song has to have all of them.
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<SingerMode>('all');
  const togglePicked = (name: string) =>
    setPicked((list) => (list.some((n) => fold(n) === fold(name)) ? list.filter((n) => fold(n) !== fold(name)) : [...list, name]));
  const searching = Boolean(query.trim() || picked.length);
  const filtered = useMemo(
    () =>
      [...(songs.data ?? [])]
        .sort((a, b) => a.title.localeCompare(b.title))
        .filter((s) => matchesSearch(s.title, singersBySong.get(s.id) ?? [], query, picked, mode)),
    [songs.data, singersBySong, query, picked, mode],
  );
  const clear = () => {
    setQuery('');
    setPicked([]);
  };

  // Start typing anywhere on the page and it goes into the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const open = (id: number) => navigate(`/practice/${id}`);

  return (
    <div className="page practice">
      <section className="panel practice-search">
        <label className="search big">
          <Search size={20} />
          <input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) open(filtered[0].id);
              if (e.key === 'Escape') clear();
            }}
            placeholder="Search songs or singers, e.g. kalle mari…"
            aria-label="Search songs or singers"
          />
          {searching && (
            <button type="button" className="btn ghost icon" onClick={clear} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
        </label>
        {allSingers.length > 0 && (
          <div className="singer-chips">
            <Mic size={14} className="muted" />
            {allSingers.map((name) => (
              <button
                key={name}
                type="button"
                className={`chip ${picked.some((p) => fold(p) === fold(name)) ? 'on' : ''}`}
                aria-pressed={picked.some((p) => fold(p) === fold(name))}
                onClick={() => togglePicked(name)}
              >
                {name}
              </button>
            ))}
            <SingerModeToggle mode={mode} onChange={setMode} />
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Songs</h2>
          <span className="muted small">
            {filtered.length}
            {searching ? ` of ${songs.data?.length ?? 0}` : ''} · Enter opens the first
          </span>
        </div>
        <ul className="song-list practice-list">
          {filtered.map((s) => {
            const singers = singersBySong.get(s.id) ?? [];
            const missing = myInstrument !== null && partsFor(s, myInstrument).source === 'none';
            return (
              <li key={s.id}>
                <button className="song-row" onClick={() => open(s.id)}>
                  <span className="song-row-main">
                    <span className="song-title">{s.title}</span>
                    {singers.length > 0 && (
                      <span className="practice-singers">
                        <Mic size={12} />
                        {singers.map((n) => (
                          <span key={n} className={searching && singerHighlighted(n, query, picked) ? 'match' : ''}>
                            {n}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="song-row-meta">
                    {missing && (
                      <span className="pill warn" title="No sheet music for your instrument">
                        <AlertTriangle size={12} /> no sheet
                      </span>
                    )}
                    {s.key && <span className="pill">{s.key}</span>}
                    {s.bpm && <span className="pill">{s.bpm} bpm</span>}
                    <Play size={16} className="practice-play" />
                  </span>
                </button>
              </li>
            );
          })}
          {songs.data && filtered.length === 0 && (
            <li className="empty small">{songs.data.length ? 'No songs or singers match that.' : 'No songs yet.'}</li>
          )}
        </ul>
      </section>
    </div>
  );
}
