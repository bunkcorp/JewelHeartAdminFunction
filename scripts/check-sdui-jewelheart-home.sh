#!/usr/bin/env bash
# Verify production jewelheart.home SDUI (does not print your token).
# Setup (repo root, once per session):
#   echo 'YOUR_FIREBASE_ID_TOKEN' > .jewelheart-token
# (.jewelheart-token is gitignored.)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="$ROOT/.jewelheart-token"
BASE="${JEWELHEART_API:-https://api.karmadots.org/jewelheart}"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Missing $TOKEN_FILE — paste a Firebase ID token from the admin app (Settings shows UID after sign-in). See scripts/check-sdui-retreat-schedule.sh." >&2
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

def walk(obj, texts, buttons, styled):
    if isinstance(obj, dict):
        if obj.get('type') == 'text':
            content = obj.get('content')
            if content:
                texts.append(str(content))
            style = obj.get('style') or {}
            bg = style.get('backgroundColor')
            snippet = (content or '')[:60] if content else ''
            if bg or (snippet and ('Volunteer Home' in snippet or 'Retreat' in snippet)):
                styled.append((bg, snippet))
        if obj.get('type') == 'button':
            buttons.append(str(obj.get('label') or obj.get('content') or '?'))
        walk(obj.get('children'), texts, buttons, styled)
    elif isinstance(obj, list):
        for x in obj:
            walk(x, texts, buttons, styled)

texts, buttons, styled = [], [], []
walk(screen.get('components'), texts, buttons, styled)
print('text_samples:', texts[:6])
print('buttons:', buttons)
for bg, text in styled[:8]:
    print(' styled_text:', repr(text), 'bg:', bg)

blob = json.dumps(d)
legacy = any('Retreat volunteer scheduling' in t for t in texts) or 'Retreats' in buttons
volunteer = any('Volunteer Home' in t for t in texts)
colors = '#FFCA10' in blob or '#7A95CA' in blob

if sid and sid != 'jewelheart.home':
    print('WARNING: expected screen.id jewelheart.home')
if legacy:
    print('STATUS: OLD home hub (Retreats/Docs) — redeploy private-server and restart Node.')
elif volunteer or colors:
    print('STATUS: OK — volunteer home layout present.')
else:
    print('STATUS: UNKNOWN — inspect response above.')
"