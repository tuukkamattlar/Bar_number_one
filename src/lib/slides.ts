import { fileUrl, type GigItem, type Song } from '../api';
import { loadPdf } from './pdf';
import { partsFor, type PartSource } from './parts';

export interface PageRef {
  url: string;
  page: number;
}

/** One "screen" in show mode. `item` is the setlist index it belongs to. */
export type Slide =
  | { kind: 'pages'; item: number; song: Song; pages: PageRef[]; part: number; partCount: number; source: PartSource }
  | { kind: 'text'; item: number; text: string }
  | { kind: 'empty'; item: number; song: Song | null; reason: string; noPart?: boolean };

/** Page counts of all files involved, loaded in parallel. A broken PDF resolves to an Error instead of rejecting. */
export async function loadPageCounts(urls: string[]): Promise<Map<string, number | Error>> {
  const unique = [...new Set(urls)];
  const results = await Promise.allSettled(unique.map((u) => loadPdf(u).then((d) => d.numPages)));
  return new Map(
    unique.map((u, i) => {
      const r = results[i];
      return [u, r.status === 'fulfilled' ? r.value : new Error(String(r.reason?.message ?? r.reason))];
    }),
  );
}

export function urlsFor(items: GigItem[], songs: Map<number, Song>, instrumentId: number | null) {
  return items.flatMap((item) => {
    const song = item.kind === 'song' ? songs.get(item.song_id) : undefined;
    return song ? partsFor(song, instrumentId).files.map(fileUrl) : [];
  });
}

/**
 * Turns a setlist into screens. Each song starts on a fresh screen and its pages
 * are grouped `perView` at a time. Anything missing or broken becomes a readable
 * placeholder screen rather than an error.
 */
export function buildSlides(
  items: GigItem[],
  songs: Map<number, Song>,
  instrumentId: number | null,
  instrumentLabel: string,
  pageCounts: Map<string, number | Error>,
  perView: number,
): Slide[] {
  const slides: Slide[] = [];

  items.forEach((item, index) => {
    if (item.kind === 'text') {
      slides.push({ kind: 'text', item: index, text: item.text || '…' });
      return;
    }
    const song = songs.get(item.song_id) ?? null;
    if (!song) {
      slides.push({ kind: 'empty', item: index, song: null, reason: 'This song was removed from the library.' });
      return;
    }

    const { files, source } = partsFor(song, instrumentId);
    const pages: PageRef[] = [];
    const broken: string[] = [];
    for (const f of files) {
      const url = fileUrl(f);
      const count = pageCounts.get(url);
      if (typeof count === 'number') for (let p = 1; p <= count; p++) pages.push({ url, page: p });
      else broken.push(f.original_name);
    }

    if (pages.length === 0) {
      slides.push({
        kind: 'empty',
        item: index,
        song,
        reason: broken.length
          ? `Couldn’t open ${broken.join(', ')}.`
          : `No sheet music for ${instrumentLabel}.`,
        noPart: broken.length === 0,
      });
      return;
    }

    const partCount = Math.ceil(pages.length / perView);
    for (let p = 0; p < partCount; p++) {
      slides.push({
        kind: 'pages',
        item: index,
        song,
        pages: pages.slice(p * perView, (p + 1) * perView),
        part: p,
        partCount,
        source,
      });
    }
  });

  // Every gig ends with a send-off screen; its `item` points just past the setlist.
  if (items.some((i) => i.kind === 'song')) slides.push({ kind: 'text', item: items.length, text: 'Onnea roudaukseen :))' });

  return slides;
}
