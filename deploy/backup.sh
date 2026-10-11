#!/bin/sh
# Ежедневный дамп Postgres в /backups. Старые файлы удаляются через BACKUP_KEEP_DAYS дней.
set -eu
KEEP="${BACKUP_KEEP_DAYS:-14}"
mkdir -p /backups
while true; do
  stamp="$(date +%Y-%m-%d_%H-%M)"
  if pg_dump --no-owner --format=custom --file="/backups/testonline-${stamp}.dump.tmp"; then
    mv "/backups/testonline-${stamp}.dump.tmp" "/backups/testonline-${stamp}.dump"
    echo "backup ok: testonline-${stamp}.dump"
  else
    echo "backup failed at ${stamp}" >&2
    rm -f "/backups/testonline-${stamp}.dump.tmp"
  fi
  find /backups -name 'testonline-*.dump' -mtime "+${KEEP}" -delete
  sleep 86400
done
