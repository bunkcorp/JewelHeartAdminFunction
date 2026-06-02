#!/usr/bin/env bash
# Verify production jewelheart.home SDUI (does not print your token).
# Setup (repo root, once):
#   echo 'YOUR_FIREBASE_ID_TOKEN' > .jewelheart-token
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="$ROOT/.jewelheart-token"
BASE="${JEWELHEART_API:-https://api.karmadots.org/jewelheart}"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Missing $TOKEN_FILE — paste a Firebase ID token from the admin app (Settings shows UID after sign-in)." >&2
  exit 1
fi

TOKEN="$(tr -d '\n\r' <"$TOKEN_FILE")"

body="$(curl -sS -m 30 -X POST "$BASE/sdui/screen" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"screenId":"jewelheart.home"}')"

printf '%s' "$body" | python3 -c "
import json, sys
d = json.load(sys.stdin)
screen = d.get('screen') or {}
sid = screen.get('id') or screen.get('screenId')
print('schemaVersion:', d.get('schemaVersion', d.get('version')))
print('screen.id:', sid)
print('screen.title:', screen.get('title'))

def walk(obj, texts, buttons):
    if isinstance(obj, dict):
        if obj.get('type') == 'text' and obj.get('content'):
            texts.append(str(obj['content']))
        if obj.get('type') == 'button':
            buttons.append(str(obj.get('label') or obj.get('content') or '?'))
        walk(obj.get('children'), texts, buttons)
    elif isinstance(obj, list):
        for x in obj:
            walk(x, texts, buttons)

texts, buttons = [], []
walk(screen.get('components'), texts, buttons)
print('text_samples:', texts[:6])
print('buttons:', buttons)

legacy = any('Retreat volunteer scheduling' in t for t in texts) or 'Retreats' in buttons
volunteer = any('Volunteer Home' in t for t in texts)
if legacy:
    print('STATUS: OLD home hub (Retreats/Docs) — redeploy private-server and restart Node.')
elif volunteer:
    print('STATUS: OK — volunteer home bars present.')
else:
    print('STATUS: UNKNOWN — inspect response above.')
"
