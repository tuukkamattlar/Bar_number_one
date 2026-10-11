import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, transaction } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const LIBRARY_DIR = path.join(DATA_DIR, 'library');
const PORT = Number(process.env.PORT ?? 3001);

fs.mkdirSync(LIBRARY_DIR, { recursive: true });
const db = openDb(DATA_DIR);

const app = express();
app.use(express.json());

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const id = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id');
  return n;
};
const optionalInt = (value) => (value === null || value === undefined || value === '' ? null : Math.round(Number(value)));
const songDir = (songId) => path.join(LIBRARY_DIR, String(songId));

// ---------- Instruments ----------

const listInstruments = () => db.prepare('SELECT * FROM instruments ORDER BY position, id').all().map(toInstrument);
const toInstrument = (row) => ({ ...row, metronome: Boolean(row.metronome) });

app.get('/api/instruments', (_req, res) => res.json(listInstruments()));

app.post('/api/instruments', (req, res) => {
  const name = String(req.body.name ?? '').trim();
  if (!name) throw new HttpError(400, 'Name is required');
  const { pos } = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM instruments').get();
  const r = db
    .prepare('INSERT INTO instruments (name, metronome, position) VALUES (?, ?, ?)')
    .run(name, req.body.metronome ? 1 : 0, pos);
  res.status(201).json(toInstrument(db.prepare('SELECT * FROM instruments WHERE id = ?').get(r.lastInsertRowid)));
});

app.patch('/api/instruments/:id', (req, res) => {
  const instrumentId = id(req.params.id);
  const current = db.prepare('SELECT * FROM instruments WHERE id = ?').get(instrumentId);
  if (!current) throw new HttpError(404, 'Instrument not found');
  const name = req.body.name !== undefined ? String(req.body.name).trim() : current.name;
  if (!name) throw new HttpError(400, 'Name is required');
  const metronome = req.body.metronome !== undefined ? (req.body.metronome ? 1 : 0) : current.metronome;
  db.prepare('UPDATE instruments SET name = ?, metronome = ? WHERE id = ?').run(name, metronome, instrumentId);
  res.json(toInstrument(db.prepare('SELECT * FROM instruments WHERE id = ?').get(instrumentId)));
});

app.delete('/api/instruments/:id', (req, res) => {
  const instrumentId = id(req.params.id);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM song_files WHERE instrument_id = ?').get(instrumentId);
  if (n > 0) throw new HttpError(409, `This instrument still has ${n} part(s). Reassign or delete them first.`);
  db.prepare('DELETE FROM instruments WHERE id = ?').run(instrumentId);
  res.status(204).end();
});

// ---------- Singers (a pick-list) ----------

const listSingers = () => db.prepare('SELECT * FROM singers ORDER BY position, id').all();

app.get('/api/singers', (_req, res) => res.json(listSingers()));

app.post('/api/singers', (req, res) => {
  const name = cleanSingers(req.body.name).slice(0, 60);
  if (!name) throw new HttpError(400, 'Name is required');
  if (db.prepare('SELECT 1 FROM singers WHERE name = ?').get(name)) throw new HttpError(409, `${name} is already on the list`);
  const { pos } = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM singers').get();
  db.prepare('INSERT INTO singers (name, position) VALUES (?, ?)').run(name, pos);
  res.status(201).json(listSingers());
});

app.patch('/api/singers/:id', (req, res) => {
  const singerId = id(req.params.id);
  if (!db.prepare('SELECT 1 FROM singers WHERE id = ?').get(singerId)) throw new HttpError(404, 'Singer not found');
  const name = cleanSingers(req.body.name).slice(0, 60);
  if (!name) throw new HttpError(400, 'Name is required');
  const clash = db.prepare('SELECT 1 FROM singers WHERE name = ? AND id != ?').get(name, singerId);
  if (clash) throw new HttpError(409, `${name} is already on the list`);
  db.prepare('UPDATE singers SET name = ? WHERE id = ?').run(name, singerId);
  res.json(listSingers());
});

app.delete('/api/singers/:id', (req, res) => {
  db.prepare('DELETE FROM singers WHERE id = ?').run(id(req.params.id));
  res.json(listSingers());
});

// ---------- Songs ----------

function listSongs() {
  const songs = db.prepare('SELECT id, title, bpm, beats, "key", singers, length_sec, created_at FROM songs ORDER BY title COLLATE NOCASE').all();
  const files = db.prepare('SELECT * FROM song_files ORDER BY position, id').all();
  const notes = db.prepare('SELECT song_id, instrument_id, text FROM song_notes').all();
  const bySong = new Map(songs.map((s) => [s.id, { ...s, files: [], notes: [] }]));
  for (const f of files) bySong.get(f.song_id)?.files.push(f);
  for (const n of notes) bySong.get(n.song_id)?.notes.push({ instrument_id: n.instrument_id, text: n.text });
  return [...bySong.values()];
}
const getSong = (songId) => listSongs().find((s) => s.id === songId);

