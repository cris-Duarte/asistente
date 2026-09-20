#!/bin/sh
set -eu

backup_dir=${BACKUP_DIR:-backups}
mkdir -p "$backup_dir"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
output="$backup_dir/productivity-$timestamp.sql.gz"
docker compose exec -T postgres pg_dump --clean --if-exists --no-publications -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-productivity}" | gzip > "$output"
echo "$output"
