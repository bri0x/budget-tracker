#!/usr/bin/env sh
# Linux/macOS launcher: starts PocketBase if it isn't running, then opens the app.
cd "$(dirname "$0")" || exit 1

URL="http://127.0.0.1:8090"

if [ ! -x ./pocketbase ]; then
  echo "pocketbase binary not found (or not executable) in $(pwd)."
  echo "Download it from https://github.com/pocketbase/pocketbase/releases and run: chmod +x pocketbase"
  exit 1
fi

if ! pgrep -f "$(pwd)/pocketbase serve" >/dev/null 2>&1; then
  echo "Starting PocketBase..."
  nohup "$(pwd)/pocketbase" serve >pocketbase.log 2>&1 &
  sleep 2
fi

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open "$URL"
else
  echo "Open $URL in your browser."
fi
