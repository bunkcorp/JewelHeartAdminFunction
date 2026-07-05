#!/usr/bin/env bash
# Diagnose a GitHub token's ability to manage self-hosted runners. Reads token from stdin.
set -uo pipefail
REPO="bunkcorp/JewelHeartAdminFunction"
read -r PAT || true
[ -n "${PAT:-}" ] || { echo "no token on stdin"; exit 1; }
echo "TOKEN_PREFIX=${PAT:0:4}"
echo "--- /user (scopes + sso) ---"
curl -sS -D - -o /dev/null -H "Authorization: Bearer $PAT" https://api.github.com/user \
  | grep -i -E "^HTTP|x-oauth-scopes|x-github-sso"
echo "--- repo admin? ---"
curl -sS -H "Authorization: Bearer $PAT" "https://api.github.com/repos/$REPO" \
  | sed -n 's/.*"admin"[ ]*:[ ]*\(true\|false\).*/repo_admin=\1/p' | head -1
echo "--- registration-token attempt ---"
curl -sS -D - -o /dev/null -X POST -H "Authorization: Bearer $PAT" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/actions/runners/registration-token" \
  | grep -i -E "^HTTP|x-github-sso|x-accepted-github-permissions"
