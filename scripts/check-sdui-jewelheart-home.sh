#!/usr/bin/env bash
# Call production SDUI jewelheart.home (does not print your token).
# Setup (repo root, once per session):
#   echo 'YOUR_FIREBASE_ID_TOKEN' > .jewelheart-token
# Both files are gitignored.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="$ROOT/.jewelheart-token"
BASE="${JEWELHEART_API:-https://api.karmadots.org/jewelheart}"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Missing $TOKEN_FILE — see scripts/check-sdui-retreat-schedule.sh" >&2
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
comps = screen.get('components') or []

def walk(obj, out):
    if isinstance(obj, dict):
        if obj.get('type') == 'text':
            style = obj.get('style') or {}
            bg = style.get('backgroundColor')
            content = (obj.get('content') or '')[:60]
            if bg or 'Volunteer Home' in content or 'Retreat' in content:
                out.append((bg, content))
        walk(obj.get('children'), out)
    elif isinstance(obj, list):
        for x in obj:
            walk(x, out)

lines = []
walk(comps, lines)
for bg, text in lines[:8]:
    print(' text:', repr(text), 'bg:', bg)

blob = json.dumps(d)
if '#FFCA10' in blob or '#7A95CA' in blob:
    print('OK: volunteer home colors present (deployed layout).')
elif 'Retreat volunteer scheduling' in blob or 'pick a section' in blob:
    print('WARNING: old home hub copy — deploy jewelheartHomeSdui to sduiScreens.js.')
else:
    print('NOTE: could not detect layout; inspect JSON manually.')
if sid != 'jewelheart.home':
    print('WARNING: expected screen.id jewelheart.home')
"