/** New songs start at 3 minutes until someone sets the real length. */
const DEFAULT_SONG_LENGTH = 180;

/** Singer names as free text, e.g. "Anna, Ville". */
const cleanSingers = (value) => String(value ?? '').trim().slice(0, 200);

/** Musical key as free text, e.g. "Am" or "F#". Empty means unknown. */
const optionalKey = (value) => String(value ?? '').trim().slice(0, 12) || null;

app.get('/api/songs', (_req, res) => res.json(listSongs()));

app.post('/api/songs', (req, res) => {
  const title = String(req.body.title ?? '').trim();
  if (!title) throw new HttpError(400, 'Title is required');
  const r = db
    .prepare('INSERT INTO songs (title, bpm, beats, "key", singers, length_sec) VALUES (?, ?, ?, ?, ?, ?)')
    .run(
      title,
      optionalInt(req.body.bpm),
      optionalInt(req.body.beats) ?? 4,
      optionalKey(req.body.key),
      cleanSingers(req.body.singers) || null,
      req.body.length_sec !== undefined ? optionalInt(req.body.length_sec) : DEFAULT_SONG_LENGTH,
    );
  res.status(201).json(getSong(Number(r.lastInsertRowid)));
});

app.patch('/api/songs/:id', (req, res) => {
  const songId = id(req.params.id);
  const current = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
  if (!current) throw new HttpError(404, 'Song not found');
  const next = {
    title: req.body.title !== undefined ? String(req.body.title).trim() || current.title : current.title,
    bpm: req.body.bpm !== undefined ? optionalInt(req.body.bpm) : current.bpm,
    beats: req.body.beats !== undefined ? optionalInt(req.body.beats) ?? 4 : current.beats,
    key: req.body.key !== undefined ? optionalKey(req.body.key) : current.key,
    singers: req.body.singers !== undefined ? cleanSingers(req.body.singers) || null : current.singers,
    length_sec: req.body.length_sec !== undefined ? optionalInt(req.body.length_sec) : current.length_sec,
  };
  if (next.length_sec !== null && (next.length_sec < 1 || next.length_sec > 7200)) {
    throw new HttpError(400, 'Length must be between 0:01 and 2:00:00');
  }
  if (next.bpm !== null && (next.bpm < 20 || next.bpm > 400)) throw new HttpError(400, 'BPM must be 20–400');
  if (next.beats < 1 || next.beats > 16) throw new HttpError(400, 'Beats per bar must be 1–16');
  db.prepare('UPDATE songs SET title = ?, bpm = ?, beats = ?, "key" = ?, singers = ?, length_sec = ? WHERE id = ?').run(
    next.title,
    next.bpm,
    next.beats,
    next.key,
    next.singers,
    next.length_sec,
    songId,
  );
  res.json(getSong(songId));
});

/** Set the note for one instrument (instrument_id null = everyone). Empty text removes it. */
app.put('/api/songs/:id/notes', (req, res) => {
  const songId = id(req.params.id);
  if (!db.prepare('SELECT 1 FROM songs WHERE id = ?').get(songId)) throw new HttpError(404, 'Song not found');
  const instrumentId = optionalInt(req.body.instrument_id);
  const text = String(req.body.text ?? '').trim();
  transaction(db, () => {
    db.prepare('DELETE FROM song_notes WHERE song_id = ? AND instrument_id IS ?').run(songId, instrumentId);
    if (text) {
      db.prepare('INSERT INTO song_notes (song_id, instrument_id, text) VALUES (?, ?, ?)').run(songId, instrumentId, text);
    }
  });
  res.json(getSong(songId));
});

app.delete('/api/songs/:id', (req, res) => {
  const songId = id(req.params.id);
  db.prepare('DELETE FROM songs WHERE id = ?').run(songId);
  fs.rmSync(songDir(songId), { recursive: true, force: true });
  res.status(204).end();
});

