#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/excel-data-processor}"
PM2_SERVICES="${PM2_SERVICES:-sapa.kemenkopmk-auth sapa.kemenkopmk-activity sapa.kemenkopmk-wa-webhook}"

log() {
  printf '[deploy] %s\n' "$*" >&2
}

trap 'log "Deployment failed."' ERR

log "Starting production deploy from $ROOT_DIR"

cd "$ROOT_DIR"

if [[ "${SKIP_INSTALL:-0}" != "1" ]]; then
  log "Installing dependencies (npm ci)"
  npm ci
else
  log "Skipping dependency installation (SKIP_INSTALL=1)"
fi

log "Building frontend bundle (npm run build)"
npm run build

log "Syncing dist/ to $WEB_ROOT"
mkdir -p "$WEB_ROOT"
rsync -av --delete "$ROOT_DIR/dist/" "$WEB_ROOT/"

if command -v pm2 >/dev/null 2>&1; then
  for service in $PM2_SERVICES; do
    if pm2 describe "$service" >/dev/null 2>&1; then
      log "Reloading PM2 service: $service"
      pm2 reload "$service"
    else
      log "Service $service not found; starting via ecosystem.config.cjs"
      pm2 start ecosystem.config.cjs --only "$service"
    fi
  done
  log "Saving PM2 process list"
  pm2 save
else
  log "PM2 not found; skipping process restart"
fi

log "Deployment completed successfully."
