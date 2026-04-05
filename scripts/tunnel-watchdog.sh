#!/usr/bin/env bash
# Periodic check: if private-server is healthy locally but the Cloudflare tunnel is missing,
# public GET fails, or POST /sdui/screen fails at the edge (502 while GET /health is cached OK),
# restart org.karmadots.cloudflare-tunnel.
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

# Same host as health; unauthenticated POST must be 401 — 502/530 means edge/tunnel path broken.
API_BASE="${PUBLIC%/jewelheart/health}"
SDUI_POST="${API_BASE}/jewelheart/sdui/screen"

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
  # Hung cloudflared often ignores kickstart -k; kill the connector so LaunchAgent spawns a fresh one.
  pkill -f "cloudflared tunnel.*${TUNNEL_NAME}" 2>/dev/null || true
  sleep 2
  _k="$(launchctl kickstart -k "$AGENT_LABEL" 2>&1)" || true
  if [[ -n "$_k" ]]; then log "kickstart: $_k"; fi
}

if ! curl -sf --max-time 8 "$ORIGIN" | grep -q '"ok"'; then
  log "origin unhealthy, skip tunnel restart: $ORIGIN"
  exit 0
fi

info_out="$("$CF" tunnel info "$TUNNEL_NAME" 2>&1)"
info_ec=$?

if [[ $info_ec -ne 0 ]]; then
  restart_tunnel "cloudflared tunnel info failed (exit $info_ec); restarting tunnel agent"
  exit 0
fi

if echo "$info_out" | grep -qiE 'no active connection|no active connectors'; then
  restart_tunnel "no active connector for $TUNNEL_NAME; restarting tunnel agent"
  exit 0
fi

if ! curl -sf --max-time 20 "$PUBLIC" | grep -q '"ok"'; then
  restart_tunnel "public GET health failed; restarting tunnel agent: $PUBLIC"
  exit 0
fi

post_code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 -X POST "$SDUI_POST" \
  -H "Content-Type: application/json" \
  -d '{"screenId":"jewelheart.home"}')"
post_ec=$?

if [[ $post_ec -ne 0 ]]; then
  restart_tunnel "POST $SDUI_POST curl failed (exit $post_ec); restarting tunnel agent"
  exit 0
fi

# Without Authorization, private-server should return 401. Anything else at the edge is a tunnel/proxy problem.
if [[ "$post_code" != "401" ]]; then
  case "$post_code" in
    502|530|520|521|522|523|524|525)
      restart_tunnel "POST sdui/screen edge HTTP $post_code; restarting tunnel agent"
      ;;
    *)
      log "POST sdui/screen HTTP $post_code (unexpected but not restarting tunnel)"
      ;;
  esac
fi

exit 0
