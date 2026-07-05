#!/usr/bin/env bash
# Configure + install the self-hosted runner. Reads a GitHub token (PAT/OAuth with
# repo-admin scope) from stdin, mints a short-lived registration token via the API,
# then configures and installs the runner as a user service. No secrets are echoed.
set -euo pipefail
REPO="bunkcorp/JewelHeartAdminFunction"
read -r PAT || true
[ -n "${PAT:-}" ] || { echo "no token on stdin" >&2; exit 1; }

REGTOKEN="$(curl -fsSL -X POST \
  -H "Authorization: Bearer $PAT" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/actions/runners/registration-token" \
  | sed -n 's/.*"token"[ ]*:[ ]*"\([^"]*\)".*/\1/p')"
if [ -z "$REGTOKEN" ]; then
  echo "ERROR: could not mint registration token (token may lack admin scope on $REPO)" >&2
  exit 2
fi
echo "minted registration token (length ${#REGTOKEN})"

cd "$HOME/actions-runner"
./config.sh --url "https://github.com/$REPO" --token "$REGTOKEN" \
  --name laptop-karmadots --labels self-hosted,macOS,X64 --unattended --replace
./svc.sh install
./svc.sh start
echo "RUNNER_CONFIGURED"
