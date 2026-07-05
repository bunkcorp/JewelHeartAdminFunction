#!/usr/bin/env bash
# Register + install the self-hosted runner. Reads a token from stdin which may be
# either a runner *registration token* (from the Runners UI) or an admin *PAT*.
# No secrets are echoed.
set -euo pipefail
REPO="bunkcorp/JewelHeartAdminFunction"
read -r TOK || true
[ -n "${TOK:-}" ] || { echo "no token on stdin" >&2; exit 1; }
case "$TOK" in
  ghp_*|gho_*|github_pat_*)
    echo "detected PAT; minting registration token via API..."
    REG="$(curl -fsSL -X POST \
      -H "Authorization: Bearer $TOK" -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/$REPO/actions/runners/registration-token" \
      | sed -n 's/.*"token"[ ]*:[ ]*"\([^"]*\)".*/\1/p')"
    [ -n "$REG" ] || { echo "ERROR: mint failed (PAT lacks repo-admin)" >&2; exit 2; }
    ;;
  *)
    echo "using provided registration token directly"
    REG="$TOK"
    ;;
esac
cd "$HOME/actions-runner"
./config.sh --url "https://github.com/$REPO" --token "$REG" \
  --name laptop-karmadots --labels self-hosted,macOS,X64 --unattended --replace
./svc.sh install
./svc.sh start
echo RUNNER_CONFIGURED
