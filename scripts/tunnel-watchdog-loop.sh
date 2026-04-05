#!/usr/bin/env bash
# Long-running loop: run tunnel-watchdog.sh every WATCHDOG_INTERVAL_SEC seconds (default 1).
# Use this from LaunchAgent with KeepAlive=true instead of StartInterval (avoids process spawn overhead).
set -eu

ROOT="${PRIVATE_SERVER_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
ROOT="$(cd "$ROOT" && pwd)"
SCRIPT="$ROOT/scripts/tunnel-watchdog.sh"

INTERVAL="${WATCHDOG_INTERVAL_SEC:-1}"
case "$INTERVAL" in
  '' | *[!0-9]*) INTERVAL=1 ;;
esac
if [[ "$INTERVAL" -lt 1 ]]; then
  INTERVAL=1
fi

export PATH="$ROOT/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

if [[ ! -x "$SCRIPT" ]] && [[ ! -f "$SCRIPT" ]]; then
  echo "tunnel-watchdog.sh not found: $SCRIPT" >&2
  exit 1
fi

# shellcheck disable=SC1090
while true; do
  /bin/bash "$SCRIPT" || true
  sleep "$INTERVAL"
done
