#!/usr/bin/env bash
# One-shot: copy tunnel watchdog + run scripts into PRIVATE_SERVER_DIR, install LaunchAgents,
# reload org.karmadots.cloudflare-tunnel, org.karmadots.tunnel-watchdog, org.karmadots.mac-stay-awake.
#
# Usage:
#   ./scripts/deploy-karmadots-launchagents.sh /path/to/private-server
#   PRIVATE_SERVER_DIR=/path/to/private-server ./scripts/deploy-karmadots-launchagents.sh
#
# Run from Terminal.app (not over SSH) on the Mac that runs cloudflared. If the repo lives on
# Desktop, grant Terminal “Full Disk Access” or “Files and Folders” if macOS blocks scripts.
set -euo pipefail

# Parent of scripts/ (JewelHeartAdminFunction when run from that repo, or private-server when this file lives there).
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PS_DIR="${1:-${PRIVATE_SERVER_DIR:-}}"

if [[ -z "$PS_DIR" ]] || [[ ! -d "$PS_DIR" ]]; then
  echo "Usage: $0 /path/to/private-server" >&2
  echo "   or: PRIVATE_SERVER_DIR=/path/to/private-server $0" >&2
  exit 1
fi

PS_DIR="$(cd "$PS_DIR" && pwd)"
AGENT_DIR="${HOME}/Library/LaunchAgents"
mkdir -p "$PS_DIR/logs" "$AGENT_DIR"

if [[ "$REPO" != "$PS_DIR" ]]; then
  for f in tunnel-watchdog.sh tunnel-watchdog-loop.sh run-tunnel-with-launchd.sh; do
    cp "$REPO/scripts/$f" "$PS_DIR/scripts/$f"
  done
fi
chmod +x "$PS_DIR/scripts/tunnel-watchdog.sh" "$PS_DIR/scripts/tunnel-watchdog-loop.sh" "$PS_DIR/scripts/run-tunnel-with-launchd.sh"
# Clear quarantine flags that can block launchd from executing scripts under some paths.
xattr -cr "$PS_DIR/scripts" 2>/dev/null || true

cp "$PS_DIR/scripts/org.karmadots.mac-stay-awake.plist.example" "$AGENT_DIR/org.karmadots.mac-stay-awake.plist"
/usr/libexec/PlistBuddy -c "Set :StandardOutPath $PS_DIR/logs/stay-awake-stdout.log" "$AGENT_DIR/org.karmadots.mac-stay-awake.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :StandardErrorPath $PS_DIR/logs/stay-awake-stderr.log" "$AGENT_DIR/org.karmadots.mac-stay-awake.plist" 2>/dev/null || true

cat > "$AGENT_DIR/org.karmadots.tunnel-watchdog.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>org.karmadots.tunnel-watchdog</string>
	<key>ProgramArguments</key>
	<array>
		<string>/bin/bash</string>
		<string>${PS_DIR}/scripts/tunnel-watchdog-loop.sh</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PRIVATE_SERVER_DIR</key>
		<string>${PS_DIR}</string>
		<key>WATCHDOG_INTERVAL_SEC</key>
		<string>1</string>
	</dict>
	<key>WorkingDirectory</key>
	<string>${PS_DIR}</string>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>${PS_DIR}/logs/tunnel-watchdog-stdout.log</string>
	<key>StandardErrorPath</key>
	<string>${PS_DIR}/logs/tunnel-watchdog-stderr.log</string>
</dict>
</plist>
EOF

cat > "$AGENT_DIR/org.karmadots.cloudflare-tunnel.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>org.karmadots.cloudflare-tunnel</string>
	<key>ProgramArguments</key>
	<array>
		<string>/bin/bash</string>
		<string>${PS_DIR}/scripts/run-tunnel-with-launchd.sh</string>
	</array>
	<key>WorkingDirectory</key>
	<string>${PS_DIR}</string>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>ThrottleInterval</key>
	<integer>1</integer>
	<key>StandardOutPath</key>
	<string>${PS_DIR}/logs/tunnel-stdout.log</string>
	<key>StandardErrorPath</key>
	<string>${PS_DIR}/logs/tunnel-stderr.log</string>
</dict>
</plist>
EOF

reload() {
  local label="$1"
  local plist="$AGENT_DIR/${label}.plist"
  launchctl unload "$plist" 2>/dev/null || true
  launchctl load "$plist"
}

reload org.karmadots.cloudflare-tunnel
reload org.karmadots.tunnel-watchdog
reload org.karmadots.mac-stay-awake

echo "Installed for PRIVATE_SERVER_DIR=$PS_DIR"
launchctl list | grep org.karmadots || true
echo ""
echo "If LaunchAgents show status 78/126 or logs say Operation not permitted, run this script from"
echo "Terminal.app (not over SSH) and ensure the repo/private-server path is allowed (Desktop may need Full Disk Access for Terminal)."
