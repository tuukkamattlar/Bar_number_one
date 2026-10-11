import { useMemo, useState } from 'react';
import { Mic, Plus, Search, X } from 'lucide-react';
import type { Singer, Song } from '../api';
import { fold, matchesSearch, singerHighlighted, splitSingers, type SingerMode } from '../lib/singers';
import { SingerModeToggle } from './SingerModeToggle';
import { formatDuration } from '../lib/duration';

interface Props {
  songs: Song[];
  singers: Singer[];
  /** How many times each song is already in the setlist. */
  inSet: Map<number, number>;
  onAdd: (song: Song) => void;
  autoFocus?: boolean;
}

/**
 * Searchable song list for building a setlist. Typed words match titles and each
 * song's default singers; singer chips can be combined (songs where all of them sing).
 */
export function SongLibrary({ songs, singers, inSet, onAdd, autoFocus }: Props) {
  const [query, setQuery] = useState('');
  // Singers picked with the chips; a song has to have all of them.
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<SingerMode>('all');
  const togglePicked = (name: string) =>
    setPicked((list) => (list.some((n) => fold(n) === fold(name)) ? list.filter((n) => fold(n) !== fold(name)) : [...list, name]));
  const searching = Boolean(query.trim() || picked.length);
  const clear = () => {
    setQuery('');
    setPicked([]);
  };

  const filtered = useMemo(
    () =>
      [...songs]
        .sort((a, b) => a.title.localeCompare(b.title))
        .filter((s) => matchesSearch(s.title, splitSingers(s.singers ?? ''), query, picked, mode)),
    [songs, query, picked, mode],
  );

  return (
    <div className="song-library">
      <label className="search">
        <Search size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && searching && (e.stopPropagation(), clear())}
          placeholder="Search songs or singers"
          autoFocus={autoFocus}
          aria-label="Search songs or singers"
        />
        {searching && (
          <button type="button" className="btn ghost icon" onClick={clear} aria-label="Clear search">
            <X size={14} />
          </button>
        )}
      </label>
      {singers.length > 0 && (
        <div className="singer-chips">
          <Mic size={14} className="muted" />
          {singers.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`chip ${picked.some((p) => fold(p) === fold(s.name)) ? 'on' : ''}`}
              aria-pressed={picked.some((p) => fold(p) === fold(s.name))}
              onClick={() => togglePicked(s.name)}
            >
              {s.name}
            </button>
          ))}
          <SingerModeToggle mode={mode} onChange={setMode} />
        </div>
      )}
      <ul className="song-list">
        {filtered.map((s) => {
          const count = inSet.get(s.id) ?? 0;
          return (
            <li key={s.id}>
              <button className="song-row" onClick={() => onAdd(s)} title="Add to setlist">
                <span className="song-row-main">
                  <span className="song-title">{s.title}</span>
                  {s.singers && (
                    <span className="practice-singers">
                      <Mic size={12} />
                      {splitSingers(s.singers).map((n) => (
                        <span key={n} className={searching && singerHighlighted(n, query, picked) ? 'match' : ''}>
                          {n}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="song-row-meta">
                  {count > 0 && <span className="pill subtle">in set{count > 1 ? ` ×${count}` : ''}</span>}
                  {s.length_sec && <span className="muted small song-length">{formatDuration(s.length_sec)}</span>}
                  <Plus size={16} />
                </span>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="empty small">{songs.length ? 'No songs or singers match that.' : 'Your library is empty.'}</li>
        )}
      </ul>
    </div>
  );
}
