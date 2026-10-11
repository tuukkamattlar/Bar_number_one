/** 225 → "3:45", 3725 → "1:02:05" */
export function formatDuration(totalSec: number) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * "3:45" / "3.45" → 225, "4" → 240 (a bare number means minutes), "" → null.
 * Returns undefined when the text can't be read as a length.
 */
export function parseDuration(text: string): number | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const parts = t.split(/[:.,]/).map((p) => p.trim());
  if (parts.some((p) => !/^\d+$/.test(p)) || parts.length > 3) return undefined;
  const n = parts.map(Number);
  const sec = n.length === 1 ? n[0] * 60 : n.length === 2 ? n[0] * 60 + n[1] : n[0] * 3600 + n[1] * 60 + n[2];
  if (n.length > 1 && n[n.length - 1] >= 60) return undefined;
  return sec > 0 && sec <= 7200 ? sec : undefined;
}

/** Seconds counted between songs (count-ins, applause, tuning). */
export const GAP_BETWEEN_SONGS = 10;

/** Rounded to whole minutes for setlist totals: 3410 → "~57 min", 3900 → "~1 h 5 min". */
export function formatApproxMinutes(totalSec: number) {
  const min = Math.round(totalSec / 60);
  const h = Math.floor(min / 60);
  return h ? `~${h} h ${min % 60} min` : `~${min} min`;
}
