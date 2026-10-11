import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'bar1.db'));
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS instruments (
      id        INTEGER PRIMARY KEY,
      name      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      metronome INTEGER NOT NULL DEFAULT 0,
      position  INTEGER NOT NULL DEFAULT 0
    );

    -- The band's singers: only a pick-list for filling in "singers" fields, never required.
    CREATE TABLE IF NOT EXISTS singers (
      id       INTEGER PRIMARY KEY,
      name     TEXT NOT NULL UNIQUE COLLATE NOCASE,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS songs (
      id         INTEGER PRIMARY KEY,
      title      TEXT NOT NULL,
      bpm        INTEGER,
      beats      INTEGER NOT NULL DEFAULT 4,
      "key"      TEXT,
      singers    TEXT, -- default singers; a gig can override them per song
      length_sec INTEGER, -- how long the song takes to play, for setlist timing
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- instrument_id NULL means "for everyone" (full score / lead sheet).
    -- Deleting an instrument that still has parts is blocked by the FK.
    CREATE TABLE IF NOT EXISTS song_files (
      id            INTEGER PRIMARY KEY,
      song_id       INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      instrument_id INTEGER REFERENCES instruments(id),
      filename      TEXT NOT NULL,
      original_name TEXT NOT NULL,
      position      INTEGER NOT NULL DEFAULT 0
    );

    -- Sticky notes pinned to a spot on a PDF page. x/y are fractions of the page (0–1),
    -- so they stay put at any screen size. Deleting the PDF deletes its notes.
    CREATE TABLE IF NOT EXISTS sticky_notes (
      id            INTEGER PRIMARY KEY,
      file_id       INTEGER NOT NULL REFERENCES song_files(id) ON DELETE CASCADE,
      page          INTEGER NOT NULL,
      x             REAL NOT NULL,
      y             REAL NOT NULL,
      text          TEXT NOT NULL,
      instrument_id INTEGER REFERENCES instruments(id) ON DELETE SET NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gigs (
      id            INTEGER PRIMARY KEY,
      name          TEXT NOT NULL,
      date          TEXT,
      instrument_id INTEGER REFERENCES instruments(id) ON DELETE SET NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Free-text notes per song: instrument_id NULL = for everyone, otherwise for that instrument only.
    CREATE TABLE IF NOT EXISTS song_notes (
      id            INTEGER PRIMARY KEY,
      song_id       INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      instrument_id INTEGER REFERENCES instruments(id) ON DELETE CASCADE,
      text          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gig_items (
      id       INTEGER PRIMARY KEY,
      gig_id   INTEGER NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      kind     TEXT NOT NULL CHECK (kind IN ('song', 'text')),
      song_id  INTEGER REFERENCES songs(id) ON DELETE CASCADE,
      text     TEXT,
      -- Per-gig song details. singers: NULL = the song's default singers, '' = nobody, text = custom.
      -- starter_id: which instrument counts it in (NULL = the default, drums).
      singers    TEXT,
      starter_id INTEGER REFERENCES instruments(id) ON DELETE SET NULL
    );
  `);

  // Columns added after the first release.
  const songColumns = db.prepare('PRAGMA table_info(songs)').all().map((c) => c.name);
  if (!songColumns.includes('key')) db.exec('ALTER TABLE songs ADD COLUMN "key" TEXT');
  if (!songColumns.includes('singers')) db.exec('ALTER TABLE songs ADD COLUMN singers TEXT');
  if (!songColumns.includes('length_sec')) db.exec('ALTER TABLE songs ADD COLUMN length_sec INTEGER');
  const itemColumns = db.prepare('PRAGMA table_info(gig_items)').all().map((c) => c.name);
  if (!itemColumns.includes('singers')) db.exec('ALTER TABLE gig_items ADD COLUMN singers TEXT');
  if (!itemColumns.includes('starter_id')) {
    db.exec('ALTER TABLE gig_items ADD COLUMN starter_id INTEGER REFERENCES instruments(id) ON DELETE SET NULL');
  }

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM instruments').get();
  if (n === 0) {
    const insert = db.prepare('INSERT INTO instruments (name, metronome, position) VALUES (?, ?, ?)');
    [
      ['Vocals', 0],
      ['Guitar', 0],
      ['Bass', 0],
      ['Keys', 0],
      ['Drums', 1],
    ].forEach(([name, metronome], i) => insert.run(name, metronome, i));
  }

  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
