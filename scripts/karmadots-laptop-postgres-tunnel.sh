#!/usr/bin/env bash
# Option A: forward dev Mac localhost -> Postgres on the laptop (same DB private-server uses there).
#
# Usage (dedicated terminal; leave running while you develop):
#   ./scripts/karmadots-laptop-postgres-tunnel.sh
#
# Then in another terminal, point private-server at the tunnel, e.g.:
#   export DATABASE_URL="postgresql://YOUR_DB_USER@127.0.0.1:${TUNNEL_LOCAL_PORT:-5433}/karmadots"
#   (match user and database name from laptop ~/private-server/.env)
#
# Env overrides:
#   KARMADOTS_SSH_HOST   SSH config Host (default: laptop)
#   TUNNEL_LOCAL_PORT    Local port on dev Mac (default: 5433)

set -euo pipefail
PORT="${TUNNEL_LOCAL_PORT:-5433}"
SSH_HOST="${KARMADOTS_SSH_HOST:-laptop}"

echo "SSH tunnel: 127.0.0.1:${PORT} -> ${SSH_HOST}:127.0.0.1:5432 (laptop Postgres)"
echo "Leave this terminal open. In another shell set DATABASE_URL, e.g.:"
echo "  export DATABASE_URL=postgresql://\${USER}@127.0.0.1:${PORT}/karmadots"
echo "(Use the same DB user and database name as on the laptop .env.)"
echo ""
exec ssh -N -L "127.0.0.1:${PORT}:127.0.0.1:5432" "$SSH_HOST"
