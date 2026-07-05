#!/usr/bin/env bash
set -euo pipefail
REPO="${1:-$HOME/Desktop/buddhist-stone-ios-app}"
if [[ ! -d "$REPO/.git" ]]; then
  REPO="$HOME/dev/buddhist-stone-ios-app"
fi
if [[ ! -d "$REPO/.git" ]]; then
  echo "No buddhist-stone-ios-app clone found" >&2
  exit 1
fi
cd "$REPO"
git fetch origin
git checkout main
git pull origin main
cp /tmp/jh-login-deploy/index.html docs/login/index.html
cp /tmp/jh-login-deploy/jewelheart-admin.css docs/login/jewelheart-admin.css
cp /tmp/jh-login-deploy/jewelheart-sdui.js docs/login/jewelheart-sdui.js
git add docs/login/index.html docs/login/jewelheart-admin.css docs/login/jewelheart-sdui.js
if git diff --cached --quiet; then
  echo "No changes to commit"
else
  git commit -m "Deploy volunteer home split layout web renderer (v=20260622)."
fi
git push origin main
grep homeSplitLayout docs/login/jewelheart-sdui.js | head -1
