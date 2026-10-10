#!/bin/zsh
# Start Bar Number One (if it isn't running yet) and open it in Chrome.
# Used by the Desktop launcher; safe to run any number of times.

REPO="${0:A:h:h}"
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
LOG="$HOME/Library/Logs/BarNumberOne.log"
PORT="${PORT:-3001}"
DEV_PORT="${DEV_PORT:-5173}"

open_app() {
  open -a "Google Chrome" "$1" 2>/dev/null || open "$1"
  exit 0
}

serves_page() { curl -fs -m 2 "$1" 2>/dev/null | grep -qi '<html'; }

# Already running? The dev server (npm run dev) wins, otherwise the built app.
serves_page "http://localhost:$DEV_PORT/" && open_app "http://localhost:$DEV_PORT/"
serves_page "http://localhost:$PORT/" && open_app "http://localhost:$PORT/"

if curl -fs -m 2 "http://localhost:$PORT/api/instruments" >/dev/null 2>&1; then
  osascript -e 'display alert "Bar Number One" message "Port '"$PORT"' is busy with an API that has no built app. Stop the other server (or run npm run build) and try again."'
  exit 1
fi

if ! command -v node >/dev/null; then
  osascript -e 'display alert "Bar Number One" message "Node.js was not found. Install Node 22.5+ (see README)."'
  exit 1
fi

cd "$REPO" || exit 1
{
  echo "=== $(date) starting"
  # Rebuild only when the code changed since the last build.
  if [[ ! -f dist/index.html ]] || [[ -n "$(find src public index.html -newer dist/index.html -print -quit)" ]]; then
    npm run build || { osascript -e 'display alert "Bar Number One" message "Build failed, see ~/Library/Logs/BarNumberOne.log"'; exit 1; }
  fi
} >>"$LOG" 2>&1 || exit 1

PORT="$PORT" nohup node server/index.js >>"$LOG" 2>&1 &

# Wait up to ~15 s for the server to answer.
for _ in {1..30}; do
  serves_page "http://localhost:$PORT/" && open_app "http://localhost:$PORT/"
  sleep 0.5
done
osascript -e 'display alert "Bar Number One" message "The server did not start, see ~/Library/Logs/BarNumberOne.log"'
exit 1
