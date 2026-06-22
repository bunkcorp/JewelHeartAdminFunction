#!/usr/bin/env bash
# KarmaDots multi-environment deploy/promote engine. Runs ON the laptop.
#
# Environments:
#   dev      -> ~/private-server-dev   port 3003   db karmadots_dev    label org.karmadots.private-server-dev
#   test     -> ~/private-server-test  port 3002   db karmadots_test   label org.karmadots.private-server-test
#   retreat  -> ~/private-server       port 3001   db karmadots        label org.karmadots.private-server
#
# Commands:
#   jh-deploy.sh restart  <env>
#   jh-deploy.sh patch-web <env>            # make public/login/index.html call its own API (same-origin)
#   jh-deploy.sh migrate  <env>             # apply not-yet-applied migrations/*.sql to <env> db
#   jh-deploy.sh baseline                   # mark current migrations as already-applied in all 3 dbs
#   jh-deploy.sh backup   <env>             # tar code + pg_dump db into ~/jh-backups/<env>-<ts>/
#   jh-deploy.sh promote  <from> <to> [--migrate]
#
# Notes:
#   - Promotion copies CODE only (rsync); each env keeps its own .env (PORT + DATABASE_URL) and data.
#   - Promoting INTO retreat takes an automatic backup first (code + db) for rollback.
set -euo pipefail

PSQL="/usr/local/opt/postgresql@16/bin/psql"
PGDUMP="/usr/local/opt/postgresql@16/bin/pg_dump"
LA="$HOME/Library/LaunchAgents"
BACKUP_ROOT="$HOME/jh-backups"

die(){ echo "ERROR: $*" >&2; exit 1; }

env_dir(){ case "$1" in
  dev) echo "$HOME/private-server-dev";;
  test) echo "$HOME/private-server-test";;
  retreat|prod) echo "$HOME/private-server";;
  *) die "unknown env: $1";; esac; }
env_port(){ case "$1" in dev) echo 3003;; test) echo 3002;; retreat|prod) echo 3001;; *) die "unknown env: $1";; esac; }
env_db(){ case "$1" in dev) echo karmadots_dev;; test) echo karmadots_test;; retreat|prod) echo karmadots;; *) die "unknown env: $1";; esac; }
env_label(){ case "$1" in
  dev) echo org.karmadots.private-server-dev;;
  test) echo org.karmadots.private-server-test;;
  retreat|prod) echo org.karmadots.private-server;;
  *) die "unknown env: $1";; esac; }

db_url(){
  # Derive a DATABASE_URL for <env> by swapping the db name on retreat's .env (same host/creds).
  local base
  base="$(grep -E '^DATABASE_URL=' "$HOME/private-server/.env" | head -1 | sed 's/^DATABASE_URL=//')"
  [ -n "$base" ] || die "could not read DATABASE_URL from ~/private-server/.env"
  base="${base%/karmadots}"
  printf '%s/%s' "$base" "$(env_db "$1")"
}

restart_env(){
  local env="$1" label uid port i
  label="$(env_label "$env")"; uid="$(id -u)"; port="$(env_port "$env")"
  # bootstrap (load), enable (clear any 'disabled' override from a prior bootout), then force start.
  launchctl bootstrap "gui/$uid" "$LA/$label.plist" 2>/dev/null || true
  launchctl enable "gui/$uid/$label" 2>/dev/null || true
  launchctl kickstart -k "gui/$uid/$label" >/dev/null 2>&1 || die "kickstart failed for $env"
  for i in $(seq 1 40); do
    if lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      echo "[$env] listening on $port"; return 0
    fi
    sleep 1
  done
  die "[$env] did not start listening on $port within 40s"
}

patch_web(){
  local env="$1" dir f tmp
  dir="$(env_dir "$env")"; f="$dir/public/login/index.html"
  [ -f "$f" ] || { echo "[$env] no public/login/index.html"; return 0; }
  tmp="$(mktemp)"
  sed "s@const API = 'https://api.karmadots.org/jewelheart';@const API = (location.hostname.indexOf('api') === 0 ? location.origin : 'https://api.karmadots.org') + '/jewelheart';@" "$f" > "$tmp" && mv "$tmp" "$f"
  echo "[$env] web API base normalized to same-origin"
}

ensure_mig_table(){
  "$PSQL" "$1" -v ON_ERROR_STOP=1 -q -c \
    "CREATE TABLE IF NOT EXISTS jh_schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"
}

mig_applied(){ # url filename
  local n
  n="$("$PSQL" "$1" -tA -c "SELECT 1 FROM jh_schema_migrations WHERE filename = '$2' LIMIT 1")"
  [ "$n" = "1" ]
}

