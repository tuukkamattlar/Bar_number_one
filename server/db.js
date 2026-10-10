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

    CREATE TABLE IF NOT EXISTS songs (
      id         INTEGER PRIMARY KEY,
      title      TEXT NOT NULL,
      bpm        INTEGER,
      beats      INTEGER NOT NULL DEFAULT 4,
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
      text     TEXT
    );
  `);

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
