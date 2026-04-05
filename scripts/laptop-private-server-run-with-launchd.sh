#!/usr/bin/env zsh
# LaunchAgent wrapper: NVM → absolute node path, optional stale listener cleanup, then exec server.
set -eu

ROOT="${PRIVATE_SERVER_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
ROOT="$(cd "$ROOT" && pwd)"
cd "$ROOT"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  . "$NVM_DIR/nvm.sh"
  command -v nvm >/dev/null 2>&1 && nvm use default >/dev/null 2>&1 || true
fi

NODE_BIN="$(command -v node 2>/dev/null || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [run-with-launchd] node not found (check NVM_DIR / nvm default)" >&2
  exit 127
fi

PORT=3000
if [[ -f "$ROOT/.env" ]]; then
  _line="$( { grep -E "^[[:space:]]*PORT=" "$ROOT/.env" 2>/dev/null || true; } | tail -1 )"
  if [[ -n "$_line" ]]; then
    PORT="${_line#*=}"
    PORT="${PORT//\"/}"
    PORT="${PORT//\'/}"
    PORT="${PORT// /}"
  fi
fi

for pid in $(lsof -t -iTCP:"$PORT" -sTCP:LISTEN -n -P 2>/dev/null || true); do
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  if [[ "$cmd" == *"src/index.js"* ]] || [[ "$cmd" == *"private-server"* ]]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [run-with-launchd] stopping prior listener pid=$pid port=$PORT" >&2
    kill -TERM "$pid" 2>/dev/null || true
  fi
done
sleep 3

exec "$NODE_BIN" src/index.js
