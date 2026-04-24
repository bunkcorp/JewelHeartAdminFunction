#!/usr/bin/env bash
# Call production SDUI retreat.schedule (does not print your token).
# Setup (repo root, once per session):
#   echo 'YOUR_FIREBASE_ID_TOKEN' > .jewelheart-token
#   echo 'RETREAT_UUID' > .jewelheart-test-retreat-id
# Both files are gitignored.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="$ROOT/.jewelheart-token"
RID_FILE="$ROOT/.jewelheart-test-retreat-id"
BASE="${JEWELHEART_API:-https://api.karmadots.org/jewelheart}"

if [[ ! -f "$TOKEN_FILE" || ! -f "$RID_FILE" ]]; then
  echo "Missing $TOKEN_FILE and/or $RID_FILE — see comments at top of this script." >&2
  exit 1
fi

TOKEN="$(tr -d '\n\r' <"$TOKEN_FILE")"
RID="$(tr -d '\n\r' <"$RID_FILE")"

body="$(curl -sS -m 30 -X POST "$BASE/sdui/screen" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"screenId\":\"retreat.schedule\",\"retreatId\":\"${RID}\"}")"

printf '%s' "$body" | python3 -c "
import json, sys
d = json.load(sys.stdin)
screen = d.get('screen') or {}
sid = screen.get('id') or screen.get('screenId')
print('schemaVersion:', d.get('schemaVersion', d.get('version')))
print('screen.id:', sid)
print('screen.title:', screen.get('title'))
comps = screen.get('components') or []

def count_buttons(obj):
    n = 0
    if isinstance(obj, dict):
        if obj.get('type') == 'button':
            n += 1
        n += count_buttons(obj.get('children'))
    elif isinstance(obj, list):
        for x in obj:
            n += count_buttons(x)
    return n

print('button_count (approx):', count_buttons(comps))
if sid != 'retreat.schedule':
    print('WARNING: expected screen.id retreat.schedule — server may be on an older deploy.')
"
