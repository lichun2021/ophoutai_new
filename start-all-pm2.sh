#!/bin/bash
set -eo pipefail
export NVM_DIR=/root/.nvm
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  printf 'nvm is not installed at %s\n' "$NVM_DIR" >&2
  exit 1
fi
. "$NVM_DIR/nvm.sh"
nvm use --silent default
install -d -m 755 /data/logs
cd /data
pm2 startOrReload /data/ecosystem.config.js --update-env
exec pm2 save
