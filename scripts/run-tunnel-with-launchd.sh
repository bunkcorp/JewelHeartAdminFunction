#!/usr/bin/env bash
# LaunchAgent wrapper: Cloudflare Tunnel for api.karmadots.org → local private-server.
# Copy to private-server/scripts/ (or keep in sync). Requires ~/.cloudflared/config.yml + credentials.
#
# QUIC (default in recent cloudflared) often hits "timeout: no recent network activity" on some
# home Wi‑Fi / sleep / UDP paths; HTTP/2 over TCP is far more stable for long-lived tunnels.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$ROOT/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

exec cloudflared tunnel --protocol http2 --retries 8 run karmadots
