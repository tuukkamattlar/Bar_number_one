import type { Instrument, Song, SongFile } from '../api';

export type PartSource = 'instrument' | 'general' | 'none';

/**
 * Which PDFs to show for a song, given the chosen instrument.
 * Never throws: falls back from the instrument's own part, to "all instruments" files, to nothing.
 */
export function partsFor(song: Song, instrumentId: number | null): { files: SongFile[]; source: PartSource } {
  const sorted = [...song.files].sort((a, b) => a.position - b.position || a.id - b.id);
  if (instrumentId !== null) {
    const own = sorted.filter((f) => f.instrument_id === instrumentId);
    if (own.length) return { files: own, source: 'instrument' };
  }
  const general = sorted.filter((f) => f.instrument_id === null);
  if (general.length) return { files: general, source: 'general' };
  return { files: [], source: 'none' };
}

/** Notes to show for a song: the shared one first, then the instrument's own. */
export function notesFor(song: Song, instrumentId: number | null) {
  const shared = song.notes.find((n) => n.instrument_id === null)?.text ?? '';
  const own = instrumentId === null ? '' : (song.notes.find((n) => n.instrument_id === instrumentId)?.text ?? '');
  return { shared, own };
}

export function instrumentName(instruments: Instrument[], id: number | null | undefined) {
  if (id === null || id === undefined) return 'All instruments';
  return instruments.find((i) => i.id === id)?.name ?? 'Unknown instrument';
}

/** Songs are started by the drums unless a gig says otherwise. */
export function defaultStarterId(instruments: Instrument[]) {
  return (
    instruments.find((i) => i.name.trim().toLowerCase() === 'drums')?.id ??
    instruments.find((i) => i.metronome)?.id ??
    null
  );
}

export function starterIdFor(item: { starter_id?: number | null }, instruments: Instrument[]) {
  const known = item.starter_id != null && instruments.some((i) => i.id === item.starter_id);
  return known ? item.starter_id! : defaultStarterId(instruments);
}
