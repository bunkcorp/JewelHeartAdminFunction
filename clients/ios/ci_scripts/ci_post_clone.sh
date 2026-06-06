#!/bin/sh
# Xcode Cloud: materialize GoogleService-Info.plist from a workflow secret (not in git).
#
# In App Store Connect → Xcode Cloud → Workflow → Environment:
#   Name:  GOOGLE_SERVICE_INFO_PLIST_BASE64
#   Secret: base64 of clients/ios/GoogleService-Info.plist
#   (on Mac: base64 -i clients/ios/GoogleService-Info.plist | pbcopy)
set -eu

PLIST_PATH="${CI_PRIMARY_REPOSITORY_PATH}/clients/ios/GoogleService-Info.plist"

if [ -z "${GOOGLE_SERVICE_INFO_PLIST_BASE64:-}" ]; then
  echo "error: GOOGLE_SERVICE_INFO_PLIST_BASE64 is not set in the Xcode Cloud workflow environment." >&2
  echo "Add the base64-encoded GoogleService-Info.plist as a secret variable, then rebuild." >&2
  exit 1
fi

echo "Writing GoogleService-Info.plist for Xcode Cloud build…"
echo "$GOOGLE_SERVICE_INFO_PLIST_BASE64" | base64 --decode > "$PLIST_PATH"
chmod 600 "$PLIST_PATH"
