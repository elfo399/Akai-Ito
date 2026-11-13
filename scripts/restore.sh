#!/bin/sh
# Restore ONLY to a new named volume, leaving the current data intact.
set -eu
archive="${1:?Uso: sh scripts/restore.sh /percorso/backup.tar.gz nuovo-volume}"
volume="${2:?Indica un nuovo nome volume vuoto}"
case "$volume" in *[!a-zA-Z0-9_.-]*|'') printf 'Nome volume non valido\n' >&2; exit 1;; esac
if docker volume inspect "$volume" >/dev/null 2>&1; then printf 'Il volume esiste già. Scegline uno nuovo.\n' >&2; exit 1; fi
backup_dir=$(cd "$(dirname "$archive")" && pwd)
filename=$(basename "$archive")
(cd "$backup_dir" && sha256sum -c "$filename.sha256")
docker volume create "$volume" >/dev/null
docker compose run --rm --no-deps --user 0:0 -e BACKUP_FILE="$filename" -v "$volume:/restore" -v "$backup_dir:/backup:ro" app sh -c 'tar -xzf "/backup/$BACKUP_FILE" -C /restore && chown -R 1000:1000 /restore'
docker compose run --rm --no-deps -e DATA_DIR=/restore -v "$volume:/restore" app node apps/api/dist/cli.js verify
printf 'Ripristino verificato nel volume %s. Collegarlo tramite override Compose come documentato nel README.\n' "$volume"
