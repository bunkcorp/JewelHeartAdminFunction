#!/usr/bin/env bash
set -uo pipefail
read -r PAT || true
[ -n "${PAT:-}" ] || { echo "no token"; exit 1; }
curl -sS -H "Authorization: Bearer $PAT" \
  https://api.github.com/repos/bunkcorp/JewelHeartAdminFunction \
  | grep -o '"permissions":{[^}]*}'
