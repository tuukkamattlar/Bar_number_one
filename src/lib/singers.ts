/** Lowercase and drop accents, so "hae" finds "Häissä" and "ville" finds "Ville". */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** "Anna & Ville, Pekka" → ["Anna", "Ville", "Pekka"] */
export const splitSingers = (raw: string) =>
  raw
    .split(/\s*(?:,|&|\/|\+|\bja\b|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

/** Add the name to a singers text, or take it out if it's already there. */
export function toggleSinger(raw: string, name: string) {
  const names = splitSingers(raw);
  const has = names.some((n) => fold(n) === fold(name));
  return (has ? names.filter((n) => fold(n) !== fold(name)) : [...names, name]).join(', ');
}

export const hasSinger = (raw: string, name: string) => splitSingers(raw).some((n) => fold(n) === fold(name));

/** Search words, split on spaces and the usual separators: "kalle & mari" → ["kalle", "mari"]. */
export const searchTerms = (query: string) => fold(query).split(/[\s,&+/]+/).filter(Boolean);

/** How picked singers combine: songs where all of them sing, or any of them. */
export type SingerMode = 'all' | 'any';

/**
 * Does a song match the search? Every typed word has to be found in the title or in a
 * singer's name. Picked singers must all be among the song's singers ('all'), or at
 * least one of them ('any'). So "kalle mari", or picking Kalle and Marianna, finds the
 * songs both of them sing.
 */
export function matchesSearch(
  title: string,
  singers: string[],
  query: string,
  picked: string[] = [],
  mode: SingerMode = 'all',
) {
  const names = singers.map(fold);
  const sings = (p: string) => names.includes(fold(p));
  if (picked.length && !(mode === 'all' ? picked.every(sings) : picked.some(sings))) return false;
  const t = fold(title);
  return searchTerms(query).every((term) => t.includes(term) || names.some((n) => n.includes(term)));
}

/** Should this singer name be highlighted for the current search? */
export const singerHighlighted = (name: string, query: string, picked: string[] = []) =>
  picked.some((p) => fold(p) === fold(name)) || searchTerms(query).some((term) => fold(name).includes(term));
