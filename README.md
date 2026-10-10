# Bar Number One

Sheet music on stage. Keep a library of songs with PDFs and notes per instrument, build setlists for gigs, and play them back in a full-screen show mode with a silent visual metronome.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (API on :3001)
```

For a single-process build (e.g. on the gig laptop):

```bash
npm run build
npm start          # http://localhost:3001
```

### One-click start (macOS)

`scripts/start-app.sh` opens the app in Chrome and starts the server first if it isn't running. If the code changed since the last build, it rebuilds first. The server runs in the background and logs to `~/Library/Logs/BarNumberOne.log`. To make a Desktop icon for it:

```bash
osacompile -o ~/Desktop/"Bar Number One.app" -e 'do shell script quoted form of "'"$PWD"'/scripts/start-app.sh" & " > /dev/null 2>&1"'
```

To stop the background server: `pkill -f "node server/index.js"`.

## Views

- **Songs**: title, tempo (BPM), beats per bar, notes, and PDFs. Notes can be for *Everyone* or for one instrument. In show mode you see the shared note plus your instrument's note in the top-left corner. Each PDF is either for one instrument or for *All instruments* (full score / lead sheet). With *Auto*, the instrument is guessed from the file name (`Highway Star - Drums.pdf` → Drums). The coverage row shows which instruments have their own part.
- **Gigs**: create a gig, then drag songs and notes ("Break", "Encore", or anything) into order. Gigs aren't tied to an instrument: each device remembers the instrument last picked in the gig editor or show mode, so the same setlist works for the whole band.
- **Show**: one page fills the screen; two pages sit side by side (on a portrait screen, one at a time). Each song starts on a new screen.
- **Instruments**: add or rename instruments and choose which ones show the metronome (Drums by default).

### Show mode keys

| Key | Action |
| --- | --- |
| Space, →, ↓, PageDown, Enter, click on the right side | Next |
| Shift+Space, ←, ↑, PageUp, click on the left side | Previous |
| Home / End | First / last |
| M | Toggle metronome: red = beat 1, cyan = other beats (tap it to restart on beat 1) |
| N | Toggle song notes |
| I | Toggle dark pages (inverted colours, display only; remembered on this device) |
| F | Fullscreen |
| Esc | Back to the setlist |

Bluetooth page-turner pedals usually send PageDown/PageUp or arrow keys, so they work out of the box.

### Fallbacks

For each song, show mode uses the chosen instrument's part. If there isn't one, it uses the *All instruments* PDF. If there's nothing at all, or a PDF won't open, it shows a card with the song title and tempo instead of breaking.

## Data

Everything lives in `data/` (git-ignored):

- `data/bar1.db`: SQLite database (instruments, songs, gigs, setlists), using Node's built-in `node:sqlite` (Node 22.5+)
- `data/library/<songId>/*.pdf`: uploaded sheet music, one folder per song

Set `DATA_DIR` to keep it somewhere else, e.g. a synced folder. Keep the path short on Windows, because SQLite fails on very long paths. Set `PORT` to move the API off 3001; the dev proxy follows it.

## Stack

React + TypeScript + Vite, pdf.js for rendering, dnd-kit for drag & drop, and Express + SQLite for the small local API in `server/`.