// ---------- Song files (PDF parts) ----------

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = songDir(req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      // Multer hands over latin1-decoded names; fix so "Kesäyö.pdf" survives.
      file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const base = path
        .basename(file.originalname, path.extname(file.originalname))
        .replace(/[^\p{L}\p{N}._ -]+/gu, '_')
        .slice(0, 80);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${base}.pdf`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    cb(ok ? null : new HttpError(400, 'Only PDF files are supported'), ok);
  },
  limits: { fileSize: 100 * 1024 * 1024 },
});

/** "auto": match an instrument name inside the file name, e.g. "Hotel California - Drums.pdf". */
function resolveInstrument(value, originalName) {
  if (value === 'auto') {
    const lower = originalName.toLowerCase();
    const match = listInstruments()
      .sort((a, b) => b.name.length - a.name.length)
      .find((i) => lower.includes(i.name.toLowerCase()));
    return match?.id ?? null;
  }
  return optionalInt(value);
}

app.post('/api/songs/:id/files', (req, res, next) => {
  const songId = id(req.params.id);
  if (!db.prepare('SELECT 1 FROM songs WHERE id = ?').get(songId)) throw new HttpError(404, 'Song not found');
  upload.array('files')(req, res, (err) => {
    if (err) return next(err);
    const files = req.files ?? [];
    try {
      transaction(db, () => {
        const { pos } = db
          .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM song_files WHERE song_id = ?')
          .get(songId);
        const insert = db.prepare(
          'INSERT INTO song_files (song_id, instrument_id, filename, original_name, position) VALUES (?, ?, ?, ?, ?)',
        );
        files.forEach((f, i) =>
          insert.run(songId, resolveInstrument(req.body.instrument_id, f.originalname), f.filename, f.originalname, pos + i),
        );
      });
    } catch (e) {
      files.forEach((f) => fs.rmSync(f.path, { force: true }));
      return next(e);
    }
    res.status(201).json(getSong(songId));
  });
});

app.patch('/api/files/:id', (req, res) => {
  const fileId = id(req.params.id);
  const file = db.prepare('SELECT * FROM song_files WHERE id = ?').get(fileId);
  if (!file) throw new HttpError(404, 'File not found');
  if (req.body.instrument_id !== undefined) {
    db.prepare('UPDATE song_files SET instrument_id = ? WHERE id = ?').run(optionalInt(req.body.instrument_id), fileId);
  }
  if (req.body.position !== undefined) {
    db.prepare('UPDATE song_files SET position = ? WHERE id = ?').run(optionalInt(req.body.position) ?? 0, fileId);
  }
  res.json(getSong(file.song_id));
});

app.delete('/api/files/:id', (req, res) => {
  const fileId = id(req.params.id);
  const file = db.prepare('SELECT * FROM song_files WHERE id = ?').get(fileId);
  if (!file) throw new HttpError(404, 'File not found');
  db.prepare('DELETE FROM song_files WHERE id = ?').run(fileId);
  fs.rmSync(path.join(songDir(file.song_id), file.filename), { force: true });
  res.json(getSong(file.song_id));
});

app.use('/files', express.static(LIBRARY_DIR, { maxAge: '1h' }));

// ---------- Sticky notes on sheet music ----------

const clampFraction = (v) => Math.min(1, Math.max(0, Number(v)));
const noteText = (v) => String(v ?? '').trim().slice(0, 500);

app.get('/api/sticky-notes', (_req, res) => res.json(db.prepare('SELECT * FROM sticky_notes ORDER BY id').all()));

app.post('/api/sticky-notes', (req, res) => {
  const fileId = id(req.body.file_id);
  if (!db.prepare('SELECT 1 FROM song_files WHERE id = ?').get(fileId)) throw new HttpError(404, 'Sheet not found');
  const text = noteText(req.body.text);
  if (!text) throw new HttpError(400, 'A note needs some text');
  const x = clampFraction(req.body.x);
  const y = clampFraction(req.body.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new HttpError(400, 'Bad position');
  const instrument = optionalInt(req.body.instrument_id);
  const known = instrument !== null && db.prepare('SELECT 1 FROM instruments WHERE id = ?').get(instrument);
  const r = db
    .prepare('INSERT INTO sticky_notes (file_id, page, x, y, text, instrument_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(fileId, Math.max(1, optionalInt(req.body.page) ?? 1), x, y, text, known ? instrument : null);
  res.status(201).json(db.prepare('SELECT * FROM sticky_notes WHERE id = ?').get(r.lastInsertRowid));
});

app.patch('/api/sticky-notes/:id', (req, res) => {
  const noteId = id(req.params.id);
  const current = db.prepare('SELECT * FROM sticky_notes WHERE id = ?').get(noteId);
  if (!current) throw new HttpError(404, 'Note not found');
  const text = req.body.text !== undefined ? noteText(req.body.text) : current.text;
  if (!text) throw new HttpError(400, 'A note needs some text');
  const x = req.body.x !== undefined ? clampFraction(req.body.x) : current.x;
  const y = req.body.y !== undefined ? clampFraction(req.body.y) : current.y;
  db.prepare('UPDATE sticky_notes SET text = ?, x = ?, y = ? WHERE id = ?').run(text, x, y, noteId);
  res.json(db.prepare('SELECT * FROM sticky_notes WHERE id = ?').get(noteId));
});

app.delete('/api/sticky-notes/:id', (req, res) => {
  db.prepare('DELETE FROM sticky_notes WHERE id = ?').run(id(req.params.id));
  res.status(204).end();
});

// ---------- Gigs ----------

const gigSummarySql = `
  SELECT g.id, g.name, g.date, g.instrument_id, g.created_at,
    (SELECT COUNT(*) FROM gig_items i WHERE i.gig_id = g.id AND i.kind = 'song') AS song_count
  FROM gigs g`;

function getGig(gigId) {
  const gig = db.prepare(`${gigSummarySql} WHERE g.id = ?`).get(gigId);
  if (!gig) throw new HttpError(404, 'Gig not found');
  gig.items = db.prepare('SELECT * FROM gig_items WHERE gig_id = ? ORDER BY position').all(gigId);
  return gig;
}

/** Gig-specific singers per song (on top of each song's default singers), for searching. */
app.get('/api/song-singers', (_req, res) =>
  res.json(
    db
      .prepare(
        "SELECT DISTINCT song_id, singers FROM gig_items WHERE kind = 'song' AND singers IS NOT NULL AND singers != ''",
      )
      .all(),
  ),
);

app.get('/api/gigs', (_req, res) => {
  res.json(db.prepare(`${gigSummarySql} ORDER BY COALESCE(g.date, '9999') DESC, g.id DESC`).all());
});

app.get('/api/gigs/:id', (req, res) => res.json(getGig(id(req.params.id))));

app.post('/api/gigs', (req, res) => {
  const name = String(req.body.name ?? '').trim();
  if (!name) throw new HttpError(400, 'Name is required');
  const copyFrom = optionalInt(req.body.copy_from);
  if (copyFrom !== null) getGig(copyFrom); // 404 if the source gig is gone
  const gigId = transaction(db, () => {
    const r = db
      .prepare('INSERT INTO gigs (name, date, instrument_id) VALUES (?, ?, ?)')
      .run(name, req.body.date || null, optionalInt(req.body.instrument_id));
    const newId = Number(r.lastInsertRowid);
    // Start from another gig's setlist: same songs, notes, order, singers and starters.
    if (copyFrom !== null) {
      db.prepare(
        `INSERT INTO gig_items (gig_id, position, kind, song_id, text, singers, starter_id)
         SELECT ?, position, kind, song_id, text, singers, starter_id FROM gig_items WHERE gig_id = ? ORDER BY position`,
      ).run(newId, copyFrom);
    }
    return newId;
  });
  res.status(201).json(getGig(gigId));
});

app.patch('/api/gigs/:id', (req, res) => {
  const gigId = id(req.params.id);
  const current = getGig(gigId);
  db.prepare('UPDATE gigs SET name = ?, date = ?, instrument_id = ? WHERE id = ?').run(
    req.body.name !== undefined ? String(req.body.name).trim() || current.name : current.name,
    req.body.date !== undefined ? req.body.date || null : current.date,
    req.body.instrument_id !== undefined ? optionalInt(req.body.instrument_id) : current.instrument_id,
    gigId,
  );
  res.json(getGig(gigId));
});

app.delete('/api/gigs/:id', (req, res) => {
  db.prepare('DELETE FROM gigs WHERE id = ?').run(id(req.params.id));
  res.status(204).end();
});

/** Replace the whole setlist in one go – simplest way to persist drag & drop reordering. */
app.put('/api/gigs/:id/items', (req, res) => {
  const gigId = id(req.params.id);
  getGig(gigId);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  transaction(db, () => {
    db.prepare('DELETE FROM gig_items WHERE gig_id = ?').run(gigId);
    const insert = db.prepare(
      'INSERT INTO gig_items (gig_id, position, kind, song_id, text, singers, starter_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const instrumentIds = new Set(listInstruments().map((i) => i.id));
    items.forEach((item, i) => {
      if (item.kind === 'song') {
        // null keeps the song's default singers; any string (even empty) is this gig's own choice.
        const singers = item.singers === null || item.singers === undefined ? null : cleanSingers(item.singers);
        const starter = optionalInt(item.starter_id);
        insert.run(gigId, i, 'song', id(item.song_id), null, singers, instrumentIds.has(starter) ? starter : null);
      } else insert.run(gigId, i, 'text', null, String(item.text ?? ''), null, null);
    });
  });
  res.json(getGig(gigId));
});

// ---------- Production: serve the built frontend ----------

const DIST = path.join(ROOT, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('/{*splat}', (req, res, next) =>
    req.path.startsWith('/api') ? next() : res.sendFile(path.join(DIST, 'index.html')),
  );
}

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

app.use((err, _req, res, _next) => {
  const status = err.status ?? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message ?? 'Something went wrong' });
});

app.listen(PORT, () => console.log(`Bar Number One API on http://localhost:${PORT} (data: ${DATA_DIR})`));
