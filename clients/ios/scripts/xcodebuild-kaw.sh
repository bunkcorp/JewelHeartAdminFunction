#!/usr/bin/env bash
# Build (or clean build) JewelHeartAdmin for a physical iPhone named "KAW".
# Connect KAW via USB or same Wi‑Fi (paired for development), unlock the phone.
#
# Usage (from anywhere):
#   ./clients/ios/scripts/xcodebuild-kaw.sh build
#   ./clients/ios/scripts/xcodebuild-kaw.sh clean build
#
# Override destination:
#   JEWELHEART_IOS_DEST="platform=iOS,name=Jennys Phone" ./clients/ios/scripts/xcodebuild-kaw.sh build

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DEST="${JEWELHEART_IOS_DEST:-platform=iOS,name=KAW}"

exec xcodebuild \
  -project JewelHeartAdmin.xcodeproj \
  -scheme JewelHeartAdmin \
  -configuration Debug \
  -destination "$DEST" \
  -allowProvisioningUpdates \
  "$@"
