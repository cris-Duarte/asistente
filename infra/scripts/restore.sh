#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Uso: pnpm restore -- backups/productivity-YYYYMMDDTHHMMSSZ.sql.gz" >&2
  exit 1
fi

restart_services() {
  docker compose up -d electric api web >/dev/null
}

trap restart_services EXIT INT TERM
docker compose stop api web electric >/dev/null
gzip -dc "$1" | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-productivity}"
trap - EXIT INT TERM
restart_services
echo "Restauración completada desde $1"
