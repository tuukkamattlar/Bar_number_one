export interface Instrument {
  id: number;
  name: string;
  metronome: boolean;
  position: number;
}

export interface SongFile {
  id: number;
  song_id: number;
  /** null = for every instrument (full score / lead sheet) */
  instrument_id: number | null;
  filename: string;
  original_name: string;
  position: number;
}

export interface SongNote {
  /** null = for every instrument */
  instrument_id: number | null;
  text: string;
}

/** A sticky note pinned to a spot on a sheet: x/y are fractions of the page. */
export interface StickyNote {
  id: number;
  file_id: number;
  page: number;
  x: number;
  y: number;
  text: string;
  instrument_id: number | null;
}

export interface Singer {
  id: number;
  name: string;
}

export interface Song {
  id: number;
  title: string;
  bpm: number | null;
  beats: number;
  key: string | null;
  /** Default singers; a gig can override them per song. */
  singers: string | null;
  /** Playing time in seconds, for setlist timing. */
  length_sec: number | null;
  files: SongFile[];
  notes: SongNote[];
}

export type GigItem =
  | {
      id?: number;
      kind: 'song';
      song_id: number;
      text?: null;
      /** Who sings this song at this gig (free text). */
      singers?: string | null;
      /** Instrument that starts the song; null = the default (drums). */
      starter_id?: number | null;
    }
  | { id?: number; kind: 'text'; song_id?: null; text: string; singers?: null; starter_id?: null };

export interface Gig {
  id: number;
  name: string;
  date: string | null;
  instrument_id: number | null;
  song_count: number;
  items?: GigItem[];
}

export const fileUrl = (f: SongFile) => `/files/${f.song_id}/${encodeURIComponent(f.filename)}`;

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  instruments: () => request<Instrument[]>('GET', '/api/instruments'),
  createInstrument: (data: Partial<Instrument>) => request<Instrument>('POST', '/api/instruments', data),
  updateInstrument: (id: number, data: Partial<Instrument>) => request<Instrument>('PATCH', `/api/instruments/${id}`, data),
  deleteInstrument: (id: number) => request<void>('DELETE', `/api/instruments/${id}`),

  songs: () => request<Song[]>('GET', '/api/songs'),
  stickyNotes: () => request<StickyNote[]>('GET', '/api/sticky-notes'),
  createStickyNote: (data: Omit<StickyNote, 'id'>) => request<StickyNote>('POST', '/api/sticky-notes', data),
  updateStickyNote: (id: number, data: Partial<StickyNote>) => request<StickyNote>('PATCH', `/api/sticky-notes/${id}`, data),
  deleteStickyNote: (id: number) => request<void>('DELETE', `/api/sticky-notes/${id}`),
  singers: () => request<Singer[]>('GET', '/api/singers'),
  createSinger: (name: string) => request<Singer[]>('POST', '/api/singers', { name }),
  renameSinger: (id: number, name: string) => request<Singer[]>('PATCH', `/api/singers/${id}`, { name }),
  deleteSinger: (id: number) => request<Singer[]>('DELETE', `/api/singers/${id}`),
  songSingers: () => request<{ song_id: number; singers: string }[]>('GET', '/api/song-singers'),
  createSong: (data: Partial<Song>) => request<Song>('POST', '/api/songs', data),
  updateSong: (id: number, data: Partial<Song>) => request<Song>('PATCH', `/api/songs/${id}`, data),
  setNote: (songId: number, instrument_id: number | null, text: string) =>
    request<Song>('PUT', `/api/songs/${songId}/notes`, { instrument_id, text }),
  deleteSong: (id: number) => request<void>('DELETE', `/api/songs/${id}`),
  uploadFiles: (songId: number, files: File[], instrument: number | null | 'auto') => {
    const form = new FormData();
    form.append('instrument_id', instrument === null ? '' : String(instrument));
    files.forEach((f) => form.append('files', f));
    return request<Song>('POST', `/api/songs/${songId}/files`, form);
  },
  updateFile: (id: number, data: Partial<SongFile>) => request<Song>('PATCH', `/api/files/${id}`, data),
  deleteFile: (id: number) => request<Song>('DELETE', `/api/files/${id}`),

  gigs: () => request<Gig[]>('GET', '/api/gigs'),
  gig: (id: number) => request<Gig>('GET', `/api/gigs/${id}`),
  createGig: (data: Partial<Gig> & { copy_from?: number | null }) => request<Gig>('POST', '/api/gigs', data),
  updateGig: (id: number, data: Partial<Gig>) => request<Gig>('PATCH', `/api/gigs/${id}`, data),
  deleteGig: (id: number) => request<void>('DELETE', `/api/gigs/${id}`),
  saveGigItems: (id: number, items: GigItem[]) => request<Gig>('PUT', `/api/gigs/${id}/items`, { items }),
};
