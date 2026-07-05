#!/usr/bin/env bash
# Download + extract the GitHub Actions self-hosted runner on the laptop (osx-x64).
# Idempotent: skips download if already extracted.
set -euo pipefail
DIR="$HOME/actions-runner"
mkdir -p "$DIR"; cd "$DIR"
if [ -f "./config.sh" ]; then
  echo "runner already extracted at $DIR"
  exit 0
fi
VER="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -1)"
[ -n "$VER" ] || { echo "could not determine latest runner version" >&2; exit 1; }
echo "runner version: $VER"
FILE="actions-runner-osx-x64-$VER.tar.gz"
echo "downloading $FILE ..."
curl -fsSL -o "$FILE" "https://github.com/actions/runner/releases/download/v$VER/$FILE"
tar xzf "$FILE"
rm -f "$FILE"
echo "extracted to $DIR"
ls config.sh run.sh svc.sh
