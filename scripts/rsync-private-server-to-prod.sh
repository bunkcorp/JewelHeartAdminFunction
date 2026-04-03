#!/usr/bin/env bash
# Sync local private-server to production laptop (or any SSH host).
#
# Usage:
#   export JEWELHEART_DEPLOY_SSH="you@Kevins-MacBook-Pro-2.local"
#   export JEWELHEART_PRIVATE_SERVER_SRC="$HOME/Desktop/buddhist-stone-ios-app/private-server"
#   ./scripts/rsync-private-server-to-prod.sh
#
# Omits node_modules and .env; does not use --delete (remote extras are left alone).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${JEWELHEART_PRIVATE_SERVER_SRC:-$HOME/Desktop/buddhist-stone-ios-app/private-server}"
DEST="${JEWELHEART_DEPLOY_SSH:?Set JEWELHEART_DEPLOY_SSH, e.g. you@host}:~/private-server/"

if [[ ! -d "$SRC" ]]; then
  echo "Source not found: $SRC" >&2
  echo "Set JEWELHEART_PRIVATE_SERVER_SRC to your private-server path." >&2
  exit 1
fi

echo "Rsync $SRC -> $DEST"
rsync -avz \
  --exclude node_modules \
  --exclude .env \
  --exclude '.git' \
  "$SRC/" "$DEST"

echo "Done. On the server: cd ~/private-server && npm ci && (restart your process manager / pm2 / launchd as you use)."
