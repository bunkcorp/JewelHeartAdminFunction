#!/usr/bin/env bash
# Periodic check: if private-server is healthy locally but the Cloudflare tunnel is missing
# or the public hostname fails, restart org.karmadots.cloudflare-tunnel via launchctl.
# Intended for LaunchAgent StartInterval (see org.karmadots.tunnel-watchdog.plist.example).
set -u

ROOT="${PRIVATE_SERVER_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
ROOT="$(cd "$ROOT" && pwd)"

PORT=3001
if [[ -f "$ROOT/.env" ]]; then
  _line="$( { grep -E '^[[:space:]]*PORT=' "$ROOT/.env" 2>/dev/null || true; } | tail -1 )"
  if [[ -n "$_line" ]]; then
    PORT="${_line#*=}"
    PORT="${PORT//\"/}"
    PORT="${PORT//\'/}"
    PORT="${PORT// /}"
  fi
fi

ORIGIN="${ORIGIN_HEALTH_URL:-http://127.0.0.1:${PORT}/jewelheart/health}"
PUBLIC="${PUBLIC_HEALTH_URL:-https://api.karmadots.org/jewelheart/health}"
TUNNEL_NAME="${CLOUDFLARE_TUNNEL_NAME:-karmadots}"
AGENT_LABEL="gui/$(id -u)/org.karmadots.cloudflare-tunnel"

export PATH="$ROOT/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
CF="$(command -v cloudflared 2>/dev/null || true)"
if [[ -z "$CF" ]]; then
  CF="/usr/local/bin/cloudflared"
fi

log() {
  logger -t org.karmadots.tunnel-watchdog "$*"
}

restart_tunnel() {
  log "$1"
  _k="$(launchctl kickstart -k "$AGENT_LABEL" 2>&1)" || true
  [[ -n "$_k" ]] && log "kickstart: $_k"
}

if ! curl -sf --max-time 8 "$ORIGIN" | grep -q '"ok"'; then
  log "origin unhealthy, skip tunnel restart: $ORIGIN"
  exit 0
fi

set +e
info_out="$("$CF" tunnel info "$TUNNEL_NAME" 2>&1)"
info_ec=$?
set -e

if [[ $info_ec -ne 0 ]]; then
  restart_tunnel "cloudflared tunnel info failed (exit $info_ec); restarting tunnel agent"
  exit 0
fi

if echo "$info_out" | grep -qiE 'no active connection|no active connectors'; then
  restart_tunnel "no active connector for $TUNNEL_NAME; restarting tunnel agent"
  exit 0
fi

if ! curl -sf --max-time 20 "$PUBLIC" | grep -q '"ok"'; then
  restart_tunnel "public health failed (502/530/origin path); restarting tunnel agent: $PUBLIC"
  exit 0
fi

exit 0