migrate_env(){
  local env="$1" dir url f base
  dir="$(env_dir "$env")"; url="$(db_url "$env")"
  ensure_mig_table "$url"
  [ -d "$dir/migrations" ] || { echo "[$env] no migrations dir"; return 0; }
  for f in "$dir"/migrations/*.sql; do
    [ -e "$f" ] || continue
    base="$(basename "$f")"
    if mig_applied "$url" "$base"; then continue; fi
    echo "[$env] applying migration $base"
    "$PSQL" "$url" -v ON_ERROR_STOP=1 -1 -f "$f"
    "$PSQL" "$url" -v ON_ERROR_STOP=1 -q -c "INSERT INTO jh_schema_migrations(filename) VALUES ('$base')"
  done
  echo "[$env] migrations up to date"
}

baseline_one(){
  local env="$1" dir url f base
  dir="$(env_dir "$env")"; url="$(db_url "$env")"
  ensure_mig_table "$url"
  [ -d "$dir/migrations" ] || { echo "[$env] no migrations dir"; return 0; }
  for f in "$dir"/migrations/*.sql; do
    [ -e "$f" ] || continue
    base="$(basename "$f")"
    "$PSQL" "$url" -v ON_ERROR_STOP=1 -q -c \
      "INSERT INTO jh_schema_migrations(filename) VALUES ('$base') ON CONFLICT (filename) DO NOTHING"
  done
  echo "[$env] baseline recorded"
}

backup_env(){
  local env="$1" dir url ts out
  dir="$(env_dir "$env")"; url="$(db_url "$env")"
  ts="$(date +%Y%m%d%H%M%S)"; out="$BACKUP_ROOT/$env-$ts"
  mkdir -p "$out"
  echo "[$env] backup code -> $out/code.tar.gz"
  tar -czf "$out/code.tar.gz" -C "$(dirname "$dir")" --exclude node_modules --exclude logs "$(basename "$dir")"
  echo "[$env] backup db ($(env_db "$env")) -> $out/db.sql"
  "$PGDUMP" "$url" --no-owner --no-privileges -f "$out/db.sql"
  echo "$out"
}

copy_if(){
  local src="$1" dest="$2" label="${3:-$1}"
  if [ -f "$src" ]; then
    cp "$src" "$dest"
    echo "[deploy-local] copied $label"
  else
    echo "[deploy-local] skip (not in repo): $label"
  fi
}

deploy_local(){
  # Deploy from a local repo checkout into <env> (used by the self-hosted CI runner).
  local repo="$1" env="${2:-dev}" do_mig="${3:-}" dir
  [ -n "${repo:-}" ] || die "usage: deploy-local <repo-root> [env] [--migrate]"
  dir="$(env_dir "$env")"
  [ -d "$repo" ] || die "repo root not found: $repo"
  [ -d "$dir" ] || die "env dir not found: $dir"
  copy_if "$repo/integrations/private-server/jewelheart-sdui-home.js" \
    "$dir/src/jewelheart/jewelheart-sdui-home.js" "jewelheart-sdui-home.js"
  copy_if "$repo/scripts/_prod-sdui.js" "$dir/public/login/jewelheart-sdui.js" "web jewelheart-sdui.js"
  copy_if "$repo/scripts/_prod-admin.css" "$dir/public/login/jewelheart-admin.css" "web jewelheart-admin.css"
  copy_if "$repo/scripts/_prod-index.html" "$dir/public/login/index.html" "web index.html"
  mkdir -p "$dir/migrations"
  cp "$repo"/migrations/*.sql "$dir/migrations/" 2>/dev/null || true
  patch_web "$env"
  if [ "${do_mig:-}" = "--migrate" ]; then migrate_env "$env"; fi
  restart_env "$env"
  echo "[deploy-local] $repo -> $env complete"
}

promote(){
  local from="$1" to="$2" do_mig="${3:-}" fdir tdir
  [ -n "${from:-}" ] && [ -n "${to:-}" ] || die "usage: promote <from> <to> [--migrate]"
  fdir="$(env_dir "$from")"; tdir="$(env_dir "$to")"
  [ -d "$fdir" ] || die "source dir missing: $fdir"
  [ -d "$tdir" ] || die "target dir missing: $tdir"
  if [ "$to" = "retreat" ] || [ "$to" = "prod" ]; then
    echo ">>> Promoting $from -> RETREAT (production). Taking backup first."
    backup_env retreat >/dev/null
  fi
  echo "[promote] rsync code $from -> $to"
  rsync -a \
    --exclude .env --exclude logs --exclude node_modules --exclude .git \
    --exclude 'jewelheart-sdui-home.js.bak.*' \
    "$fdir/" "$tdir/"
  patch_web "$to"
  if [ "${do_mig:-}" = "--migrate" ]; then migrate_env "$to"; fi
  restart_env "$to"
  echo "[promote] $from -> $to complete"
}

cmd="${1:-}"; [ "$#" -gt 0 ] && shift || true
case "$cmd" in
  restart)   [ "$#" -ge 1 ] || die "usage: restart <env>";   restart_env "$1";;
  patch-web) [ "$#" -ge 1 ] || die "usage: patch-web <env>"; patch_web "$1";;
  migrate)   [ "$#" -ge 1 ] || die "usage: migrate <env>";   migrate_env "$1";;
  baseline)  for e in dev test retreat; do baseline_one "$e"; done;;
  deploy-local) deploy_local "${1:-}" "${2:-dev}" "${3:-}";;
  backup)    [ "$#" -ge 1 ] || die "usage: backup <env>";    backup_env "$1";;
  promote)   promote "${1:-}" "${2:-}" "${3:-}";;
  *) echo "usage: jh-deploy.sh {restart|patch-web|migrate|backup} <env> | baseline | promote <from> <to> [--migrate]"; exit 1;;
esac
